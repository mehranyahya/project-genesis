# S3 — محافظ محیط و بکاپ؛ پذیرش زنده باز

تاریخ: ۲۰۲۶-۱۰-۱۱. مبنا: `c8cea98e27b0b9b5c08c068658fa06382cf921eb`، بستهٔ S2. شاخهٔ مستقل: `security/environment-hardening-s3-20261011`.

**نتیجه:** کد بررسی جداسازی Preview/Production و اعتبار بکاپ تقویت شد. این تحویل آماده‌سازی مهندسی است؛ S3 زنده کامل نشده. تغییر DB، Secret، Postgres، تنظیمات Cloudflare، Upload/Deploy، Migration، Merge یا ثبت درخواست/Telegram واقعی انجام نشد.

## شواهد تازه

- PR52 امروز هنوز open/Draft/unmerged و روی Head مبناست؛ `main` همان `73868949c34e581af636e8ef2d4fc36fb3c42321` است.
- [بکاپ ۱۱ اکتبر، 38126012981](https://github.com/mehranyahya/project-genesis/actions/runs/38126012981) success؛ Dump/Drill/Encrypt/Artifact اجرا شدند، R2 و مانیتور Skip شدند. نتیجهٔ آخرین ممیزی Preview برگشتی از ۱۰۰ Run همچنان [32768112975](https://github.com/mehranyahya/project-genesis/actions/runs/32768112975)، failure در ۲۴ اوت است. از اجرای قدیمی وضعیت Secretهای امروز نتیجه نمی‌گیریم.
- Supabase در این نوبت وصل نبود. نسخه/ACL/Branch/Auth/رسانه/Secret/Log امروز تأیید نشدند؛ یافته‌های DB در گزارش قبلی به ۸ اکتبر مربوط‌اند.

## اصلاحات کد

| مسئله                                         | رفتار جدید                                                                                                                 | حد پذیرش                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DEPLOY_TARGET` نام Worker را جدا نمی‌کرد     | نام Worker، Reference پروژه و دو مجموعهٔ Origin اجباری/مستقل؛ URL Build/Edge باید به پروژهٔ انتخابی تعلق داشته باشد        | وجود/مالکیت/Scope مقصد واقعی و Access هنوز نیاز به بررسی دارد                                  |
| نام متفاوت Secret کافی نبود                   | تمام کلیدهای Gateway در Rotation، کلید Build، IP hash و Site key نباید اشتراک مقدار داشته باشند؛ کنترل قبل از دریافت محتوا | معتبر بودن کلید و Secretهای Edge/مقصد Bot با این مقایسه ثابت نمی‌شود                           |
| Vars و Route/Cron ارث‌رسیده                   | چهار Var مجاز صریح و `keep_vars=false`؛ حذف `--keep-vars`؛ Preview بدون Route/Env تولید، Cron خالی و Namespace مستقل Flood | Config، Route/Cron جاری یک Worker قبلی را پاک/تأیید نمی‌کند؛ راه‌اندازی و بررسی مقصد شرط جداست |
| Audit ممکن بود پروژهٔ اصلی را هدف بگیرد       | لیست نام Secretهای Edge فقط Reference صریح Preview را استفاده می‌کند؛ همان محافظ جداسازی اجرا می‌شود                       | ممیزی جدید زنده اجرا نشده                                                                      |
| بکاپ با Artifact هفت‌روزه success می‌شد       | R2 کامل و مانیتور اجباری؛ نبود تنظیمات قبل از Dump شکست می‌خورد                                                            | پیش از Merge/اجرای این پیشنهاد باید تنظیمات کامل شوند؛ اجرای فعلی دست‌نخورده است               |
| URL بکاپ فقط وجود substring پروژه را می‌سنجید | کاربر/Hostname pooler/پورت Session/DB/TLS دقیق؛ پارامترهای Override رد                                                     | اعتبار Credential و اتصال TLS واقعی هنوز باید بررسی شوند                                       |
| اندازهٔ برابر جای اعتبار فایل بود             | دانلود دوبارهٔ آرشیو Encrypt و checksum، مقایسهٔ بایت و کنترل digest؛ خراب‌شدن هم‌اندازه رد                                | Decrypt با کلید واقعی و Restore مستقل همچنان باز است                                           |
| اعتبار آرشیو داخلی ابزار مستقل نداشت          | Streaming بدون Extract، دقیقاً ۹ فایل و Manifest، SHA-256 همه، منع مسیر/Link/تکرار/کمبود و سقف ۱GiB/۲GiB                   | بکاپ Objectهای Storage یا آزمون صحت SQL/بازیابی نیست                                           |
| Default ACL آینده نیاز به طرح داشت            | Query فقط‌خواندنی برای مجوز مؤثر Global+Schema، سازنده‌ها/نسخه/Extension؛ SQL پیشنهادی خارج از Migration                   | هیچ SQL به DB اجرا نشده؛ Revoke جهانی نیازمند بررسی سازگاری Managed در Preview است             |

کلید `OTHER_*` فقط در بررسی استفاده می‌شود؛ فایل Secret محدود Worker همان چهار نام را دارد. Package/Lockfile و کد رابط کاربر عوض نشدند. هیچ استثنایی برای Guard نبود Auth/Storage یا `rate_limit_policy.enabled=false` افزوده نشد.

## بررسی انجام‌شده

- نصب Frozen؛ Audit بدون Advisory شناخته‌شده.
- Lint صفر Error و ۲۹ Warning قبلی؛ TypeScript، Edge check و Content check موفق.
- **۸۰۱ آزمون / صفر شکست / ۷۰ فایل**؛ ۱۵ آزمون تازه. Fixtureهای Python/Bash/Node واقعی اجرا شدند: مقصد مشترک/کلید مشترک/Origin ناسالم، تغییر Worker/Namespace/Vars، URL بکاپ ناسالم، فساد هم‌اندازه، checksum نادرست، آرشیو ناقص/اضافی/Link/Traversal/تکرار/بزرگ.
- Build موفق؛ Artifact و Strict dry-run بدون Upload، هم بدون Target مانند CI، هم Preview/Production با هویت **مصنوعی** موفق شدند. Metrics/Error report خاموش بودند.
- Python/Bash syntax و YAML/قرارداد Input و Secret دو Caller بررسی شدند؛ این نتیجه اجرای Workflow زنده یا اجرای SQL نیست.
- ۱۹ فایل JS، یک CSS و دو WOFF2 خروجی عمومی، با S2 از نظر نام/بایت/SHA-256 برابرند؛ افزایش کد اولیهٔ مرورگر **صفر بایت**. سرعت واقعی و CWV اندازه‌گیری نشدند.
- اسکن ۳۶۳ فایل مرحله‌بندی‌شده، دو Credential URL آشکارا مصنوعی در تست لینک و Pooler گزارش کرد؛ هر دو Fixture بررسی و طبقه‌بندی شدند، حذف/Ignore نشدند. خروجی عمومی ۲۷ فایل، صفر تطبیق Secret/متغیر ممتاز/Source Map/فایل حساس داشت. اسکن الگو ضمانت نبود تمام Secret/PII نیست؛ تاریخچهٔ نهایی در گزارش جامع ثبت می‌شود.

## باقی‌مانده و ترتیب پذیرش

[برنامهٔ دقیق پذیرش محیط](../ops/environment-acceptance-fa.md) و [Runbook بکاپ](../ops/supabase-backup-restore.md) به‌روزرسانی شدند:

1. اتصال Supabase و خواندن تازهٔ فراداده؛ بررسی Worker/Binding/Access و هویت هر محیط با مقادیر امن.
2. تنظیم بکاپ ماندگار و مانیتور، Run همین نسخه، Decrypt مستقل و Restore در مقصد دورریختنی.
3. وصلهٔ Postgres و تصویر Drill با Digest واقعی، تشخیص چهار مورد سازگاری اطلاعیه؛ تغییر اصلی فقط پس از Gate و مجوز.
4. ممیزی همهٔ سازندگان، آزمون واقعی جدول/Sequence/تابع تازه زیر هر نقش؛ سپس تبدیل طرح ACL به Migration جدا در صورت پذیرش.
5. بکاپ و Restore تمام بایت‌های Storage **قبل از ورود عکس واقعی**؛ Guard فعلی تا اجرای Drill کامل باقی بماند. فعلاً برنامه آماده است و رسانه بازیابی نشده.
6. بررسی Log/Retention/MFA/Network/SSL/Scope، مقصد اطلاع‌رسانی آزمایشی و E2E سه خدمت. S3 تنها با شواهد واقعی این موارد بسته می‌شود.

پیش‌نیازهای زنده نباید با موفقیت Build/Fixture سبز علامت بخورند. آماده‌سازی مستقل مراحل محتوا می‌تواند ادامه یابد؛ انتشار و ورود اصل رسانه تابع Gateهای باز هستند.

منابع بررسی‌شده در ۱۱ اکتبر: [Cloudflare Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)، [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)، [PostgreSQL 17 Default Privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)، [Supabase Backups](https://supabase.com/docs/guides/platform/backups)، [اطلاعیهٔ ۱۷٫۱۱](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
