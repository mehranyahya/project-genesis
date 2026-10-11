# پذیرش محیط S3، قبل از تغییر زنده

تاریخ: ۲۰۲۶-۱۰-۱۱. این سند برنامهٔ اجرایی و معیار پذیرش است؛ اجرای Deployment، Migration، ارتقای Postgres، ساخت پروژه یا ارسال Telegram را مجاز/انجام‌شده اعلام نمی‌کند.

## شواهد فعلی و محدودیت

- `main` امروز همچنان `73868949c34e581af636e8ef2d4fc36fb3c42321` است؛ بسته‌های طراحی و امنیت هنوز Draft هستند.
- [بکاپ 38126012981](https://github.com/mehranyahya/project-genesis/actions/runs/38126012981) در ۱۱ اکتبر موفق است، ولی گام R2 و مانیتور Skip شدند. بکاپ‌های ۹ و ۱۰ اکتبر هم success گزارش شده‌اند. تعداد روزهای موفق، Decrypt مستقل و بازیابی فایل‌های Storage را اثبات نمی‌کند.
- اتصال Supabase در این نوبت فعال نبود؛ نسخهٔ DB، ACL، پروژه/Branch، Auth، Secret، رسانه و Log امروز دوباره خوانده نشدند. مشاهدات ۸ اکتبر تاریخی‌اند: نسخهٔ ۱۷٫۶، Object و کاربر Auth صفر، Default ACL بازِ `supabase_admin`.
- کد جدید آفلاین آزموده می‌شود. وجود/Scope کلید واقعی، Access، مقصد اطلاع‌رسانی و بازیابی واقعی هنوز شرط پذیرش‌اند.

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
- [ ] سه درخواست مصنوعی، Replay، اختلال Turnstile، Flood، ۴۲۲/۴۰۹/۵۰۳ و دریافت کد پیگیری روی همان Head بررسی شوند؛ ارسال فقط به مقصد آزمایشیِ مجاز.
- [ ] `rate_limit_policy.enabled` تا موفقیت E2E false بماند؛ فعال‌سازی بعدی مجوز و آزمون مستقل دارد.

## ۲. بکاپی که بتوان بازیابی کرد

Workflow پیشنهادی برای success، چهار Secret R2 و مانیتور را اجباری می‌کند. در نبود آن‌ها قبل از Dump متوقف می‌شود؛ تغییر زندهٔ تنظیمات در این بسته انجام نشده است. Artifact هفت‌روزه، نسخهٔ دوم کوتاه‌مدت است.

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

## ۳. فایل‌های اصلی Storage، قبل از عکس واقعی

Guard فعلی همچنان با ورود Object واقعی یا Auth/Schema خارج از Scope متوقف می‌شود. ابزار آرشیو فعلی بکاپ رسانه نیست؛ توسعهٔ بعدی Format/Drill لازم دارد. هیچ Guard برای سبزشدن Run حذف نمی‌شود.

1. برای Snapshot سازگار، پنجرهٔ توقف Upload/تغییر رسانه تعیین شود؛ Inventory صفحه‌بندی‌شدهٔ همهٔ Bucket/Objectها با شمار و Metadata خصوصی ثبت شود. فهرست ناقص پذیرفته نیست.
2. بایت تمام اصل‌ها از Storage خصوصی دریافت، طول و SHA-256 کنترل و Inventory/Consent/Media key با DB تطبیق داده شوند. EXIF اصل فقط در بکاپ خصوصی حفظ می‌شود؛ خروجی عمومی همچنان پاک‌سازی می‌شود.
3. فایل‌ها و Manifest خصوصی همراه Snapshot مرتبط رمزنگاری شوند؛ Guard جدید Format، سقف مجموع، Objectهای غایب/تغییرکرده و Checksum داشته باشد. نام/محتوا در Log عمومی چاپ نشود.
4. یک Object مصنوعی دارای Metadata و یک Object با نام فارسی در پروژهٔ دورریختنی از طریق API Storage بازیابی شوند. بازیابی کل Inventory و تطبیق Digest، شمار، خصوصی‌بودن Bucket، دسترسی مجاز و اتصال رکوردهای برنامه الزامی است.
5. درج صرف `storage.objects`، بایت فایل را برنمی‌گرداند. ترتیب Restore دیتابیس/Storage و تطبیق شناسه/Metadata باید با نسخهٔ Managed Supabase آزموده شود تا Pointer خالی یا رکورد دوگانه ایجاد نشود.
6. فقط پس از Drill کامل و پذیرش، Guard قدیمی با Guard دقیق‌تر جایگزین و ورود اصل‌های واقعی مجاز شود. این بخش اکنون برنامه است و اجرا نشده است.

## ۴. وصلهٔ Postgres و Default ACL

[اطلاعیهٔ رسمی ۲۵ سپتامبر](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) rollout از ۱۷٫۶ به ۱۷٫۱۱ و چهار ناحیهٔ سازگاری را توضیح می‌دهد. نسخهٔ امروز پروژه نامعلوم است؛ در این بسته نسخه یا Digest تصویر Drill حدس زده/عوض نشد.

- [ ] پس از اتصال، `scripts/supabase-environment-audit.sql` فقط‌خواندنی در هر پروژه اجرا و نسخه، Extension و سازندگان واقعی ثبت شوند؛ SQL هنوز روی DB اجرا نشده است.
- [ ] Detection رسمی `ltree`، PGP legacy cipher، `btree_gist`/NaN و Custom operator بررسی شود؛ نبود کاربرد در تابع عمومی، تمام استفاده‌های بیرونی را رد نمی‌کند.
- [ ] تصویر جدید Drill از منبع رسمی با Digest واقعی انتخاب و همان Archive روی آن بازیابی شود؛ نسخهٔ Managed هدف و شرایط Downtime/Rollback روشن شوند.
- [ ] ابتدا Preview، سپس تغییر اصلی فقط با Backup/Decrypt/Restore و اجازهٔ مالک؛ آزمون RPC/قیمت/درخواست و ACL پس از ارتقا.

`ops/sql/default-acl-hardening.proposed.sql` خارج از مسیر Migration است و اجرا نشده. طرح برای دو سازندهٔ مشاهده‌شدهٔ ۸ اکتبر است؛ سازندگان دیگر باید قبل از تبدیل به Migration بررسی شوند. Query ممیزی، ACL جهانی/ضمنی را با Grant سطح Schema ترکیب می‌کند. Revoke فقط `IN SCHEMA public` نمی‌تواند `PUBLIC EXECUTE` جهانیِ تابع تازه را حذف کند؛ به همین دلیل طرح، Global و Schema را جدا بررسی می‌کند.

Revoke جهانی روی Objectهای **آیندهٔ Schemaهای دیگر** هم اثر دارد؛ سازگاری Extension/Platform در Preview شرط است. اشیای موجود، RLS و داده با طرح Default ACL عوض نمی‌شوند. آزمون لازم: زیر هر سازنده، جدول/Sequence/تابع مصنوعی ساخته شود، دسترسی مؤثر anon/auth/PUBLIC مسدود و Grant باریک service_role صریح بررسی شود؛ سپس Fixture حذف و ممیزی فعلی تکرار شود.

## ۵. تنظیمات محیط و Log

- [ ] Retention، دسترسی اپراتورها، MFA و Scope/Rotation Secretها با فراداده تأیید شود؛ از صفر کاربر Auth نتیجهٔ Signup/MFA گرفته نشود.
- [ ] SSL/Network restriction، سرویس‌های بلااستفاده و مسیر Backup بررسی شوند.
- [ ] Destination لاگ و ابزار خودکار، با نام/تلفن/شهر/توضیح **مصنوعی** در Request/Exception آزموده شوند؛ Log مشتری برای این کار خوانده نشود.
- [ ] در صورت نیاز به ایمیل، دامنه و ارسال واقعی مشخص و DNS/TLS/SPF/DKIM/DMARC با اجازهٔ مربوط بررسی شوند؛ HSTS پس از تطبیق دامنه/HTTPS.

منابع: [Cloudflare Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)، [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)، [PostgreSQL 17 Default Privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)، [Supabase Backups](https://supabase.com/docs/guides/platform/backups).
