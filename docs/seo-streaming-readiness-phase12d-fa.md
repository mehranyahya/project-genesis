# ۱۲D — خروجی جریانی و دادهٔ فعال‌سازی صفحه

تاریخ ثبت: ۲۰۲۶-۱۰-۱۴ به وقت تهران. پایه: PR66، Commit `a3d6b4782395ccd06c18afe8eb1952c4357a66fe` و Tree `22573559495cfce519e924f17890290e2dcba3eb`. این بسته ادامهٔ مستقلِ آماده‌سازی کد مرحلهٔ ۱۲ است؛ پنج مرحلهٔ اصلی ۹ تا ۱۳ و پذیرش S3/Preview بازند.

## مسئله و اصلاح

**مشاهدهٔ بازتولیدشده:** خطای واقعی Repository برای Slug تکراری، HTTP 500 و نمای عمومیِ خطا داشت، اما `Error.message` داخلی در Script دادهٔ Dehydration ارسال می‌شد. آزمون تازه روی کپی دقیق PR66 شکست خورد و `new Error("Ambiguous product translation")` را در خروجی جریانی دید. بنابراین حذف متن خطا از View، به‌تنهایی حذف آن از پاسخ صفحه نبود. اطلاعات شخصی واقعی در این بررسی استفاده نشد.

**اصلاح:** Adapter کوچک `publicErrorSerialization` در `createStart` ثبت شد. مقدار عمومیِ سریال‌شدهٔ هر `Error`، `null` است؛ بازسازی، یک `Error` با پیام ثابت `Page data unavailable` می‌دهد. متن اصلی، Stack، Cause، نام سفارشی و ویژگی‌های افزوده از این Adapter منتقل نمی‌شوند. سرور برای تشخیص و نمایش داخلی همچنان خطای اصلی را دارد؛ وضعیت HTTP در Router مستقل از دادهٔ سریال‌شده است. وضعیت 500 برای خطای عملیاتی و 404 برای غیبت/شناسهٔ خراب حفظ می‌شوند. خطای `notFound` موجود از نوع Error عمومی نیست و به خطای 500 تبدیل نشده است.

ثبت Adapter از تنظیمات رسمی Start به SSR و Client می‌رسد. Source/Type نصب‌شدهٔ `createStart`، `createStartHandler`، `hydrateStart`، `dehydrateMatch` و Pluginهای Seroval مستقیماً بررسی شدند. نسخهٔ وابستگی‌ها، Lockfile و قرارداد هشت Adapter محتوا تغییر نکردند. دادهٔ تجاری/عکس/نام/تماس/نویسنده/تاریخ انتشار ساخته نشد و طراحی یا پالت عوض نشد.

## شاهد اجرای واقعی و مرز آن

آزمون تازه `ssr-streaming-runtime.test.ts` در فرآیند جدا و آفلاین، **getRouter واقعی پروژه، Route Tree واقعی، RootShell/Scripts واقعی، Loader/Head/Viewها، Readerهای Artifact و defaultStreamHandler واقعی** را اجرا می‌کند. تنها Artifactهای ورودی، URL فایل CSS، تبدیل محیطی `createIsomorphicFn` و Transport تبدیل‌شدهٔ Server Function جدا شده‌اند؛ Builder مصنوعی، Validator و Handler واقعی محتوا را اجرا می‌کند. هیچ واکشی شبکه‌ای مجاز نیست؛ شمار fetch صفر تأیید شد.

- دو زبان، دو User Agent معمولی/Googlebot و Origin پیکربندی‌شده/غایب: **۷۶ پاسخ جریانی ساخته شد؛ ۷۴ پاسخ کامل مصرف و دو Stream با Dispose واقعی لغو شدند**. این‌ها دادهٔ مصنوعی‌اند و شمار بازدید یا آزمون شبکه نیستند.
- `serverSsr.dehydrate()` واقعی پیش از رندر فراخوانی شد. داده از Script تولیدشده با VM خوانده شد، نه از LoaderData پیش از سریال‌سازی. Map بازسازی Adapter و وضعیت پایان Stream کنترل شدند.
- محصول/راهنمای غایب، Slug نامعتبر و URL ناشناخته: HTTP 404، noindex و نبود Canonical/Alternate/OG URL/Schema کاذب در پاسخ. Slug تکراریِ واقعی Repository: HTTP 500، noindex و Error عمومیِ بازسازی‌شده.
- مقالهٔ معتبر: HTTP 200، زبان/جهت درست، OG Locale و نوع یگانه، عنوان شامل `</script>` بدون خروج از Script و بدون تغییر عنوانِ بازسازی‌شده. بدون Origin، Article/OG URL جعلی تولید نشد؛ noindex همچنان خواندنی بود و Article نداشت.
- محصول و فرم درخواستِ خواندنی: HTTP 200 و دادهٔ موفق. Query/Hash خصوصیِ **مصنوعی** وارد HTML/دادهٔ این پاسخ‌ها نشد؛ این شاهدِ منع همهٔ داده‌های ممکن یا پذیرش فرم واقعی نیست.
- Failure کنترل‌شدهٔ Loader مسیر موجود با پیام/Cause/Stack/نام/Property مصنوعی: HTTP 500 و نبود مقادیر داخلی در پاسخ کامل. این یک تزریق آفلاینِ خطاست، نه رخداد Production.
- nonce از Factory واقعی Crypto پروژه آمد؛ در هر پاسخ معتبر، متفاوت و همسان با CSP و تمام Scriptها بود. Asset مربوط به Route نامطابق به Script/Manifest دادهٔ صفحه وارد نشد.
- پایان پاسخ و Dispose، Cleanup دقیقاً یک‌بار داشتند؛ Dispose تکراری دوباره Cleanup نکرد. قطع ارتباط واقعی، واکشی کند، Deferred Promise دیررس و رفتار Worker/CDN هنوز پذیرفته نشده‌اند.

**مرز مهم:** اجرای Script با VM، Hydration DOM، فعال‌شدن دکمه‌ها یا نبود خطای Hydration در مرورگر را ثابت نمی‌کند. Manifest و فایل ورودی Client مصنوعی بودند؛ دریافت و اجرای Bundle واقعی مرورگر، Middleware شبکه، RPC مرورگر و Header/HTTPS/Access مقصد هنوز آزمون همان Preview را لازم دارند. Adapter انواع Error را پوشش می‌دهد؛ دربارهٔ Object دلخواهِ Throwشده یا همهٔ داده‌های عمومی ادعای پاک‌سازی جامع نمی‌کند. محدودیت قبلی Preview محلی با Host یا Browser جایگزین دور زده نشد.

## کنترل‌های بسته

| کنترل | نتیجه و دامنه |
| --- | --- |
| Regression روی PR66 | شکست مورد انتظار؛ پیام داخلیِ Repository در Script وجود داشت. همان آزمون پس از اصلاح موفق است. |
| آزمون محلی با Source ثابت | ۹۸۴ موفق، صفر Fail، ۹۵ فایل؛ `bun test --timeout 60000`. |
| پس از تولید محتوا | Generator واقعی با منبع آفلاین، Catalog Version مصنوعی، مقالهٔ reviewed مصنوعی و مراجع رسانهٔ مصنوعی؛ سپس ۹۸۴/۰/۹۵. اصل عکس، DB یا شبکهٔ واقعی استفاده نشد. |
| Lint/Type | صفر Error، ۲۹ Warning موجود؛ TypeScript بدون خطا. |
| Edge/Content/Audit | هر دو Edge Function Check، Content check و Audit با صفر Advisory موفق؛ اجرای DB/API زنده نیست. |
| Build/Artifact | Build تازه، Prepare و Verify Artifact و Wrangler strict dry-run موفق؛ Deploy نیست. |
| CI/Native | CI همان Head پس از ثبت PR و لاگ مستقیم Job بررسی می‌شود؛ تا ثبت آن، موفق فرض نشود. |
| Release/Readiness | Release check عمداً با Exit 1 مسدود است؛ Readiness=false، ۲۴ Required Blocked، دو Deferred و دو Pass. |

اجرای اولیهٔ محلی به ENOENT ناشی از پیمایش Lint هم‌زمان با حذف پوشهٔ Fixture، Timeout پیش‌فرض ۵۰۰۰ms در CLI سنگین و پیام Native Runtime برخورد کرد. علت دقیق پیام Native اثبات نشده است. نتیجهٔ جدول از اجراهای پایدار نهاییِ Source ثابت با Timeout محلی ۶۰۰۰۰ms است؛ Assertionها، محدودیت داخلی ابزارها، وابستگی‌ها و Workflow CI برای Pass تغییر نکردند. Lint و آزمون‌های همان Checkout جدا اجرا شدند. نتیجهٔ CI استانداردِ همان Head جدا ثبت می‌شود.

## هزینهٔ حجم و روش

دو Build با همان Artifact عمومیِ خالی و وابستگی‌های ثابت، در Cacheهای مستقل ساخته شدند. خروجی‌های تولیدیِ متعلق به این کار پیش از ساخت نهایی پاک شدند. خروجیِ دارای Asset قدیمی از اندازه‌گیری نهایی کنار گذاشته شد؛ یک Entry عمومی و Graph Import ثابت آن با `Bun.Transpiler.scan` تأیید شدند. همهٔ JS/CSS/WOFF2 عمومی و SHA ثبت‌اند؛ Gzip از Python، سطح ۹ و mtime=0 است.

| بخش | PR66 خام / Gzip | ۱۲D خام / Gzip | اختلاف |
| --- | --- | --- | --- |
| JS اولیه؛ Entry + Import ثابت | 454295 / 140345 | 454481 / 140417 | +186 خام، **+72 Gzip** |
| همهٔ ۲۰ فایل JS | 540456 / 170095 | 540642 / 170156 | +186 خام، +61 Gzip |
| CSS | 26276 / 6248 | 26276 / 6248 | نام/اندازه/SHA برابر |
| دو فونت | 130972 / 131050 | 130972 / 131050 | نام/اندازه/SHA برابر |

[JSON اندازه و SHA](seo-streaming-readiness-bundle-20261014.json) و [Snapshot آمادگی](seo-streaming-readiness-20261014.json). هیچ درصد افزایش/افت سرعت، LCP/INP/CLS، Lighthouse، رتبه یا برتری جهانی از این حجم یا شمار تست‌ها نتیجه گرفته نشد. حجم HTML با عکس/متن واقعی، Hydration و عملکرد مقصد در B1–B7 بازند.

## ادامه و محدودیت انتشار

پذیرش واقعی Preview مستقل/Cloudflare/Access، تنظیمات و Scope کلید، بکاپ ماندگار و Decrypt/Restore با Receiver اصلی، اصل رسانه، محتوای دوزبانه/حقوقی، مرورگر/درخواست واقعی و B1–B7 هنوز لازم‌اند. این بسته آن Gateها را به Pass تبدیل نمی‌کند. Merge، Deploy، Migration، تغییر DB/Policy/Secret/Storage/Cloudflare، ورود اصل عکس یا ارسال پیام انجام نشده است.

ادامهٔ مستقلِ قابل بررسی، مرور Cache و ارسال فایل‌های ثابت و CSS/فونت بحرانی در Artifact است؛ پذیرش مرورگر/سرعت پس از آماده‌شدن محیط و محتوا باقی می‌ماند. هدف، پالت و نیازهای محتوای مصوب در گزارش کامل محفوظ‌اند.

منابع: [TanStack Router SSR](https://tanstack.com/router/latest/docs/guide/ssr)، [Start execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)، [Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) و Source/Type دقیقِ نصب‌شده. مستندات عمومی برای API Serializer جزئیات کاملِ نسخهٔ نصب‌شده ندادند؛ ثبت Adapter و رفتار آن با سورس رسمی/Type و اجرای واقعی راستی‌آزمایی شد. [Supabase Changelog](https://supabase.com/changelog) نیز خوانده شد؛ مسیر Markdown خطای خواندن داشت و HTML رسمی استفاده شد. اطلاعیهٔ TLS و مطالب SDK به وضعیت واقعی محیط پروژه تعمیم داده نشدند.
