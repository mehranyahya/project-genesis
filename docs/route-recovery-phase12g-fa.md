# تحویل ۱۲G — بازیابی خطای بارگذاری صفحه

این بسته بر پایهٔ PR69، Commit `b7afc73d8386b084bfeccb09d515c00c1e474c07` است. Scope آن رفتار Retry در Root و شش نمای خطای فهرست مزار، محصول، ساخت مرحله‌ای، پرتفولیو، فهرست راهنما و مقاله است. پنج مرحلهٔ اصلی ۹ تا ۱۳ و S3/Preview بازند.

## مشاهده و اصلاح

- **مشاهدهٔ مستقیم:** در نسخهٔ نصب‌شده، `router.invalidate()` Loader داده را دوباره اجرا می‌کند؛ `lazyRouteComponent` Promiseِ شکست‌خوردهٔ import را در حافظه نگه می‌دارد. در آزمون Router/Module واقعی، Loader دو بار اجرا و importer فقط یک بار اجرا شد؛ خود Component همچنان همان Error را پرتاب کرد. Retry قبلی درخواست دریافت سند تازه نمی‌داد و آزمون Red شکست خورد.
- **اصلاح مشترک:** `retryRouteError` از تشخیص موجود `isModuleNotFoundError` در Router Core استفاده می‌کند؛ برای الگوهای شناخته‌شدهٔ خطای native ESM فقط هنگام کلیک کاربر `window.location.reload()` را درخواست می‌کند. هیچ تشخیص رشته‌ای تازه، وابستگی/ارتقای بسته، Timer یا Retry خودکار افزوده نشده است.
- **خطای داده:** مسیر قبلی `router.invalidate()` و Reset موجود Root حفظ است. خطای پایدار به موفقیت، Empty جعلی یا محتوا تبدیل نمی‌شود. استثنای خواندن Error یا منع Reload، مانع تلاش قبلی برای داده نمی‌شود.
- **پوشش رابط:** Error واقعی از Router به دکمه‌های شش نمای نام‌دار می‌رسد؛ راهنما/مقاله نیز آن را به ErrorState مشترک می‌دهند. ظاهر، پیام عمومی/ترجمه، هدف ۴۸px، Focus، Palette، فرم/قیمت/Terms و Schema درخواست تغییر نکردند.
- **مرز داده:** Error خام در UI/URL/Log/Storage تازه قرار نمی‌گیرد؛ تشخیص فقط برای انتخاب نوع Retry است. Root همان Diagnostic بسته/ایمن را حفظ کرد. تست، حالت «Reload خودکار قبلیِ Framework مصرف شده» را با Storage مصنوعی می‌سازد؛ رفتار خودکار موجود کتابخانه عوض نشده است.

## شاهد اجرا و حدود آن

یک آزمون مستقل Bun، Router حافظه، Loader، invalidate، lazy importer، Cache و خود callbackهای ErrorViewها را اجرا می‌کند. ۱۴ سناریوی Root شامل سه الگوی شناخته‌شدهٔ Module در دو زبان، دادهٔ گذرا/پایدار، Getter پرتاب‌کننده و Reload ممنوع است. ۲۴ سناریوی دیگر دکمهٔ هر شش نمای فرعی را در دو زبان برای خطای کد و داده می‌آزماید؛ جمع ۳۸ سناریو، fetch=0 و صفر Storage write تازه.

useRouter/useRouterState/useEffect و Locale برای callback مستقیم جایگزین شده‌اند؛ متن UI با React SSR واقعی رندر شد. Reload تابع مصنوعی است؛ پس از پاک‌شدن علت، یک Component تازه در Realm مصنوعی با import موفق آماده شد. این، دریافت واقعی سند/فایل کد، رفتار Browser Cache، DOM/Hydration، Error Boundary تعاملی، Network یا Preview نیست.

این اصلاح فقط Signatureهای شناخته‌شدهٔ تشخیص فعلی کتابخانه را پوشش می‌دهد. Error ناشناخته مسیر قبلی داده را دارد. بازخوانی کامل سند، حافظهٔ موقت رابط را از نو می‌سازد؛ Draft خصوصی برای حفظ آن به Storage منتقل نشده است. در Preview باید با قطع/بازگشت شبکه، فایل قدیمی پس از انتشار، Storage در دسترس/ممنوع، کلیک کاربر، زبان/Query مجاز و حالت فرم واقعی پذیرفته شود. صرفاً رندر خطا، Reload تازه‌ای آغاز نمی‌کند.

## بررسی‌ها و رخدادهای آزمون

| بررسی | نتیجه |
| --- | --- |
| متمرکز | ۱۱ موفق، صفر شکست، شش فایل؛ شامل ۳۸ سناریوی callback/Router/SSR |
| مجموعهٔ کامل | ۹۹۷ موفق، صفر شکست، ۹۹ فایل |
| پس از Generator واقعی آفلاین | همان ۹۹۷/۰/۹۹؛ کپی مستقل و دادهٔ مصنوعی، بدون Build مشترک یا دریافت زنده |
| Lint نهایی | صفر Error و ۲۹ Warning پیشین، پس از اتمام آزمون و پاک‌سازی Fixtureهای موقت متعلق به همین اجرا |
| Typecheck، Edge و Audit | موفق؛ دو ورودی Edge فقط Compile شدند، صفر Advisory و بدون اتصال پروژهٔ زنده |
| Content check و Build | موفق |
| Artifact/فونت و strict dry-run | موفق، بدون Deploy؛ Guardهای پیشین حفظ‌اند |
| CI/Native | معیار بسته: تمام ۱۹ گام CI استاندارد Head نهایی و نه سناریوی Native آفلاین Age v1.3.2؛ نتیجهٔ دقیق در PR و گزارش کامل ثبت می‌شود |
| انتشار محتوا/Readiness | بسته؛ Readiness=false با ۲۴ Required Blocked، دو Deferred و دو Pass |

اولین اجرای مثبت Fixture به‌دلیل استفادهٔ مجدد از Tree تغییریافتهٔ Router شکست خورد؛ سناریوها به Tree تازه با Options واقعی Root منتقل شدند و Assertions مربوط به Cache حفظ شدند. سه اجرای محلی Lint، فایل SSR آزمایشی باقی‌مانده را به‌عنوان Source دیدند و ۷۲ Error دادند؛ پس از تأیید پایان پردازش و حذف فقط Fixtureهای متعلق به آزمون، Gate نهایی موفق شد. Rule/Ignore و تست تولیدی حذف، Skip یا ضعیف نشدند. CI استاندارد و مهلت‌های داخلی تغییر نکردند؛ Test محلی مجموعهٔ کامل با `--timeout 60000` اجرا شد.

## هزینهٔ حجم و دریافت

دو Build تولیدی تازه با Cache مستقل و همان محتوای تأییدشدهٔ خالی/Package/Lockfile مقایسه شدند. همهٔ فایل‌های عمومی JS/CSS/WOFF2، SHA256، Graph importهای static با Bun.Transpiler.scan و Gzip با Python سطح ۹/mtime=0 اندازه‌گیری شدند. [Snapshot حجم](route-recovery-bundle-20261014.json) و [Readiness](route-recovery-readiness-20261014.json) ثبت‌اند.

| خروجی | PR69 | این بسته | اختلاف |
| --- | ---: | ---: | ---: |
| JS اولیه، تعداد فایل | ۲ | ۳ | یک فایل مشترک اضافه |
| JS اولیه، خام | ۴۵۴۵۱۰ | ۴۵۴۸۶۱ | +۳۵۱ |
| JS اولیه، Gzip | ۱۴۰۴۴۲ | ۱۴۰۶۵۵ | +۲۱۳ |
| همهٔ JS، تعداد/خام/Gzip | ۲۰ / ۵۴۱۱۱۲ / ۱۷۰۳۰۸ | ۲۱ / ۵۴۱۷۵۵ / ۱۷۰۶۹۰ | +۱ فایل / +۶۴۳ / +۳۸۲ |
| CSS، خام/Gzip | ۲۶۲۹۶ / ۶۲۷۱ | ۲۶۲۹۶ / ۶۲۷۱ | صفر؛ SHA دقیقاً برابر |
| دو WOFF2، خام/Gzip | ۱۳۰۹۷۲ / ۱۳۱۰۵۰ | ۱۳۰۹۷۲ / ۱۳۱۰۵۰ | صفر؛ Binary/OFL دقیقاً برابر |

فایل مشترک `route-error-retry` فقط ۱۴۲ بایت خام/۱۴۴ Gzip دارد و در فهرست preloads Manifest واقعی Build ثبت است؛ انتخاب ساخت مشترک از تکرار منطق در هفت نمای خطا جلوگیری می‌کند. این شاهد، نحوهٔ درخواست/Waterfall واقعی را ثابت نمی‌کند. هزینهٔ یک Resource بیشتر، به‌رغم حجم کوچک، باید در B1/B3 سنجیده شود؛ کاهش/افزایش درصد سرعت یا CWV ادعا نمی‌شود. بازخوانی سند تنها در Retry دستیِ خطای شناخته‌شده است؛ بارگذاری معمول، Listener/Timer/افکت تازه ندارد.

## ادامه

بازیابی واقعی مرورگر/شبکه در مرحلهٔ ۱۱ و اندازه‌گیری B1–B7 در مرحلهٔ ۱۲ باقی است. بازبینی مستقل بعدی فقط برای نقص مشخص و بازتولیدشده ادامه یابد؛ آمادگی S3/Preview مستقل، عکس/متن و حقوقی هنوز شرط پذیرش/انتشارند. Merge، Deploy و تغییر DB/Secret/Policy/Storage/Cloudflare انجام نشدند.

## منابع و نوع شواهد

- [TanStack Data Loading / Error handling](https://tanstack.com/router/latest/docs/guide/data-loading): تفکیک Reset مرز رندر و invalidate داده.
- [lazyRouteComponent API](https://tanstack.com/router/latest/docs/api/router/lazyRouteComponentFunction): importer و preload رسمی؛ رفتار Cache از Source نصب‌شده و اجرای واقعی تأیید شد، نه صرفاً این صفحهٔ API.
- Source دقیقِ نسخهٔ نصب‌شده: `@tanstack/react-router/src/lazyRouteComponent.tsx` و `@tanstack/router-core/src/router.ts`، `load-matches.ts` و `utils.ts`. الگوها از تابع موجود کتابخانه مصرف شدند؛ هیچ تضمین برای همهٔ مرورگرها/خطاها ساخته نشد.
- [Supabase Changelog](https://supabase.com/changelog): برای Compile Edge موجود خوانده شد؛ Markdown با Content type خوانده نشد و HTML رسمی بررسی شد. هیچ تغییر API/Schema/Backend یا ارزیابی تازهٔ پروژهٔ زنده از آن نتیجه گرفته نشد.
