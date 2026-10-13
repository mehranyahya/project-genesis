# ۱۲C — متادیتای صفحهٔ غایب، اشتراک‌گذاری و مقاله

تاریخ: ۲۰۲۶-۱۰-۱۳ به وقت تهران. مبنا: PR65، Commit `1abe308b410abeeafc8dd0c17b49a9ce48412a46`.

جزئیات غایبِ محصول و راهنما می‌توانست آدرس فهرست را Canonical معرفی کند. متادیتای اجتماعی نیز URL و زبان صفحه را نداشت و همهٔ صفحات نوع Website داشتند. این بسته متادیتای شکست را از انتشار واقعی جدا و دادهٔ مقاله را فقط از مدل قابل نمایش همان زبان استخراج می‌کند.

## مشاهده و اصلاح

| شاهد مستقیم                                                                              | رفتار این نسخه                                                                                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Head محصول غایب Canonical فهرست مزار و Head راهنمای غایب Canonical فهرست راهنما می‌ساخت. | Lookup شکست‌خورده Canonical، Hreflang، OG URL یا Schema تولید نمی‌کند؛ Noindex/Follow دارد.                                                  |
| Head می‌تواند پس از تغییر Slug دادهٔ پیشین داشته باشد.                                   | Status شکست و تطابق Slug واقعی با Params بررسی می‌شوند؛ دادهٔ قبلی، متادیتای URL تازه نمی‌شود.                                               |
| مسیر ناشناس Root متادیتای Noindex نداشت.                                                 | وضعیت واقعی Root/Global not-found در Head کنترل می‌شود؛ شکست محتوایی هیچ هویت تجاری ساختگی نمی‌سازد.                                         |
| OG فقط Title/Description داشت و Root همه را Website اعلام می‌کرد.                        | نوع صفحه و Locale مشخص شدند؛ راهنما Article است. OG URL فقط از Canonical HTTPS پیکربندی‌شده می‌آید؛ Origin غایب URL فرضی نمی‌سازد.           |
| Structured data مقاله وجود نداشت؛ DTO نیز نویسنده، عکس یا زمان اولین انتشار ندارد.       | فقط `Article` با `headline` واقعاً نمایش‌داده‌شده، `inLanguage` و `url` ایجاد می‌شود؛ نویسنده/عکس/تاریخ انتشار/قیمت/Review حدس زده نمی‌شوند. |

`fa_IR/en_US` قرارداد فنی OG برای برچسب رابط هستند؛ محل کسب‌وکار، بازار جغرافیایی یا نسخهٔ ترجمهٔ غایب را ادعا نمی‌کنند. `og:locale:alternate` بدون دادهٔ مصوب ساخته نشد. تصویر اجتماعی هنوز باید از عکس واقعی، مرتبط و مجوزدار انتخاب و در مقصد آزموده شود؛ **OG کامل و کارت تصویری نهایی هنوز پذیرفته نشده‌اند.**

## مرز داده و امنیت

- Script مقاله فقط برای مدل واقعی با Blocks/Title، Indexability همان زبان و Canonical HTTPS تمیزِ منطبق با مسیر ساخته می‌شود. Noindex/None، زبان غایب، Body غایب، Origin غایب، Query/Hash/Credentials یا مسیر متفاوت، Schema نمی‌سازند.
- دادهٔ JSON از عنوان H1 مدل می‌آید؛ عنوان بهینه‌شدهٔ SEO جای عنوان واقعاً قابل مشاهده نیست. تاریخ آخرین بازبینی، تاریخ اولین انتشار معرفی نشد؛ تاریخ/نویسنده/تصویر تازه نیازمند منبع واقعی و قرارداد مشخص‌اند.
- `< > & U+2028 U+2029` در JSON با Escape ایمن جایگزین می‌شوند. JSON پس از Parse همان عنوان واقعی را حفظ می‌کند؛ `</script>` داخل عنوان نمی‌تواند از بلوک داده خارج شود.
- HeadContent نسخهٔ نصب‌شدهٔ TanStack nonce همان Router را به Script داده اضافه می‌کند. سیاست CSP تغییر یا شل نشد؛ انطباق Script/Nonce/Header در خروجی آزموده شد.
- Package، Route، Adapter، Endpoint، درخواست شبکه، Workflow، Edge، DB/Schema/Policy/Secret، عکس یا کپی کسب‌وکار اضافه/تغییر نکردند. پالت، حرکت و ظاهر سه خدمت محفوظ‌اند. Root و Factoryها فقط به Helperهای خالص متادیتا متصل شدند.

## آزمون و حدود شواهد

| بررسی                          | شاهد محلی                                                                                                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| مجموعهٔ کامل                   | **۹۸۳ Pass، صفر Fail، ۹۴ فایل**؛ شش آزمون تازه، بدون حذف/Skip یا تضعیف تست‌های پیشین.                                                                                                                                                                                       |
| پس از Generation واقعی         | **۹۸۳ Pass، صفر Fail، ۹۴ فایل** در کپی جدا بدون Remote/Env واقعی؛ Structured مصنوعی آفلاین، Guide و Home reference مصنوعی، Generator و Content check واقعی.                                                                                                                 |
| بررسی مرتبط                    | **۴۰ Pass، صفر Fail، هفت فایل**؛ متادیتا، Canonical، Noindex، Git Guide و مرز Article.                                                                                                                                                                                      |
| Response واقعی چارچوب در حافظه | Handler/Validator/Repository/Adapter و Loader/Head/View واقعی؛ `defaultRenderHandler` واقعی TanStack با Request/Response، Router و Manifest آزمایشی. HTTP 200/404، مسیر ناشناس، جزئیات غایب، مسیر نرمال‌شده، دو زبان و Origin موجود/غایب؛ Status به‌صورت دستی 404 نشده است. |
| جابه‌جایی مسیر                 | تغییر مقالهٔ موجود به Slug غایب در Router واقعی، Status 404 و حذف Title/Schema/Canonical/OG URL پیشین را تأیید کرد. این آزمون Router در حافظه است، نه تعامل مرورگر/Hydration واقعی.                                                                                         |
| خروجی Script                   | Parse JSON، عنوان قابل مشاهده، یک نوع OG، Escape و nonce واقعی Fixture با CSP هماهنگ؛ Noindex خواندنی HTTP 200 دارد و Schema نمی‌سازد.                                                                                                                                      |
| گیت‌های کد                     | Lint صفر Error/۲۹ Warning پیشین، TypeScript، هر دو Edge check، Content check، Audit بدون Advisory، Build، Artifact verify و Strict Wrangler dry-run موفق.                                                                                                                   |
| انتشار                         | Release-content به‌درستی Exit 1؛ Readiness برابر ۲۴ Required Blocked، دو Deferred، دو Pass؛ `readyForPublication=false`.                                                                                                                                                    |
| CI/Native                      | نتیجهٔ تمام ۱۹ گام CI و نه سناریوی مستقل Age v1.3.2 باید پیش از تحویل، برای Head دقیق در PR/گزارش کامل ثبت شود.                                                                                                                                                             |

Transport تبدیل‌شدهٔ Start و Artifactهای ورودی در Fixture جدا شده‌اند؛ Shell آزمون برای خواندن Head در حافظه ساخته شده است. Default renderer واقعی، Status واقعی Router را در Response قرار می‌دهد. این **پذیرش HTTP Worker/CDN/HTTPS/Access یا Renderer جریانی Production نیست**؛ Dehydration/Hydration، Headerهای شبکهٔ مقصد و مرورگر واقعی هنوز آزمون جدا لازم دارند. هیچ محدودیت اجرای Preview با میزبان جایگزین دور زده نشد.

## هزینهٔ حجم نسبت به PR65

Buildهای تازه با Cacheهای مستقل Nitro، محتوای یکسانِ خالی و Lockfile ثابت؛ Gzip پایتون Level 9/Mtime صفر. هر ۲۳ فایل عمومی JS/CSS/WOFF2 شمارش شدند؛ Graph اولیه از Entry و Importهای ثابت با Parser واقعی Bun 1.3.14 به‌دست آمد.

| اندازه                      |           PR65 |     ۱۲C |         تغییر |
| --------------------------- | -------------: | ------: | ------------: |
| JS اولیه، خام؛ دو فایل      |        ۴۵۲٬۴۸۷ | ۴۵۳٬۴۲۰ |     +۹۳۳ بایت |
| JS اولیه، Gzip              |        ۱۳۹٬۶۷۹ | ۱۴۰٬۰۸۹ | **+۴۱۰ بایت** |
| تمام JS عمومی، خام؛ ۲۰ فایل |        ۵۳۸٬۶۵۰ | ۵۳۹٬۵۸۱ |     +۹۳۱ بایت |
| تمام JS عمومی، Gzip         |        ۱۶۹٬۴۱۸ | ۱۶۹٬۸۳۲ |     +۴۱۴ بایت |
| CSS، خام/Gzip               | ۲۶٬۲۷۶ / ۶٬۲۴۸ |    همان |           صفر |
| دو فونت، خام                |        ۱۳۰٬۹۷۲ |    همان |           صفر |

[حجم/SHA و Graph](seo-metadata-absence-bundle-20261013.json) ثبت است. CSS/فونت از نظر نام/بایت/Gzip/SHA برابرند. Script مقاله در HTML صفحهٔ دارای مقاله هم داده اضافه می‌کند؛ جدول فقط حجم فایل است و زمان/CWV، درصد افت سرعت یا حجم پاسخ واقعی با محتوای نهایی را ثابت نمی‌کند.

## ادامه و پذیرش

۱۲C فقط کد و آزمون یک بخش از مرحلهٔ ۱۲ است؛ پنج مرحلهٔ اصلی ۹ تا ۱۳ بازند. [Snapshot آمادگی](seo-metadata-absence-readiness-20261013.json) را نباید با پذیرش انتشار یکی گرفت.

1. مرحلهٔ ۹: Preview/Access و Scope/Origin واقعی، بکاپ/Receiver/Restore مستقل طبق Gateهای پیشین؛ این نوبت ممیزی زنده تجدید نشد.
2. مرحلهٔ ۱۰: هویت، خدمات، محصولات، متن حقوقی، ترجمه و عکس واقعیِ مصوب؛ متن صفحهٔ Not-found نیز فقط در صورت انتشار منبع همان زبان نمایش داده می‌شود.
3. ادامهٔ مرحلهٔ ۱۲: مرور نهایی HTTP/متادیتا در Renderer جریانی و روی مقصد واقعی؛ عکس اجتماعی، داده‌های تکمیلی Article یا Organization/Product فقط با محتوای واقعی و منطبق با UI. هیچ Rich result/رتبه‌ای تضمین نشده است.
4. مرحلهٔ ۱۱ و B1–B7: Browser/Hydration، دسترس‌پذیری، عکس‌های نهایی و Baseline/CWV ثابت.
5. مرحلهٔ ۱۳: پذیرش نسخه، Rollback و اجازهٔ صریح Merge/Deploy/انتشار.

## منابع رسمی بررسی‌شده

- [Open Graph protocol](https://ogp.me/): URL، نوع، Locale و الزام تصویر برای متادیتای کامل؛ عکس غایب با تصویر فرضی پر نشد.
- [Google — HTTP status codes](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes): پاسخ 200 به معنی ایندکس‌شدن نیست؛ وضعیت واقعی 404 از ظاهر خطا جداست. URL قدیمی مستندات به این صفحه Redirect شد.
- [Google — Article](https://developers.google.com/search/docs/appearance/structured-data/article): فقط ویژگی‌های قابل استناد صفحه وارد شوند؛ نبود فیلد اجباری، مجوز جعل نویسنده/تصویر/تاریخ نیست. Rich Results Test و URL Inspection مقصد هنوز اجرا نشده‌اند.
- Source/Type نسخهٔ نصب‌شدهٔ TanStack برای HeadContent، Nonce، Asset و `defaultRenderHandler/renderRouterToString` مستقیماً خوانده و رفتار Response/Script اجرا شد.
- [Supabase Changelog](https://supabase.com/changelog): Markdown به علت Content-type خوانده نشد؛ HTML خوانده شد. Backend/TLS/Auth/DB تغییر نکرد و وضعیت محیط واقعی از اطلاعیه استنتاج نشد.
