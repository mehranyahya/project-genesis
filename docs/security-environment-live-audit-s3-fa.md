# S3 — ممیزی زنده و تکمیل ابزار بررسی

تاریخ: ۲۰۲۶-۱۰-۱۱. مبنا: `bb419ad0c26fb1644ab02f57c8578cba9541908a`، بستهٔ آماده‌سازی S3. این نوبت اتصال Supabase برقرار شد و بررسی‌ها فقط‌خواندنی بودند. گزارش S3 قبلی وضعیت پیش از اتصال را ثبت کرده است؛ این سند وضعیت تازه را اضافه می‌کند.

**نتیجه:** دسترسی عمومی اشیای موجود بسته است؛ اما پذیرش کامل S3 هنوز انجام نشده. نسخهٔ Postgres، مجوز پیش‌فرض اشیای آینده، بکاپ ماندگار و محیط آزمایشی مستقل همچنان نیاز به اقدام و آزمون دارند. هیچ Deploy، Migration، تغییر Secret، ارتقا، ساخت پروژه، ثبت درخواست یا ارسال پیام انجام نشد.

## آنچه مستقیم بررسی شد

| محور               | مشاهدهٔ مستقیم در این نوبت                                                                                                                        | نتیجه و حد آن                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| پروژه و جداسازی    | یک پروژهٔ Project Genesis، وضعیت ACTIVE_HEALTHY؛ فهرست پروژه/Branch فقط اصلی را برگرداند                                                          | جدایی Preview اثبات نشده؛ فهرست این اتصال نبودن محیطی خارج از دسترسی را ثابت نمی‌کند.                            |
| نسخه               | فرادادهٔ پروژه `17.6.1.155`؛ SQL، `17.6`                                                                                                          | ارتقای ۱۷٫۱۱ اعمال نشده؛ تعداد CVE اطلاعیه، تعداد آسیب‌پذیری قابل بهره‌برداری این پروژه نیست.                    |
| جدول‌های موجود     | ۱۲ جدول public، مالک postgres، RLS و FORCE RLS روشن، صفر Policy                                                                                   | معماری فعلی دسترسی مستقیم عمومی ندارد؛ Policy عمومی صرفاً برای خاموش‌کردن Advisor ساخته نمی‌شود.                 |
| دسترسی مؤثر        | anon/authenticated: صفر جدول، صفر تابع، صفر Sequence؛ MAINTAIN و مجوز سطح ستون نیز صفر                                                            | شمارش همهٔ مجوزهای مرتبط بررسی شد؛ این نتیجه امنیت کل Edge یا کلید ممتاز را ثابت نمی‌کند.                        |
| تابع‌ها            | ۱۱ تابع public؛ تمام search_pathها محدود به pg_catalog؛ ۹ Definer و دو Invoker                                                                    | Definerهای ممتاز همچنان نیازمند Grant محدود و قرارداد RPC هستند؛ RLS جلوی service_role با BYPASSRLS را نمی‌گیرد. |
| اشیای آینده        | PUBLIC EXECUTE پیش‌فرض برای تابع تازه تحت postgres، supabase_admin و pg_database_owner؛ Grantهای گسترده‌تر supabase_admin برای anon/authenticated | بسته‌بودن اشیای فعلی به آینده تعمیم داده نمی‌شود. طرح اصلاح آماده است، هنوز اجرا/پذیرفته نشده.                   |
| service_role آینده | Grantهای Schema public برای supabase_admin؛ تحت postgres نیز MAINTAIN، REFERENCES، TRIGGER و TRUNCATE                                             | طرح قبلی Revoke سطح Schema این مورد را پوشش می‌دهد؛ Scope واقعی کلید Build جداگانه نامعلوم است.                  |
| تاریخچهٔ DB        | ۱۴ Version/Name مهاجرت زنده با ۱۴ فایل مخزن برابرند                                                                                               | تطابق تاریخچه، تطابق کامل بدنهٔ Schema یا اجرای Draftهای جدید را ثابت نمی‌کند.                                   |
| رسانه و Auth       | یک Bucket خصوصی catalog-media، ۲۰MiB، JPEG/PNG/WebP/AVIF؛ Object و کاربر Auth صفر                                                                 | نبود کاربر، Signup غیرفعال یا MFA اپراتور را ثابت نمی‌کند. بکاپ رسانه قبل از ورود اصل‌ها هنوز لازم است.          |
| محتوای عملیاتی     | محصول/سنگ ساختمانی/پرتفولیوی فعال، رسانهٔ تأییدشده، Site اصلی و درخواست: همگی صفر                                                                 | کمبود محتوا همچنان واقعی است؛ دادهٔ ساختگی وارد نشده.                                                            |
| محدودکنندهٔ DB     | enabled=false                                                                                                                                     | مطابق Gate پروژه تا E2E موفق Preview خاموش باقی ماند.                                                            |
| Advisor امنیت      | ۱۲ اطلاع INFO از نوع RLS Enabled No Policy؛ Warning/Error دیگری در این پاسخ نبود                                                                  | این پاسخ همهٔ خطرها، از جمله Default ACL و Postgres، را پوشش نمی‌دهد.                                            |
| Advisor عملکرد     | ۱۹ اطلاع INFO برای Indexهای استفاده‌نشده                                                                                                          | با کاتالوگ و درخواست خالی، حذف Index از روی این نتیجه توجیه ندارد.                                               |

Snapshot امن، بدون ردیف مشتری، کلید، مقدار Secret یا URL خصوصی: [security-s3-live-audit-20261011.json](security-s3-live-audit-20261011.json).

## اصلاح ابزار و طرح ACL

- `supabase-environment-audit.sql` اکنون تراکنش READ ONLY و سقف ۱۰ ثانیه دارد؛ مالک DB، MAINTAIN در PostgreSQL 17، مجوز سطح ستون و Sequence را هم می‌شمرد. همان فایل اصلاح‌شده روی پروژه اجرا و نتیجه با بررسی مستقل تطبیق داده شد.
- مجموعهٔ OID جدول/تابع/Sequence با MATERIALIZED محدود شده است. در اجرای نخستِ افزودن Sequence، Planner تابع بررسی Sequence را روی Index نامرتبط ارزیابی کرد و خطا داد؛ نسخهٔ نهایی این خطا را رفع کرد و موفق اجرا شد. هیچ تغییر داده‌ای رخ نداد.
- ممیزی سازندگان، pg_database_owner را نیز برگرداند. این نقش عضویت ضمنی مالک DB دارد؛ postgres و supabase_admin امکان SET ROLE آن را دارند. Default ACL نقش جاری ایجادکننده مهم است، نه صرفاً عضویت ارث‌رسیده.
- پیشنهاد `default-acl-hardening.proposed.sql` هر سه نقش را صریح پوشش می‌دهد. همچنان خارج از مسیر Migration فعال است و **هیچ دستور Revoke آن اجرا نشده**. اثر جهانی بر اشیای آیندهٔ Schemaهای دیگر و سازگاری Managed/Extension باید در Preview پذیرفته شود.

## غربال سازگاری Postgres

`supabase-upgrade-preflight.sql` فقط Catalog را می‌خواند و در تراکنش فقط‌خواندنی اجرا شد. براساس اطلاعیهٔ رسمی ۲۵ سپتامبر:

| مورد            | شواهد                                                                                                                                               | وضعیت                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ltree           | Extension نصب نیست و شمار Indexهای ltree/_ltree صفر؛ DB دارای UTF8 و ICU است                                                                        | در Snapshot فعلی Index مشمول پیدا نشد؛ صرف UTF8 دلیل نیاز به Reindex نیست.                                                   |
| GiST روی float  | شمار Indexهای GiST با Opclass float4/float8 صفر                                                                                                     | در Snapshot فعلی مورد مشمول پیدا نشد؛ بدون Index مربوط نیازی به خواندن ردیف NaN نبود.                                        |
| Operator سفارشی | شمار Operator دارای Estimator غیرسیستمی و خارج از Extension صفر                                                                                     | مورد مشمول در Catalog دیده نشد.                                                                                              |
| PGP قدیمی       | pgcrypto 1.3 نصب است؛ ارجاع PGP در تابع‌های public و ستون bytea در جدول‌های public صفر؛ در کد اجرایی مخزن هم تطبیق PGP/گزینهٔ Cipher قدیمی پیدا نشد | استفادهٔ بیرونی، Ciphertext در متن/Schema دیگر و دادهٔ واقعی بررسی نشده؛ نتیجه UNKNOWN/NOT_PERFORMED باقی است، نه Pass کامل. |

کلید Vault یا دادهٔ رمزنگاری‌شده خوانده نشد و Probe رمزگشایی/تابع موقت اجرا نشد. تصویر جدید Drill با Digest واقعی، بازیابی آرشیو روی آن و ارتقای محیط اصلی هنوز باقی‌اند.

## Edge، بکاپ و محیط

- دو Edge فعال، نسخهٔ ۱ و verify_jwt=false باقی‌اند. ۱۷ ورودی فایل دریافت‌شده، ۱۲ فایل یکتا دارند؛ همه بایت‌به‌بایت با main فعلی برابرند. دو فایل `submit-request/index.ts` و `_shared/turnstile.ts` با Draft S2/S3 متفاوت‌اند: اصلاح منع پذیرش تأییدنشده **هنوز روی Edge زنده منتشر نشده**. خاموش‌بودن verify_jwt در این معماری به‌تنهایی نقص نیست؛ HMAC/Nonce و محدودیت RPC مسیر احراز اختصاصی‌اند.
- main همچنان `73868949c34e581af636e8ef2d4fc36fb3c42321` است؛ PR53 باز، Draft و ادغام‌نشده روی S2 باقی است. تغییر زندهٔ متن شرایط یا رسانه انجام نشده.
- [بکاپ 38126012981](https://github.com/mehranyahya/project-genesis/actions/runs/38126012981)، ۱۱ اکتبر: Dump/Drill/Checksum/Encrypt و Artifact موفق‌اند؛ R2 و مانیتور Skip شدند. موفقیت Run، ذخیرهٔ ماندگار، Decrypt آفلاین یا بازیابی Managed مستقل را ثابت نمی‌کند. سه Run اخیر ۹ تا ۱۱ اکتبر success هستند؛ فقط گام‌های Run اخیر دوباره بررسی شدند.
- در ۱۰۰ Run آخر بازخوانی‌شده، آخرین Audit Preview مشاهده‌شده مربوط به ۲۴ اوت و ناموفق است. این شاهد تاریخی، شکست تنظیمات امروز را ثابت نمی‌کند. Workflow جدید دستی اجرا نشد.
- اتصال ممیزی این نوبت TLS داشت و ssl=on بود؛ اجبار TLS برای همهٔ Clientها و محدودیت شبکه از آن نتیجه نمی‌شود. Log statement=ddl، خطا=error، طول پارامتر خطا=0، Slow/Duration logging خاموش و pgaudit.log=none است؛ log_parameter_max_length=-1 باقی است. Log واقعی مشتری خوانده نشد؛ آزمون نشت اطلاعات مصنوعی در Preview، Retention/اپراتور/مقصد Log هنوز لازم است.
- تنظیمات Cloudflare، Access، Binding و Secretها با این دسترسی قابل بررسی نبودند. Auth config، MFA اپراتور، Scope/Rotation کلید و مقصد Telegram مستقل همچنان نامعلوم‌اند.

## معیار پایان باقی‌مانده

1. هویت و مجوز محیط آزمایشی مستقل، Cloudflare Access، تمام Binding/Origin/کلیدها و مقصد اعلان آزمایشی روشن شود.
2. بکاپ همین نسخه روی مقصد ماندگار و مانیتور موفق؛ Checksum و Decrypt با identity آفلاین؛ Restore در Supabase دورریختنی مستقل انجام و ثبت شود.
3. سازگاری PGP بیرونی و تصویر Drill جدید بررسی؛ ارتقا و ACL ابتدا در Preview با اجازهٔ مربوط و Gate بکاپ آزموده شوند. زیر هر سه سازنده، ایجاد شیء مصنوعی و دسترسی مؤثر بررسی شود.
4. فایل‌های Storage، پیش از رسانهٔ واقعی، وارد قالب بکاپ رمزنگاری‌شده و Drill کامل شوند؛ Guard فعلی حذف نشود.
5. S2 واقعی در مقصد مجاز، E2E هر سه خدمت، Replay/خطا و نشت‌نکردن اطلاعات آزموده شوند؛ سپس پذیرش محیط قابل بستن است.

## منابع و اعتبارسنجی

- [PostgreSQL 17 Privileges](https://www.postgresql.org/docs/17/ddl-priv.html)، [Predefined Roles](https://www.postgresql.org/docs/17/predefined-roles.html) و [Default Privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html): MAINTAIN، عضویت ضمنی و تفاوت Default ACL جهانی/Schema.
- [Supabase Postgres 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) و [Upgrade](https://supabase.com/docs/guides/platform/upgrading): غربال سازگاری و Gate ارتقا.
- [Advisor امنیت](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) و [Advisor عملکرد](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): تفسیر محدود اطلاع‌ها.
- [برنامهٔ پذیرش محیط](../ops/environment-acceptance-fa.md) و [گزارش آماده‌سازی S3](security-environment-s3-fa.md).

دو فایل ممیزی نهایی روی DB فقط‌خواندنی موفق اجرا شدند. Proposal تغییر ACL اجرا نشده؛ موفقیت ممیزی به معنی آزمون Revoke یا بازیابی نیست. نتیجهٔ Gateهای همین نسخه در گزارش جامع تحویل ثبت می‌شود. این بسته فقط ابزار/طرح/سند را تغییر می‌دهد و هیچ کد Runtime، پالت، عکس، فونت، Package یا Migration فعال را عوض نمی‌کند.
