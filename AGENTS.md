<!-- V23.3-EXEC-01 · Mehrara-Launch-Core-Final-v23.3 -->
# Mehrara agent contract

## Product identity

این پروژه «تجربهٔ فروشگاهی سفارش‌محور تا ثبت درخواست بررسی؛ نه فروشگاه تراکنشی/ERP» است. فاز اول پرداخت، سبد چندمحصولی، حساب مشتری، پنل مدیریت، CMS بصری، آپلود عمومی، چندزبانه و AI ندارد. CTA اصلی دقیقاً `انتخاب و ثبت سفارش` است.

## Execution control

- حالت پیش‌فرض `STOP` است. هر Prompt فقط Scope خودش را اجرا می‌کند و مرحلهٔ بعد، Retry یا Fix تازه بدون اجازهٔ مالک ممنوع است.
- شناسهٔ فعال فقط `V23.3-EXEC-01` است. هر دستور نسخهٔ ۲۳٫۲ یا قدیمی‌تر منسوخ است. قراردادهای Backend، Database، Security و Routing تثبیت‌شده در V23.2 بدون کاهش یا بازطراحی حفظ می‌شوند؛ V23.3 قرارداد بصری و Delivery Gateها را یکپارچه می‌کند.
- `Bootstrap 00` فقط پس از Workspace Knowledge خالی، Workspace Skill صفر، Default access برابر Workspace، People تأییدشده و `Enable Cloud = Never allow` اجرا می‌شود. Orchestration بیرونی چهار Upload/File ID و Knowledge attachment صفر، Create با `wait=false` و Set/Get فوری `visibility=private` پیش از Widget/Preview/Poll دارد؛ در Pro این مقدار Workspace-private است، نه Restricted فقط‌مالک، و Share preview link عمومی ساخته نمی‌شود. initial_message فقط همین `AGENTS.md` و سه Asset فونت/OFL را byte-for-byte نصب می‌کند و Feature، Route، Package، Backend، Integration و Publish در آن ممنوع‌اند. Prompt ۱ فقط پس از `BOOTSTRAP 00 PASS` و Get-empty/Set/Get دقیق Project Knowledge اجرا می‌شود و هیچ خروجی UI قبلی فرض نمی‌کند. از Prompt ۲ به بعد Gate مرحلهٔ قبل باید ثبت شده باشد.
- Lovable فقط UI Scaffold را می‌سازد. Backend، Migration، Deploy، GitHub Workflow، Content واقعی و عملیات خارج از Promptهای Lovable هستند.
- Availability کاتالوگ Workspace برای Cloud/Supabase اتصال پروژه نیست. پیش از Prompt ۱ باید `get_database_status.enabled=false`، `get_project.is_published=false`، Screenshot نبود Supabase خارجی متصل و نبود Package/Import/Client/URL/Key پیکربندی‌شدهٔ Supabase در Source/Dependency/Env ثبت شده باشد.

## Protected paths

هیچ Prompt Lovable حق ساخت یا تغییر این مسیرها را ندارد:

`supabase/`, `wrangler.jsonc`, `.github/workflows/`, `scripts/`, `content/`, `ops/`, `src/server.ts`, `src/worker/`, `src/security/`, هر Migration، فایل Secret/Env واقعی، `AGENTS.md`, Project Knowledge و Preflight.

افزودن Package یا Route فقط وقتی مجاز است که همان Prompt نام و دلیل آن را صریحاً ذکر کند. URL مطلق، Secret، Supabase URL/Key و دادهٔ واقعی مشتری در UI ممنوع است.

## UI contract

- شخصیت کل سیستم `Quiet Material Intelligence` است: آرام، معماری‌محور، دقیق، قابل‌اعتماد و متریال‌محور. `Quiet Monumental Luxury` فقط لحن زیرشاخهٔ سنگ مزار است و Theme، Token set یا Fork جداگانه نمی‌سازد.
- فارسی، `lang="fa"`, `dir="rtl"`, Mobile-first و Vazirmatn محلی وزن ۴۰۰/۷۰۰ با Fixture `۱۲۰×۶۰ «مهرآرا»… MA-1001` اجباری است. `letter-spacing: normal` و line-height متن بدنه دقیقاً `1.9` است.
- فاز اول Light-first است. Dark Mode، Toggle، ذخیرهٔ ترجیح و تغییر خودکار سیستم ممنوع است؛ Componentها فقط Token معنایی مصرف می‌کنند.
- Primitiveهای مجاز فقط `#F3F1EB`, `#FCFBF8`, `#F2F2F0`, `#171918`, `#5C605B`, `#D8D3C9`, `#6B706A`, `#173F3A`, `#8F4C2F`, `#111413` هستند. Raw Color بیرون فایل Token/Test ممنوع است و `#D8D3C9` مرز تعاملی نیست.
- کارت و قاب محتوا radius صفر دارند. Input و دکمهٔ استاندارد حداکثر `2px` و Border استاندارد `1px` است. Gradient، Carousel خودکار، Spinner، Parallax و Animation library ممنوع‌اند.
- `Mineral Glass` فقط برای Header شناور، کنترل Gallery و نوار اقدام شناور مجاز است: زمینه `rgba(252,251,248,.88)`، Blur `14px`، Radius `14px` و fallback مات `.96`. کارت، Form، Filter، Table و Footer جامد می‌مانند و Glass روی Glass ممنوع است.
- Motion فقط کنترل `180ms`، پنل `250ms` و تصویر/محور برش `360ms` است؛ Zoom تصویر حداکثر `1.03` و `prefers-reduced-motion` اجباری است.
- Focus برابر `2px solid var(--color-focus)` با offset `2px` است؛ روی زمینهٔ تیره `--color-focus-inverse` مصرف می‌شود. Error هرگز فقط با رنگ بیان نمی‌شود.
- تصویر سنگ بدون Filter/Tint/Blend و روی Stage خنثی نمایش داده می‌شود. کارت رسانه `4:5`، محصول کامل `object-contain` و جزئیات `object-cover` است.
- Hero روشن در Desktop پنج ستون متن و هفت ستون تصویر دارد و متن روی عکس ممنوع است. Dark Moment فقط روایی و فقط با دادهٔ واقعی مجاز است.
- Focus واضح، Keyboard کامل، Reflow در ۳۲۰px، Zoom ۲۰۰٪، Skip Link و حداقل هدف لمسی ۴۴px اجباری‌اند. Skeleton ثابت و بدون Shimmer است.

## Content and adapters

Routeها فقط این Adapterها را مصرف می‌کنند:

`getProducts()`, `getProduct(slug)`, `getPortfolioItems()`, `getGuides()`, `getGuide(slug)`, `getSite()`, `getPage(slug)`, `getCatalogVersion()`.

Registry شرایط فقط Server/Build است. JSON/Markdown مستقیم داخل Route Import نمی‌شود. دادهٔ واقعی غایب با Adapter خالی/`null` و حذف کامل Section مدیریت می‌شود؛ متن، قیمت، تماس، تصویر، Badge یا اعتماد ساختگی ممنوع است. Fixture فقط در Test/Dev و خارج از Bundle منتشرشونده مجاز است.

## Order and price safety

- Browser فقط مبلغ نمایشی را از Artifact عمومی محاسبه می‌کند؛ Server منبع نهایی قانون و قیمت است.
- تقدم وضعیت قیمت `review > estimate > fixed` است. مبلغ Client هرگز مبنای ثبت نیست.
- سنگ ساختمانی فقط نوع‌های `marble|granite|travertine|crystal` و کاربردهای `facade|flooring|stairs|interior_wall|countertop|other` دارد؛ `area_m2` اختیاری/عددی است، `area_estimate` ممنوع و کل درخواست در فاز اول `review` است. برای `application=other` توضیح Trim‌شدهٔ ۱۰–۵۰۰ نویسه در `customer_note` اجباری است و داخل Snapshot گزینه‌ها قرار نمی‌گیرد.
- Option شناخته‌شدهٔ غیرفعال/ناسازگار: `409 SELECTION_UNAVAILABLE`. شناسهٔ ناشناخته/Payload بدشکل: `422 VALIDATION_ERROR`.
- Success فقط پس از پاسخ معتبر `REQUEST_CREATED|REQUEST_REPLAYED` و کد مطابق `^MA-[1-9][0-9]{3,}$` نمایش داده می‌شود. Timeout یا خطا Success جعلی نمی‌سازد و State فرم را پاک نمی‌کند.
- نام، موبایل، شهر، محل و توضیح در URL، Query، Storage پایدار یا Log قرار نمی‌گیرند. Request Draft پیش از فرم فاقد PII است.

## Verification

پیش و پس از هر Prompt، Diff و مسیرهای Protected کنترل شوند. Typecheck/Test/Build فقط اگر Script معتبر موجود است باید Exit 0 بدهد؛ Lint فقط در صورت وجود Script اجرا می‌شود. حذف/Skip تست موجود برای Pass ممنوع است. خروجی هر Prompt باید فایل‌های تغییرکرده، Commandها، نتیجهٔ Gate، هزینهٔ واقعی و جملهٔ توقف را گزارش کند.
