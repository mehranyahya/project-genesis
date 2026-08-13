<!-- ACTIVE-2026-08-14 · Project Genesis operating contract -->
# Project Genesis agent contract

## Product identity

این پروژه تجربهٔ سفارش‌محور Mehrara برای سنگ مزار، سنگ ساختمانی و آثار و مصنوعات سنگی است؛ فروشگاه تراکنشی یا ERP نیست. فاز فعلی پرداخت آنلاین، سبد چندمحصولی، حساب مشتری، پنل مدیریت عمومی، آپلود عمومی و AI ندارد.

سایت عمومی از ابتدا دوزبانه است:

- فارسی در مسیرهای بدون پیشوند با `lang="fa"` و `dir="rtl"`
- انگلیسی حرفه‌ای در مسیرهای متناظر `/en/...` با `lang="en"` و `dir="ltr"`
- شناسه‌های عملیاتی مانند `REQ-1001` در هر دو زبان ثابت می‌مانند.
- نام برند و اطلاعات تماس محتوای عملیاتی‌اند و نباید با نام موقت داخل UI هاردکد شوند.

CTA محصولات کاتالوگی مسیر ثبت درخواست بررسی است. CTA بخش Stoneworks «درخواست ساخت» است و باید دسته، ابعاد و توضیحات سفارشی را تا فرم درخواست حفظ کند.

## Authority and delivery gates

- در محدوده‌ای که مالک صریحاً اجازه داده است، کارهای امن و قابل‌بازگشت تا رسیدن به یک اقدام ضروری مالک ادامه پیدا می‌کنند.
- هیچ Deploy یا تغییر Production، DNS، دامنه، Search Console یا انتشار عمومی بدون اجازهٔ صریح مالک انجام نمی‌شود.
- هر Migration دیتابیس فقط پس از بکاپ رمزنگاری‌شدهٔ موفق، Checksum معتبر و Restore drill انجام می‌شود.
- تغییرات ابتدا در Preview آزموده می‌شوند. Production از Preview جدا می‌ماند.
- `rate_limit_policy.enabled` تا پایان E2E موفق Preview باید `false` بماند.
- Secret، کلید، رمز، URL حاوی رمز یا دادهٔ واقعی مشتری هرگز در Git، Log، Issue، PR، پیام یا Artifact عمومی قرار نمی‌گیرد.
- Lovable برای UI و اصلاحات بصری اختیاری است. Backend، Migration، Workflow، Content واقعی و Deploy در Lovable انجام نمی‌شوند و مصرف کردیت Lovable پیش‌فرض نیست.

## Protected paths

Promptهای Lovable حق ساخت یا تغییر این مسیرها را ندارند:

`supabase/`, `wrangler.jsonc`, `.github/workflows/`, `scripts/`, `content/`, `ops/`, `src/server.ts`, `src/worker/`, `src/security/`, هر Migration، فایل Secret/Env واقعی، `AGENTS.md` و تنظیمات انتشار.

تغییر مستقیم مهندسی در این مسیرها فقط با Scope روشن، بررسی Diff و Gateهای همین قرارداد مجاز است. افزودن Package یا Route باید دلیل مشخص داشته باشد.

## Locale and content contract

- مسیرهای عمومی پایه در `src/lib/i18n/locale.ts` منبع واحد Route parity هستند.
- هر Route عمومی باید همتای انگلیسی، canonical خودارجاع، hreflang دوطرفه و `x-default` داشته باشد.
- Sitemap باید از همان قرارداد مسیر ساخته شود تا Stoneworks یا مسیر انگلیسی جا نیفتد.
- متن رابط، فرم، اعتبارسنجی، خطا، موفقیت، Empty/Loading state، Metadata و SEO باید در انگلیسی بدون نشت متن فارسی باشند.
- محتوای محصول، پرتفولیو، سایت و صفحات قانونی باید locale صریح داشته باشد. نبود ترجمه در English با fallback فارسی پنهان نمی‌شود؛ محتوا حذف یا صفحه `noindex` می‌شود.
- Routeها فقط Adapterها را مصرف می‌کنند:
  `getProducts()`, `getProduct(slug)`, `getPortfolioItems()`, `getGuides()`, `getGuide(slug)`, `getSite()`, `getPage(slug)`, `getCatalogVersion()`.
- JSON/Markdown مستقیم داخل Route import نمی‌شود. Runtime فقط Artifact پاک‌سازی‌شدهٔ Build را می‌خواند.
- دادهٔ واقعی غایب با `null`/لیست خالی و حذف Section مدیریت می‌شود؛ متن، قیمت، تماس، تصویر، Badge یا اعتماد ساختگی ممنوع است.

## UI contract

- شخصیت بصری `Quiet Material Intelligence / Mineral Signature` است: لوکس، آرام، معماری‌محور، دقیق و متریال‌محور.
- ساختار کلی Light-first است؛ Obsidian فقط برای Dark Momentهای کنترل‌شده، Header/Footer یا بخش روایی مناسب استفاده می‌شود. Dark-mode toggle و Theme fork نداریم.
- Primitiveهای برند فقط در `src/styles/tokens.css` تعریف می‌شوند:
  `#F4EFE6`, `#FBF9F4`, `#121212`, `#5C5850`, `#6B665E`, `#B9AA92`, `#203B34`, `#9C6B32`, و `#8F4C2F` فقط برای خطا.
- Componentها فقط Token معنایی مصرف می‌کنند؛ Raw Color بیرون Token/Test ممنوع است.
- کارت و قاب محتوا radius صفر دارند. Input و دکمه حداکثر `2px` و Border استاندارد `1px` است.
- Gradient تزئینی، Carousel خودکار، Spinner، Parallax و Animation library ممنوع‌اند.
- Mineral Glass فقط برای Header شناور، کنترل Gallery و نوار اقدام شناور مجاز است؛ کارت، Form، Filter، Table و Footer جامد می‌مانند.
- تصویر سنگ بدون Filter/Tint/Blend و روی Stage خنثی نمایش داده می‌شود.
- Focus واضح، Keyboard کامل، Reflow در ۳۲۰px، Zoom ۲۰۰٪، Skip Link، `prefers-reduced-motion` و هدف لمسی حداقل ۴۴px اجباری‌اند.
- متن بدنه `line-height: 1.9` و `letter-spacing: normal` دارد. فونت Vazirmatn محلی وزن ۴۰۰/۷۰۰ است.

## Request, price and privacy safety

- Browser فقط مبلغ نمایشی را از Artifact عمومی محاسبه می‌کند؛ Server منبع نهایی قانون و قیمت است.
- تقدم وضعیت قیمت `review > estimate > fixed` است. مبلغ Client مبنای ثبت نیست.
- سنگ ساختمانی فقط نوع‌های `marble|granite|travertine|crystal` و کاربردهای `facade|flooring|stairs|interior_wall|countertop|other` دارد.
- Option غیرفعال/ناسازگار: `409 SELECTION_UNAVAILABLE`. شناسهٔ ناشناخته یا Payload بدشکل: `422 VALIDATION_ERROR`.
- Success فقط پس از `REQUEST_CREATED|REQUEST_REPLAYED` معتبر و کد مطابق `^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{3,}$` نمایش داده می‌شود.
- نام، موبایل، شهر، محل و توضیح در URL، Query، Storage پایدار Client یا Log قرار نمی‌گیرند.
- آپلود رسانه فقط خصوصی، با بررسی حریم خصوصی/رضایت و خروجی Build پاک‌سازی‌شده مجاز است.

## Verification

- پیش از ویرایش، وضعیت شاخه و Diffهای موجود بررسی و تغییرات نامرتبط مالک حفظ می‌شوند.
- حذف، Skip یا ضعیف‌کردن تست برای Pass ممنوع است.
- برای هر تغییر مرتبط، `lint`، Test، Typecheck، Edge check، Build و Gate محتوایی موجود باید اجرا شوند.
- تغییر DB با بررسی Migration list، ACL/RLS، Advisorها و آزمون رفتار پس از Migration بسته می‌شود.
- خروجی کار باید فایل‌های تغییرکرده، Gateهای اجراشده، نتیجه، ریسک باقی‌مانده و اقدام ضروری مالک را روشن گزارش کند.
