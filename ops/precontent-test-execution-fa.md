# بستهٔ اجرای محدود پیش از محتوا — P05

تاریخ: ۲۱ اکتبر ۲۰۲۶. مبنای بررسی Source: `abfab88665ab0c419934eb916cd654b72de6fa59`. این بسته همان Fixtureها و ابزارهای موجود را به شش مسیر نماینده و برگهٔ ۳۳ سناریوی گزارش متصل می‌کند؛ Runtime، محتوای عمومی، Schema، Workflow، Provider و Policy تغییر نمی‌کنند.

**وضعیت:** بازبینی و دستور اجرای محدود آماده است. محیط اجرای محلی در زمان تهیه در دسترس نبود؛ دستورهای زیر اینجا اجرا نشدند. نتیجهٔ CI از Run همان Head خوانده شود. آزمون Hook/SSR/Transport مصنوعی با مرورگر و ثبت واقعی DB جداست؛ این سند نتیجهٔ Pass برای P06 یا انتشار صادر نمی‌کند.

## شش مسیر نماینده و دادهٔ حداقلی

| خدمت / زبان | مسیر UI برای اجرای بعدی در Preview مجاز | Fixture موجود و آنچه واقعاً می‌آزماید |
| --- | --- | --- |
| مزار / fa | `/grave-stones/<slug-آزمایشی>` | Product selection با دو مدل/Variant مصنوعی و سپس RequestForm با source مزار؛ در تست‌های موجود انتخاب و فرم جدا اجرا می‌شوند و اتصال کامل Route→DB اثبات نشده است. |
| مزار / en | `/en/grave-stones/<synthetic-slug>` | همان شناسه‌های عملیاتی، متن انگلیسی و Terms انگلیسی؛ تغییر قیمت/شرایط و رسید با Transport تزریقی. |
| ساختمانی / fa | `/building-stone` | نوع granite، کاربرد other سپس facade، مساحت ۱۲٫۵/12.500 و شرح مصنوعی؛ نرمال‌سازی، review/null، Retry و تغییر انتخاب. |
| ساختمانی / en | `/en/building-stone` | همان دادهٔ معنایی و کنترل نبود متن فارسی در خلاصه؛ مسیر موفقیت شبیه‌سازی‌شده. |
| ساخت سفارشی / fa | `/stoneworks` → `/quote?source=stoneworks&category=sculpture_art` | دستهٔ sculpture_art سپس water_landscape؛ شرح و ابعاد آزمایشی در متن فرم، حفظ اطلاعات و Retry بدون تکرار پیشوند. |
| ساخت سفارشی / en | `/en/stoneworks` → `/en/quote?source=stoneworks&category=sculpture_art` | همان دسته و Brief انگلیسی؛ contract فعلی request_type=contact است؛ category/dimensions فیلد مستقل Payload نیستند. |

مسیرهای جدول هدف اجرای بعدی‌اند؛ Fixture فعلی صفحات را با Hook و Loader مصنوعی مستقیماً مصرف می‌کند و بازشدن این URLها در مرورگر را اثبات نمی‌کند. شناسه/Slug واقعاً نصب‌شده در Preview باید در شاهد همان اجرا ثبت شود؛ Slug نمونه را در Production نسازید.

حداقل دادهٔ آفلاین از Source فعلی بازاستفاده می‌شود: محصول/Variant مصنوعی بدون عکس واقعی، انتخاب ساختمانی، دو دستهٔ ساخت، فرم مصنوعی و Terms دو زبان. تصویر، برند، قیمت و تماس ساخته‌شده وارد `content/`، `public/`، Artifact تولیدی یا DB نمی‌شوند. Site در Fixtureهای خدمت null است؛ این آزمون داوری ظاهر نهایی یا محتوای برند نیست.

## ابزارهای موجود؛ بدون Runner جدید

| فایل | پوشش مشاهده‌شده در Source | حد نتیجه |
| --- | --- | --- |
| [Product selection](../src/lib/route-defs/product-selection-runtime.test.ts) | تغییر مدل/Variant، حفظ انتخاب هم‌معنی و ساخت Payload مزار در fa/en؛ شبکه و Storage تعامل مسدودند. | Handler و Payload؛ اتصال کامل فرم/HTTP/DB نیست. |
| [Consent](../src/lib/forms/request-consent-runtime.test.ts) | Source مزار/تماس، قیمت fixed/estimate/review، Terms هم‌زبان، تأیید صریح، Replay/Conflict و رسید معتبر؛ ۲۶ سناریوی داخلی. | Hook/SSR و Gateway/Terms با dependency تزریقی؛ Consent حقوقی/DOM واقعی نیست. |
| [Service flow](../src/lib/forms/service-flow-runtime.test.ts) | هر دو زبان: ۸ Transport ساختمانی و ۱۰ ساخت/تماس، حفظ Brief و هویت Retry؛ فقط کد پیگیری در sessionStorage. | این ۱۸ فراخوانی، درخواست واقعی یا ۱۸ تست مستقل نیستند؛ fetch واقعی باید صفر بماند. |
| [Security recovery](../src/lib/forms/request-verification-runtime.test.ts) | ۱۲ سناریوی داخلیِ تأیید امنیتی، پاسخ دیررس و حفظ فرم؛ Timer/Token مصنوعی. | Turnstile واقعی، مرورگر یا پذیرش DB نیست. |
| [Terms link](../src/lib/forms/request-terms-link-runtime.test.ts) | رفتار لینک/زمینهٔ شرایط با ابزار موجود. | تب بومی، Keyboard و قارئ صفحه در مرورگر هنوز لازم‌اند. |
| [Submit contract](../src/lib/request-submit.test.ts) | Status/Code معتبر، خطاها، Timeout و Transport تزریقی. | دادهٔ ناقص Unit test یا پاسخ ساختگی ورودی مناسب E2E نیست. |

Fixtureها در پوشهٔ موقتِ هر تست ساخته و در finally حذف می‌شوند؛ Moduleهای mock در فرایند جدا هستند. global fetch در Fixtureهای Runtimeِ بالا خطا می‌دهد و شمار آن باید صفر بماند. اطلاعات تماس نمونهٔ Unit test ممکن است به شمارهٔ واقعی شباهت داشته باشد؛ هرگز آن را به مقصد شبکه/پیام تبدیل نکنید.

## ترتیب اجرای قابل تکرار

۱. Head/Tree، پایهٔ PR و Diff را تازه بررسی کنید. Checkout جدا از کار مالک، dependency قفل‌شده و نسخه‌های موجود Bun/Deno/Age را استفاده کنید؛ کلید یا URL محیط واقعی لازم نیست. برای اجرای کامل، Binaryهای لازم باید حاضر باشند؛ فقدان آن‌ها نتیجهٔ Pass یا Skip پذیرفته نیست.

۲. ابتدا مجموعهٔ مرتبط را با ابزار موجود اجرا کنید:

```sh
bun test src/lib/route-defs/product-selection-runtime.test.ts src/lib/forms/request-consent-runtime.test.ts src/lib/forms/service-flow-runtime.test.ts src/lib/forms/request-verification-runtime.test.ts src/lib/forms/request-terms-link-runtime.test.ts src/lib/request-submit.test.ts
```

۳. Gateهای قرارداد پروژه را به ترتیب اجرا کنید؛ Lint هم‌زمان با تست‌هایی که Fixture موقت می‌سازند اجرا نشود:

```sh
bun run lint
bun test
bunx tsc --noEmit
bun run edge:check
bun run content:check
bun run build
```

دستورهای بالاتر Gateهای محلی مرتبط‌اند؛ CI موجود علاوه بر آن‌ها Audit، رمزنگاری آفلاین و Artifact/Dry-run را هم اجرا می‌کند. تغییر یا دورزدن CI برای این بسته لازم نیست. نتیجهٔ Test موفق فقط به همان Source و روش اجرا تعلق دارد.

۴. برای هر شش مسیر، در برگهٔ موجود ثبت کنید: Commit/Tree، زبان/خدمت، Fixture/نسخهٔ داده، روش اجرا، نتیجهٔ مشاهده‌شده و انتظار، مرجع شاهد و موارد Blocked. روش‌های «Hook/Transport مصنوعی»، «مرورگر با پاسخ شبیه‌سازی‌شده» و «E2E با ثبت DB» سه برچسب جدا دارند. تعداد Scenario داخلی با تعداد تست‌های Wrapper جمع دوباره نشود.

## اتصال به برگهٔ ۳۳ سناریوی موجود

- REQ01–REQ03: شش مسیر بالا نقطهٔ شروع‌اند؛ اتصال Route/Browser/DB هنوز P06 است.
- REQ05–REQ11 و NET01–NET03/NET05: از پاسخ‌های مصنوعی موجود قیمت/Terms/رسید/Replay/Conflict/خطا استفاده شود؛ نتیجه فقط به لایهٔ واقعاً اجراشده تعلق دارد. قطع واقعی شبکه با rejectکردن Transport یکی نیست.
- UI04–UI08 و REQ12: بررسی DOM/فوکوس/قارئ صفحه/تب، تعویض زبان و History/Storage مرورگر همچنان اجرا می‌خواهد؛ SSR یا mock آن‌ها را Pass نمی‌کند.
- UI01–UI03، ASSET01–ASSET05، NET04 و SEO01–SEO03: اجرای واقعی محیط/رابط/HTTP لازم است. عکس و سنجش رنگ سنگ یا عملکرد نهایی تا محتوای معتبر Blocked Content می‌مانند.
- REQ04 و سایر جزئیات همان برگهٔ اصلی حفظ‌اند؛ این بسته مجموعهٔ جایگزین، کاهش پوشش یا ۳۳ شرط تازه نیست. برگهٔ کامل در آخرین گزارش تجمعی مرجع پذیرش است.

## انتقال از Fixture آفلاین به Preview؛ هنوز انجام‌نشده

۱. Preview جدا، Access، Origin/Turnstile، Worker/Edge/Schema هماهنگ و Gate بکاپ/Restore طبق [راهنمای محیط](environment-acceptance-fa.md) تأیید شوند. برای پیش‌آزمون Policy false بماند.

۲. دادهٔ موقت با Scope/نسخه و روش حذف مشخص، از مسیر ابزار فعلی همان محیط ساخته شود. Synthetic بودن آشکار، عدم ورود به خروجی عمومی و عدم انتشار/ایندکس لازم‌اند. این سند SQL Seed، Migration یا مجوز ورود داده نیست؛ Payload/Hashهای Unit test مستقیماً کپی نشوند.

۳. گیرندهٔ کنترل‌شده، مسئول آزمون و پنجرهٔ E2E مشخص باشند. شماره‌های نمونه یا تصادفی مقصد پیام نیستند. Fixtureهای Terms آفلاین به سند مصوب برند تبدیل نشوند؛ Registry/سند محیط آزمون باید طبق قرارداد نسخهٔ همان اجرا پذیرفته شود.

۴. فقط در پنجرهٔ صریح مجاز همان Preview، Policy با همهٔ محدودیت‌ها فعال شود. موفقیت ثبت با یک ردیف/کد معتبر، اعلان با شاهد Provider/گیرنده و رسیدگی انسانی جدا بررسی شوند. در پایان یا شکست Policy false و وضعیت Scheduler/Provider/دادهٔ آزمایشی مطابق طرح جمع‌آوری تأیید شود. Production تغییر نکند.

[قرارداد انتشار](release-coordination-fa.md) و [رسیدگی پایه](request-response-fa.md) مکمل‌اند. وجود این بسته، موفقیت بازیابی، ارسال پیام، پذیرش مرورگر، محتوای واقعی یا اجازهٔ انتشار نیست.

## یادداشت اعتبارسنجی وابستگی

پس از ثبت این راهنما، CI در Audit وابستگی متوقف شد. اصلاح محدود Vite/launch-editor، روش تولید قفل و حدود اعتبارسنجی در [گزارش همین بسته](../docs/precontent-p05-20261021-fa.md) آمده است. آخرین Run مربوط به Head فعلی ملاک است؛ نتیجهٔ قبلی به Head تازه تعمیم داده نمی‌شود.
