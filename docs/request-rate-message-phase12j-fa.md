# تحویل ۱۲J — پیام محدودیت تلاش بدون مهلت حدسی

این بسته بر پایهٔ PR72، Commit `b19dcaa4305c90718d16ccb7f30de179d3bc6804` است. تنها تغییر تولیدی، متن فارسیِ وضعیت rate_limited و ترجمهٔ انگلیسی آن است. پنج مرحلهٔ اصلی ۹ تا ۱۳ و S3/Preview بازند.

## مشاهده و اصلاح

- **مشاهدهٔ کد/Artifact:** پیام رابط برای هر RATE_LIMITED می‌گفت «۱۰ دقیقه بعد دوباره تلاش کنید». تنظیم آماده‌شدهٔ Worker، ۳۰۰ تلاش در Period=60 ثانیه دارد؛ تابع مرز Worker در رد Binding، ۴۲۹ با `{code: "RATE_LIMITED"}` و بدون Retry-After می‌سازد. Edge برای محدودیت خودش Retry-After=600 دارد؛ این دو مسیر منبع یکسانی برای مدت انتظار نیستند و UI فعلی Header زمان را دریافت/مصرف نمی‌کند.
- **اجرای مستقیم:** خود `enforcePublicSubmitFloodLimit` با Binding ردکنندهٔ مصنوعی، همان Response حافظه را ساخت. Parser واقعی آن را rate_limited خواند؛ خود RequestFormState با LocaleProvider و React SSR واقعی در فارسی و انگلیسی هنوز عدد ثابت ده دقیقه را نمایش داد. fetch=0 و Retry-After=null بود؛ ادعای زمان انتظار از پاسخ این مسیر پشتیبانی نمی‌شد.
- **اصلاح محدود:** فارسی اکنون می‌گوید «تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.»؛ انگلیسی می‌گوید «Too many attempts. Please wait before trying again.» وضعیت/Response/Body/Parser قبل و بعد برابر و همان پانل خطا رندر شد؛ عدد تازه یا شمارش معکوس ساخته نشد.
- **مرز نتیجه:** Period یک تنظیم پنجره است، نه زمان باقی‌ماندهٔ قابل‌تضمین برای هر کاربر. رفتار زندهٔ Cloudflare/محدودیت DB و موفقیت درخواست بعدی از این Fixture اثبات نمی‌شوند. نمایش مدت دقیق فقط وقتی قرارداد معتبر زمان از سرور به رابط برسد، کار مستقلی خواهد بود؛ این بسته آن API یا Timer را اضافه نمی‌کند.

سیاست/شدت محدودیت، Worker، Gateway، Edge، DB، Headerهای سرور، Retry و داده/UUID/قیمت/Terms فرم تغییر نکردند. متن خطا و ترجمهٔ آن، پیام عملیاتی عمومی‌اند؛ خطای خام سرور یا جزئیات سهمیه نمایش داده نمی‌شود. پالت، Route، عکس، CSS، فونت، Package و Lockfile همان‌اند.

## شاهد و حدود آن

بازتولید قبل/بعد، تابع مرز واقعی Worker، Parser، LocaleProvider و Component واقعی پانل را اجرا و HTML دو زبان را مقایسه کرد. Response/status/body/retryAfter/outcome و fetch=0 برابرند؛ عدد نامعلوم از HTML حذف و انگلیسی بدون فارسی رندر شد. Binding فقط یک Test Double ردکننده است؛ محدودیت واقعی، Clock/Quota، شبکه، DOM/Hydration، Focus/Screen Reader، HTTP/Preview یا خوانایی نزد مخاطب واقعی آزموده نشدند.

برای اصلاح برگشت‌پذیرِ دو رشتهٔ رابط، تست تازه یا Harness مشابه پیاده‌سازی ساخته نشد. آزمون‌های موجود Worker/Parser/فرم/ترجمه و بازتولید مستقیم واقعی برای این Scope مصرف شدند؛ هیچ تست موجود حذف/Skip/ضعیف نشد. حالت انتظار ارسال و اعلان موفقیت صرفاً در منبع بررسی شدند؛ پذیرش آن‌ها همچنان مرحلهٔ ۱۱ است و نقص تازه‌ای برای تغییرشان اثبات نشد.

## بررسی‌ها

| بررسی                          | نتیجه                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| متمرکز موجود                   | ۸۷ موفق، صفر شکست، چهار فایل؛ Worker flood limit، Parser، Form و SSR زبان‌ها                                                      |
| مجموعهٔ کامل                   | ۹۹۹ موفق، صفر شکست، ۱۰۱ فایل                                                                                                      |
| پس از Generator واقعی آفلاین   | همان ۹۹۹/۰/۱۰۱؛ Source مستقل و ورودی مصنوعی، بدون دریافت زنده یا Build مشترک                                                      |
| Lint                           | صفر Error، ۲۹ Warning پیشین                                                                                                       |
| Typecheck، Edge، Audit         | موفق؛ دو Edge فقط Compile، صفر Advisory و بدون اتصال پروژهٔ زنده                                                                  |
| Content check و Build          | موفق                                                                                                                              |
| Artifact/فونت و strict dry-run | موفق، بدون Deploy                                                                                                                 |
| CI/Native                      | معیار تحویل: تمام ۱۹ گام CI استاندارد Head نهایی و نه سناریوی Native آفلاین Age v1.3.2؛ نتیجهٔ دقیق در PR و گزارش کامل ثبت می‌شود |
| انتشار محتوا/Readiness         | بسته؛ Readiness=false با ۲۴ Required Blocked، دو Deferred و دو Pass                                                               |

مجموعهٔ کامل محلی با `--timeout 60000` اجرا شد؛ مهلت‌های داخلی، Assertions و CI استاندارد تغییر نکردند. در این نوبت شکست Gate یا مشکل Fixture تازه‌ای ثبت نشد. تعداد تست افزایش نیافت؛ اصلاح از مشاهدهٔ مشخص و مقایسهٔ واقعی قبل/بعد است.

## هزینهٔ حجم

دو Build تولیدی تازه با Cache مستقل، همان محتوای تأییدشدهٔ خالی و Package/Lockfile یکسان مقایسه شدند. SHA256 همهٔ JS/CSS/WOFF2، Graph importهای static با Bun.Transpiler.scan و Gzip از Python سطح ۹/mtime=0 ثبت‌اند. [Snapshot حجم](request-rate-message-bundle-20261014.json) و [Readiness](request-rate-message-readiness-20261014.json) ثبت‌اند.

| خروجی                   |                 PR72 |             این بسته |                اختلاف |
| ----------------------- | -------------------: | -------------------: | --------------------: |
| JS اولیه، تعداد فایل    |                    ۳ |                    ۳ |                   صفر |
| JS اولیه، خام/Gzip      |      ۴۵۵۰۳۳ / ۱۴۰۷۰۰ |      ۴۵۵۰۲۵ / ۱۴۰۷۰۳ |               −۸ / +۳ |
| همهٔ JS، تعداد/خام/Gzip | ۲۱ / ۵۴۲۴۰۵ / ۱۷۰۸۴۹ | ۲۱ / ۵۴۲۳۸۸ / ۱۷۰۸۷۶ |             −۱۷ / +۲۷ |
| CSS، خام/Gzip           |         ۲۶۲۹۶ / ۶۲۷۱ |         ۲۶۲۹۶ / ۶۲۷۱ |        صفر؛ SHA برابر |
| دو WOFF2، خام/Gzip      |      ۱۳۰۹۷۲ / ۱۳۱۰۵۰ |      ۱۳۰۹۷۲ / ۱۳۱۰۵۰ | صفر؛ Binary/OFL برابر |

تغییر رشته و نام فایل‌های Hashدار، حجم خام و فشرده را یکسان تغییر نمی‌دهد. Resource/Timer/Listener/کتابخانه تازه نیست؛ این اختلاف کوچک، افزایش/کاهش سرعت یا CWV را ثابت نمی‌کند. B1–B7 با محتوا/مقصد واقعی همچنان باز است.

## ادامه و منابع

پذیرش واقعی پیام خطا/انتظار/موفقیت، Focus/اعلان و سه درخواست در مرحلهٔ ۱۱؛ عملکرد و سئو در مرحلهٔ ۱۲؛ S3/Preview مستقل، محتوای واقعی و حقوقی شرط انتشارند. ادامهٔ کد فقط با نقص مشخص و بازتولیدپذیر. Merge، Deploy، تغییر DB/Secret/Policy/Storage/Cloudflare یا پیام انجام نشد.

- [RFC 6585، بخش ۴](https://datatracker.ietf.org/doc/html/rfc6585#section-4): ۴۲۹ محدودیت تلاش را بیان می‌کند و Retry-After می‌تواند زمان انتظار را ارائه کند؛ خود Status مدت ثابت تعیین نمی‌کند. انتخاب متن بی‌عدد تصمیم UI پروژه است؛ پاسخ واقعی این پروژه شاهد جدا دارد.
- [Cloudflare Rate Limiting Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/): API با success، Period و ملاحظات Accuracy خوانده شد. ۳۰۰/۶۰ و نبود Header از Source/Artifact و تابع همین پروژه دیده شدند؛ تنظیم منتشرشده یا زمان باقی‌مانده از مستندات عمومی استنتاج نشد.
- Source بررسی‌شدهٔ همین Head: `src/server.ts`، `scripts/prepare-cloudflare-deploy.mjs`، `src/lib/gateway-submit.server.ts`، `supabase/functions/submit-request/index.ts`، `src/lib/request-submit.ts` و پانل خطا؛ فقط دو رشتهٔ Frontend تغییر کردند.
- [Supabase Changelog](https://supabase.com/changelog): برای Compile Edge موجود خوانده شد؛ Markdown با Content type خوانده نشد و HTML رسمی بررسی شد. Backend/Schema عوض نشد و دربارهٔ وضعیت پروژهٔ زنده نتیجه ساخته نشد.
