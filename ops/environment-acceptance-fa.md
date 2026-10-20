# پذیرش محیط S3، قبل از تغییر زنده

تاریخ پایه: ۲۰۲۶-۱۰-۱۱؛ تطبیق بکاپ و پاسخ‌گویی P04 در ۲۰۲۶-۱۰-۲۰. این سند برنامهٔ اجرایی و معیار پذیرش است؛ اجرای Deployment، Migration، ارتقای Postgres، ساخت پروژه یا ارسال Telegram را مجاز/انجام‌شده اعلام نمی‌کند.

## شواهد فعلی و محدودیت

- در خواندن ۲۰ اکتبر، `main` همچنان `73868949c34e581af636e8ef2d4fc36fb3c42321` است؛ نامزد یکپارچه در Draft PR80 است. اصلاحات بکاپ P03 هنوز روی main اجرا نمی‌شوند.
- [بکاپ ۲۰ اکتبر](https://github.com/mehranyahya/project-genesis/actions/runs/39386878730) Dump/Drill محدود/Encrypt/Artifact موفق دارد، اما R2 و Monitor هر دو skipped هستند. فرادادهٔ دو Artifact اخیر، انقضای ۲۶ و ۲۷ اکتبر را نشان می‌دهد؛ دو Artifact در یک حساب، دو کپی ماندگار مستقل نیستند. بایت‌ها و کلید اصلی در P04 دریافت/آزموده نشدند.
- بررسی تازهٔ P04 فقط‌خواندنی بود: Policy ثبت درخواست یک ردیف و `false`، درخواست صفر، Auth user و Storage object صفر؛ چهار Boolean دامنه/نقش/Bucket/Restore در Preflight فعلی معتبرند. صفر بودن صف، آزمون تحویل یا پاسخ انسانی نیست. نسخهٔ SQL همچنان ۱۷٫۶ است؛ جدول Policy پیامک هنوز وجود ندارد.
- [بکاپ 38126012981](https://github.com/mehranyahya/project-genesis/actions/runs/38126012981) در ۱۱ اکتبر موفق است، ولی گام R2 و مانیتور Skip شدند. بکاپ‌های ۹ و ۱۰ اکتبر هم success گزارش شده‌اند. تعداد روزهای موفق، Decrypt مستقل و بازیابی فایل‌های Storage را اثبات نمی‌کند.
- در نوبت تکمیلی ۱۱ اکتبر، اتصال برقرار و ممیزی فقط‌خواندنی انجام شد: نسخهٔ SQL، ۱۷٫۶ و فرادادهٔ پروژه، 17.6.1.155؛ دسترسی مؤثر anon/authenticated به جدول/تابع/Sequence موجود صفر؛ ۱۲ جدول RLS+FORCE دارند. Object و کاربر Auth صفرند؛ Preview مستقل در فهرست این اتصال دیده نشد. Default ACL تابع تازه برای سه سازنده PUBLIC EXECUTE دارد و supabase_admin Grant گسترده‌تر دارد. [شواهد زنده](../docs/security-environment-live-audit-s3-fa.md) و [Snapshot امن](../docs/security-s3-live-audit-20261011.json) جزئیات را ثبت می‌کنند. Auth config، Secret/Scope، MFA اپراتور، Retention و تنظیمات Cloudflare بررسی نشده‌اند.
- کد جدید آفلاین آزموده می‌شود. وجود/Scope کلید واقعی، Access، مقصد اطلاع‌رسانی و بازیابی واقعی هنوز شرط پذیرش‌اند. مشاهدات ۱۱ اکتبر پایین تاریخچه‌اند؛ وجود Preview مستقل در P03 تأیید شد، اما Migration و Edge آن صفر بودند و هنوز پذیرش نشده است.

## ۱. هویت جدا برای Preview و Production

این هشت Repository Variable لازم‌اند؛ مقادیر واقعی در گزارش/PR نوشته نمی‌شوند:

| Preview                        | Production                        | قرارداد                                                            |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------ |
| `PREVIEW_WORKER_NAME`          | `PRODUCTION_WORKER_NAME`          | متفاوت؛ نام کوچک ۲ تا ۵۵ کاراکتر، مناسب `staging-<worker>`         |
| `PREVIEW_SUPABASE_PROJECT_REF` | `PRODUCTION_SUPABASE_PROJECT_REF` | دو Reference مستقل؛ قرارداد فعلی پروژه‌های استاندارد `supabase.co` |
| `PREVIEW_SITE_URL`             | `PRODUCTION_SITE_URL`             | Origin عمومی HTTPS، بدون Credential/Path/Query/Port غیرپیش‌فرض     |
| `PREVIEW_ALLOWED_ORIGINS`      | `PRODUCTION_ALLOWED_ORIGINS`      | شامل Origin خودش؛ بدون اشتراک، ورودی خالی یا تکراری                |

پیش از دریافت محتوا، Workflow تطبیق URL پروژهٔ Build و Edge با مقصد انتخابی و استقلال تمام کلیدهای Gateway، کلید Build، IP hash و Site key را کنترل می‌کند. فقط تفاوت نام Secret کافی نیست. `OTHER_*` فقط در گام بررسی استفاده می‌شوند؛ در فایل چهار Secret محدود Worker، Config یا خروجی عمومی قرار نمی‌گیرند. کلیدهای واقعی باید به همان پروژه و کاربرد تعلق داشته باشند؛ مقایسهٔ مقدار، معتبر بودن یا Scope کلید را ثابت نمی‌کند.

Config مقصد، نام Worker و چهار Var مجاز را صریح می‌نویسد؛ `--keep-vars` حذف شد تا Var بررسی‌نشدهٔ داشبورد باقی نماند. Secretهای خارج از فایل همچنان ممکن است در Worker قدیمی بمانند؛ فهرست نام/Scope آن‌ها باید جدا بازبینی شود.

Preview در Artifact، Route/Env ارث‌رسیده ندارد، Cron آن خالی است و Namespace محدودکننده با Production فرق دارد. فقط URL نسخه در نظر گرفته شده؛ `versions upload` تنظیمات جاری Route/Cron/Access یک Worker موجود را پاک یا اثبات نمی‌کند. پیش از اولین Upload مجاز باید Worker آزمایشیِ مستقل، بدون Route/دامنه/Cron تولید و بدون اتصال به پروژهٔ واقعی، از سمت Cloudflare بررسی شود. راه‌اندازی اولیهٔ آن اقدام زندهٔ جداست؛ Workflow پنهانی آن را انجام نمی‌دهد.

### پذیرش واقعی Preview

- [ ] پروژهٔ آزمایشی مستقل با داده و رسانهٔ مصنوعی/مجاز؛ هیچ مشتری واقعی کپی نشود.
- [ ] Build و Edge به همان پروژهٔ آزمایشی اشاره کنند؛ ACL/Storage/Terms همان محیط بررسی شوند.
- [ ] Worker و نسخهٔ مقصد، همهٔ Bindingها، Token و Scope واقعی تطبیق داده شوند؛ هیچ Binding اضافهٔ ممتاز باقی نماند.
- [ ] URL نسخه با Cloudflare Access محدود شود؛ ورود عضو مجاز موفق و دسترسی ناشناس مسدود باشد. `noindex` و robots کنترل دسترسی نیستند.
- [ ] همان Origin واقعی برای UI، CORS، Gateway و Hostname/Action Turnstile پذیرفته باشد.
- [ ] Bot/Chat و Prefix پیگیری آزمایشی از Production مستقل باشند. Cron خالی جای بررسی مقصد Edge را نمی‌گیرد.
- [ ] پیش‌آزمون ایمنی با `request_rate_limit_policy.enabled=false`: رد دسترسی ناشناس، تطبیق مقصد/کلید، Origin، Turnstile و محدودکنندهٔ Worker؛ ورودی تازه با Policy خاموش نباید کد موفقیت بگیرد. رد ذخیره‌سازی با ۵۰۳ در این وضعیت، رفتار ایمنِ مورد انتظار است.
- [ ] پس از پذیرش جدایی محیط، بکاپ/Restore، Access، Origin/Turnstile، مقصد اطلاع‌رسانی آزمایشی و کامل‌بودن محدودیت‌های DB، مجوز صریح **یک پنجرهٔ محدود E2E در Preview** ثبت شود. پروژه/Head، مجری، بازهٔ زمانی و برنامهٔ بازگردانی مشخص باشند؛ این سند آن مجوز نیست.
- [ ] فقط در همان Preview، Policy با تمام محدودیت‌ها `true` شود؛ هیچ Guard، Token، سقف نرخ یا بررسی قیمت/Terms برای آزمون دور زده نشود. اکنون سه درخواست مصنوعی، Replay، اختلال Turnstile، Flood، ۴۲۲/۴۰۹/۵۰۳ و دریافت کد پیگیری روی همان Head بررسی شوند؛ ارسال فقط به مقصد آزمایشیِ مجاز.
- [ ] پس از پایان پنجره، موفق یا ناموفق، Policy Preview به `false` برگردد و توقف ثبت تازه تأیید شود. وضعیت‌های DB/Outbox و نتیجهٔ آزمون بدون دادهٔ شخصی ثبت شوند. Production در تمام این پنجره `false` می‌ماند؛ پذیرش E2E به‌تنهایی مجوز فعال‌سازی آن نیست.

این ترتیب جایگزین دستور قدیمی «Policy تا پایان E2E موفق خاموش بماند» است: RPC فعلی با Policy خاموش درخواست تازه را رد می‌کند، پس دریافت کد ثبت برای سه درخواست جدید به پنجرهٔ مجازِ مرحلهٔ دوم نیاز دارد. برنامهٔ پذیرش اصلاح شد؛ هیچ تنظیم زنده‌ای با ویرایش این سند تغییر نمی‌کند.

## ۲. بکاپی که بتوان بازیابی کرد

Workflow نامزد پس از P03، تنظیم پروژه/TLS/رمزنگاری را پیش از Dump و تنظیمات R2/Monitor را پس از نگهداری Artifact رمزنگاری‌شده کنترل می‌کند. نبود R2/Monitor هنوز نتیجهٔ کامل را Fail می‌کند؛ Artifact معتبرِ تولیدشده برای هفت روز باقی می‌ماند. اجرای بدون آرگومان `backup-config.py` همچنان همهٔ تنظیمات را اجباری می‌کند. main فعلاً Workflow قدیمی دارد؛ این سند تنظیم زنده‌ای را تغییر نمی‌دهد. [Runbook بکاپ](supabase-backup-restore.md) مرجع ترتیب دقیق است.

- URL بکاپ فقط Session pooler استاندارد با کاربر `postgres.<ref>`، پورت ۵۴۳۲، دیتابیس `postgres` و یک پارامتر TLS معتبر `sslmode` پذیرفته می‌شود. پارامترهای Override مثل `host`/`user` رد می‌شوند. در صورت فراهم بودن CA، `verify-full` ترجیح دارد؛ وضعیت اعتماد TLS واقعی باید بررسی شود.
- آرشیو فعلی دقیقاً ۹ فایل مشخص و `SHA256SUMS` دارد. ابزار Python آن‌ها را بدون Extract و بدون چاپ SQL می‌خواند؛ سقف هر عضو ۱GiB و مجموع ۲GiB است. رشد بالاتر باید صریح بازبینی شود.
- قبل از Encrypt، ساختار و همهٔ Digestهای داخلی بررسی می‌شوند. R2 سپس فایل رمزنگاری‌شده و Sidecar را دوباره دانلود می‌کند و مقایسهٔ بایت/Checksum انجام می‌شود؛ اندازهٔ برابر به‌تنهایی پذیرفته نیست.
- کلید خصوصی age آفلاین می‌ماند. آزمون Fixtureِ آرشیو/بازخوانی، دسترسی به کلید واقعی و Decrypt واقعی را اثبات نمی‌کند.

### پذیرش واقعی بکاپ

- [ ] Bucket خصوصی مستقل، Credential محدود به بکاپ و مانیتور شکست کار کنند؛ Log فقط نتیجهٔ امن داشته باشد.
- [ ] Retention روشن و حداقل دو نسل مستقلِ تأییدشده محفوظ باشند. پیشنهاد آغاز: ۳۰ نسخهٔ روزانه؛ Lifecycle/حذف خودکار فقط پس از بررسی نیاز و ظرفیت اعمال شود.
- [ ] Run همان کد، Dump، Drill، Encrypt، Artifact، R2 و Readback موفق داشته باشد؛ Run قدیمی معیار کد جدید نیست.
- [ ] یک نسل از R2 با دسترسی مستقل دانلود شود؛ checksum بیرونی و Decrypt آفلاین با identity واقعی موفق باشند.
- [ ] آرشیو Decrypt‌شده با `python3 scripts/verify-backup-archive.py /private/backup.tar.gz` بررسی شود؛ نتیجهٔ امن ثبت شود، محتوا/مسیر خصوصی منتشر نشود.
- [ ] بازیابی در Supabase دورریختنیِ مستقل، تطبیق ACL/RLS/Constraint/RPC/Sequence/History و مسیرهای کاری ثبت شود. تغییر پروژهٔ اصلی ممنوع است.
- [ ] مانیتور شکست با شکست کنترل‌شدهٔ مقصد آزمایشی آزموده شود؛ Success بدون هشداردهی کافی نیست.

### کوتاه‌ترین مسیر تکمیل با امکانات موجود

| شکاف | کار موجود و قدم لازم | شاهد پذیرش؛ اکنون باز |
| --- | --- | --- |
| تداوم و دوام | Checkpoint رمزنگاری‌شدهٔ هفت‌روزه موجود؛ مقصد خصوصی مستقل، دسترسی محدود، Retention و مانیتور هنوز باید واقعاً تأیید شوند. خرید R2 یا سرویس جدید خودکار نیست؛ مقصد جایگزین فقط پس از بازبینی و پذیرش معادل در Workflow پذیرفته می‌شود. | دو نسل قابل‌بازخوانی از مقصد مستقل؛ Run نسخهٔ پذیرفته‌شده، Readback و هشدار شکست. |
| امکان استفاده از کلید | فرمان‌های Decrypt/Verify آماده‌اند؛ نگهدارندهٔ Identity اصلی باید یک نسل واقعی را در محیط خصوصی باز کند. Identity در Git/PR/گزارش قرار نگیرد. | Checksum، Decrypt و Archive verification همان نسل؛ ثبت فقط نتیجه و مرجع غیرمحرمانه. |
| Restore مدیریت‌شده | Drill خودکار فقط public/history در تصویر خام است؛ پروژهٔ آزمایشی موجود می‌تواند پس از تأیید ظرفیت و جدایی، مقصد تمرین شود. پروژه یا Branch پولی تازه لازم فرض نشود. | Restore در مقصد جدا، Policy بسته، ACL/RLS/RPC/Sequence/History و رفتار برنامه روی همان نسخه. |
| سازگاری زیر بار | Dumpهای جدا و Manifest بعدی snapshot مشترک زیر نوشتن هم‌زمان ندارند. این خطر با صفر بودن داده یا خاموش‌کردن درخواست تولید حل‌شده نیست. | روش snapshot سازگار، شامل حدود Sequence/DDL و داده‌های مدیریت‌شده، پیش از اتکا به بکاپ حین نوشتن طراحی و آزموده شود؛ Drift همچنان Fail بماند. |
| اصل رسانه | ابزار آفلاین Pack/Verify/Encrypt/Decrypt/Recover موجود است؛ Export زنده و Managed Storage restore هنوز باز است. | بایت همهٔ اصل‌ها و نسل DB متناظر، بازیابی Create-only و دانلود/Checksum مجدد؛ پیش از ورود عکس واقعی. |
| پاسخ‌گویی | DB و Outbox موجودند؛ [راهنمای رسیدگی](request-response-fa.md) و [وضعیت فقط‌خواندنی](sql/request-operations-status.sql) مسیر جایگزین اعلان را مشخص می‌کنند. | مسئول و جانشین، برنامهٔ بازبینی صف، مقصد آزمون و ثبت پیگیری واقعی؛ پنل یا SMS پولی شرط پایه نیست. |

این جدول پذیرش را کوتاه و قابل‌ردیابی می‌کند؛ هیچ ردیف با داشتن Runbook، Fixture یا CI به Pass تبدیل نمی‌شود. تعلیق پرداخت پابرجاست و مراحل مستقل P05 می‌توانند ادامه یابند.

## ۳. فایل‌های اصلی Storage، قبل از عکس واقعی

Guard فعلی همچنان با ورود Object واقعی یا Auth/Schema خارج از Scope متوقف می‌شود. ابزار آرشیو فعلی بکاپ رسانه نیست؛ توسعهٔ بعدی Format/Drill لازم دارد. هیچ Guard برای سبزشدن Run حذف نمی‌شود.

1. برای Snapshot سازگار، پنجرهٔ توقف Upload/تغییر رسانه تعیین شود؛ Inventory صفحه‌بندی‌شدهٔ همهٔ Bucket/Objectها با شمار و Metadata خصوصی ثبت شود. فهرست ناقص پذیرفته نیست.
2. بایت تمام اصل‌ها از Storage خصوصی دریافت، طول و SHA-256 کنترل و Inventory/Consent/Media key با DB تطبیق داده شوند. EXIF اصل فقط در بکاپ خصوصی حفظ می‌شود؛ خروجی عمومی همچنان پاک‌سازی می‌شود.
3. فایل‌ها و Manifest خصوصی همراه Snapshot مرتبط رمزنگاری شوند؛ Guard جدید Format، سقف مجموع، Objectهای غایب/تغییرکرده و Checksum داشته باشد. نام/محتوا در Log عمومی چاپ نشود.
4. یک Object مصنوعی دارای Metadata و یک Object با نام فارسی در پروژهٔ دورریختنی از طریق API Storage بازیابی شوند. بازیابی کل Inventory و تطبیق Digest، شمار، خصوصی‌بودن Bucket، دسترسی مجاز و اتصال رکوردهای برنامه الزامی است.
5. درج صرف `storage.objects`، بایت فایل را برنمی‌گرداند. ترتیب Restore دیتابیس/Storage و تطبیق شناسه/Metadata باید با نسخهٔ Managed Supabase آزموده شود تا Pointer خالی یا رکورد دوگانه ایجاد نشود.
6. فقط پس از Drill کامل و پذیرش، Guard قدیمی با Guard دقیق‌تر جایگزین و ورود اصل‌های واقعی مجاز شود. این بخش اکنون برنامه است و اجرا نشده است.

## ۴. وصلهٔ Postgres و Default ACL

[اطلاعیهٔ رسمی ۲۵ سپتامبر](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) rollout از ۱۷٫۶ به ۱۷٫۱۱ و چهار ناحیهٔ سازگاری را توضیح می‌دهد. ممیزی تکمیلی نسخهٔ پروژه را ۱۷٫۶ تأیید کرد؛ نسخه یا Digest تصویر Drill حدس زده/عوض نشد.

- [x] `scripts/supabase-environment-audit.sql` نهایی روی پروژهٔ اصلی فقط‌خواندنی اجرا شد؛ نسخه، Extension، سازندگان، MAINTAIN، مجوز سطح ستون و Sequence ثبت شدند. پذیرش محیط آزمایشی جداگانه انجام نشده.
- [x] `scripts/supabase-upgrade-preflight.sql` فقط‌خواندنی اجرا شد؛ Indexهای ltree و GiST float و Operator سفارشی مشمول صفر بودند. غربال Catalog، آزمون ارتقا نیست.
- [ ] PGP legacy cipher و استفادهٔ بیرونی بررسی شود؛ صفر بودن ارجاع تابع/ستون bytea در public، Ciphertext متن یا Schemaهای دیگر و Client بیرونی را رد نمی‌کند. داده/کلید خوانده نشد.
- [ ] تصویر جدید Drill از منبع رسمی با Digest واقعی انتخاب و همان Archive روی آن بازیابی شود؛ نسخهٔ Managed هدف و شرایط Downtime/Rollback روشن شوند.
- [ ] ابتدا Preview، سپس تغییر اصلی فقط با Backup/Decrypt/Restore و اجازهٔ مالک؛ آزمون RPC/قیمت/درخواست و ACL پس از ارتقا.

`ops/sql/default-acl-hardening.proposed.sql` خارج از مسیر Migration است و اجرا نشده. طرح تکمیلی هر سه سازندهٔ مشاهده‌شده در ۱۱ اکتبر، postgres/supabase_admin/pg_database_owner، را پوشش می‌دهد؛ پیش از اجرا دوباره ممیزی شوند. pg_database_owner نقش ضمنی مالک DB است و Grant مستقل به کاربر جدید محسوب نمی‌شود؛ SET ROLE آن، Default ACL همان نقش را به‌کار می‌گیرد. Query ممیزی، ACL جهانی/ضمنی را با Grant سطح Schema ترکیب می‌کند. Revoke فقط `IN SCHEMA public` نمی‌تواند `PUBLIC EXECUTE` جهانیِ تابع تازه را حذف کند؛ به همین دلیل طرح، Global و Schema را جدا بررسی می‌کند.

Revoke جهانی روی Objectهای **آیندهٔ Schemaهای دیگر** هم اثر دارد؛ سازگاری Extension/Platform در Preview شرط است. اشیای موجود، RLS و داده با طرح Default ACL عوض نمی‌شوند. آزمون لازم: زیر هر سازنده، جدول/Sequence/تابع مصنوعی ساخته شود، دسترسی مؤثر anon/auth/PUBLIC مسدود و Grant باریک service_role صریح بررسی شود؛ سپس Fixture حذف و ممیزی فعلی تکرار شود.

### تکمیل ابزار آفلاین Storage؛ پذیرش زنده هنوز باز

- [x] [قرارداد و Runbook فایل اصلی](storage-backup-recovery-fa.md)، SQL خصوصی فقط‌خواندنی و ابزار Pack/Verify/Encrypt/Recover آماده شدند؛ نام Object به مسیر بازیابی تبدیل نمی‌شود.
- [x] بسته‌بندی، تطبیق ETag/SHA-256، فساد/نقص/مسیر/Link و بازیابی محلی با Fixture کنترل شدند. برنامهٔ بازیابی، موفقیت زنده را `false` نگه می‌دارد.
- [x] فرمان Decrypt امن و ۹ سناریوی واقعی آفلاین به CI اجباری اضافه شدند؛ Binary رسمی Age با نسخه/Digest ثابت و Identity موقتی استفاده می‌شود. نتیجهٔ اجرای همان Head در گزارش تحویل ثبت شود؛ نبود Binary شکست است.
- [ ] Receiver اصلی و Decrypt مستقلِ نسل واقعی از کپی ماندگار؛ Identity/PNG آزمایشی در CI این Gate را انجام نمی‌دهد. کلید خصوصی واقعی آفلاین می‌ماند.
- [ ] Export اصل خصوصی از پروژهٔ پذیرفته‌شده، توقف واقعی نویسنده‌ها، پیوند سازگار همان نسل DB، کپی ماندگار و Readback؛ ابزار آفلاین این موارد را خودکار اثبات نمی‌کند.
- [ ] Upload آزمایشی Create-only، دانلود دوبارهٔ تمام بایت‌ها، ACL/RLS/دسترسی ناشناس و سازگاری Managed restore؛ سپس اتصال Workflow بازبینی شود. Guard فعلی Storage/Auth تغییر نکرده است.

## ۵. تنظیمات محیط و Log

- [ ] Retention، دسترسی اپراتورها، MFA و Scope/Rotation Secretها با فراداده تأیید شود؛ از صفر کاربر Auth نتیجهٔ Signup/MFA گرفته نشود.
- [ ] SSL/Network restriction، سرویس‌های بلااستفاده و مسیر Backup بررسی شوند.
- [ ] Destination لاگ و ابزار خودکار، با نام/تلفن/شهر/توضیح **مصنوعی** در Request/Exception آزموده شوند؛ Log مشتری برای این کار خوانده نشود.
- [ ] در صورت نیاز به ایمیل، دامنه و ارسال واقعی مشخص و DNS/TLS/SPF/DKIM/DMARC با اجازهٔ مربوط بررسی شوند؛ HSTS پس از تطبیق دامنه/HTTPS.

منابع: [Cloudflare Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)، [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)، [PostgreSQL 17 Default Privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)، [Supabase Backups](https://supabase.com/docs/guides/platform/backups).
