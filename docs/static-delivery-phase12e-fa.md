# ۱۲E — ارسال فایل‌های ثابت و فونت نسخه‌دار

تاریخ: ۲۰۲۶-۱۰-۱۴ به وقت تهران. پایه: PR67، Commit `7b6ee43a0b67ab7ca825b99beba8da556121f731` و Tree `6037baa506b136db49b01ea040d119d074ee45cd`. این بسته آماده‌سازی مستقل کد B4/B5 است؛ پنج مرحلهٔ اصلی ۹ تا ۱۳ و پذیرش واقعی S3/Preview بازند.

## مشاهده، تصمیم و اصلاح

**مشاهدهٔ فایل واقعی:** CSS و Root، فونت‌های `/fonts/estedad-400-500.woff2` و `/fonts/beiruti-500.woff2` را با نام ثابت می‌خواندند. `_headers` خروجی ساخت، Cache یک‌ساله/immutable را فقط برای `/assets/*` داشت؛ فونت‌های پیشین داخل آن مسیر نبودند. این به معنی خراب‌بودن فونت یا مشاهدهٔ Header زنده نیست.

**منبع رسمی:** Cloudflare برای Asset معمولی، Cache قابل Revalidate و ETag را مستند می‌کند؛ برای فایل Fingerprinted، Cache بلندمدت را پیشنهاد می‌کند. مطابق مستند Vite، Asset واردشده و URL نسبی CSS به Graph ساخت و نام Hashed وارد می‌شوند؛ فایل Public به همان نام کپی می‌شود. **استنباط پروژه:** انتقال فونت‌های ثابت به این Graph، امکان استفاده از قانون موجودِ immutable را فراهم می‌کند، با تغییر خودکار آدرس هنگام تغییر فایل. کاهش درخواست Revalidation در بازدید مجدد وابسته به پذیرش Header مقصد و باقی‌ماندن فایل در Cache مرورگر است؛ مشاهدهٔ عملیِ آن هنوز نداریم. 304 قبلی هم الزاماً دانلود مجدد ۱۳۰KB نبود.

**اصلاح:** دو Binary بدون تغییر بایت به `src/assets/fonts` منتقل شدند. `@font-face` از URL نسبی استفاده می‌کند؛ Root URL همان دو فایل را با `?url` وارد و Preload می‌کند. دو فایل OFL در Public محفوظ‌اند. Vite یک نسخه از هر فونت زیر `/assets` تولید می‌کند و قانون موجود Cache برای آن مسیر است؛ `public/_headers`، CSP، nonce، مسیر Worker، Preview Indexing و قواعد امنیتی تغییر نکردند.

فونت Estedad با وزن ۴۰۰–۵۰۰، Beiruti با وزن ۵۰۰، `font-display: swap`، `font-synthesis: none` و تمام رنگ‌ها، اندازه‌ها، جهت‌ها و ریتم خواندن محفوظ‌اند. شکل حروف/گلیف‌ها و حجم دو Binary عین مبناست؛ CSS ساخته‌شده پس از یکسان‌سازی فقط دو URL فونت، دقیقاً با مبنا برابر بود. هیچ Animation، Package، Route، درخواست محتوا یا وابستگی فونت خارجی اضافه نشد.

## شاهد اجرا و کنترل ساخت

Gate رسمی موجود `verify-cloudflare-deploy.mjs` اکنون بررسی فونت را هم اجرا می‌کند؛ Workflow و قواعد قبلی حذف/ضعیف نشده‌اند. Helper فقط هنگام بررسی Artifact اجرا می‌شود و در Runtime سایت قرار نمی‌گیرد.

- یک CSS و Entry جاری؛ نام Hashed، URL داخلی `/assets`، یکتایی دو Font Face، وزن مصوب و swap، URL مشترک CSS/Client و تطابق Binary ساخته‌شده با Source کنترل می‌شوند. فونت اضافی، Entry قدیمی، آدرس Inline/خارجی/Query‌دار یا تغییر بایت رد می‌شوند.
- Gate تازه روی Artifact واقعی PR67، به‌علت URL ثابت و خارج از Cache Fingerprinted، شکست مورد انتظار داد. خروجی ساخت تازهٔ نسخهٔ اصلاح‌شده پذیرفته شد.
- آزمون واقعی Vite، دو Build کوچک آفلاین از Importهای فونت Root و CSS واقعی پروژه اجرا کرد. CSS و دادهٔ Preload هر Build یک URL داشتند، دو فونت تکرار نشدند؛ تغییر بایت فقط در کپی موقت Estedad، URL آن را عوض کرد و URL Beiruti ثابت ماند. Source اصلی دست‌نخورده است؛ آزمایش، صحت فایل تغییرکرده برای نمایش فونت را ادعا نمی‌کند.
- Pinهای SHA فونت/OFL حفظ شدند؛ آزمون تایپوگرافی به مسیر جدید تطبیق یافت و همچنان همان خانواده/وزن/swap/Preload/Crossorigin و SHAها را الزام می‌کند.
- Fixture بررسی Preview/Production به Artifact مثبت فونت تکمیل شد؛ هیچ بررسی جدایی محیط، کلید، Origin، Var یا اطلاعات خصوصی حذف نشد.
- خود ساخت تولیدی پروژه و Gate آن، این URLها را تأیید کردند: `/assets/estedad-400-500-Cv9mMFZq.woff2` و `/assets/beiruti-500-Cm2w1lY_.woff2`. Hash نام Vite با SHA256 ثبت‌شده یکی نیست؛ هویت بایت جدا مقایسه شد.

**حد پذیرش:** اشتراک URL در CSS/دادهٔ Client و Source Preload بررسی شد؛ مصرف واقعی شبکه، Cache HIT مرورگر، اعتبار MIME/Header مقصد، DOM/Hydration، FOUT/CLS یا خوانایی عکس/فونت در موبایل هنوز پذیرفته نیست. Rendererهای آفلاین Bun، Asset Import را به نام فایل محلی Resolve می‌کنند؛ آزمون آن‌ها از Build Vite/ارسال مرورگر جداست. قانون `_headers` برای Asset است و Header پاسخ Worker را ثابت نمی‌کند. محدودیت قبلی Preview محلی با میزبان/مرورگر جایگزین دور زده نشد.

## بررسی‌ها

| کنترل | نتیجه و دامنه |
| --- | --- |
| آزمون متمرکز | ۲۸ موفق در پنج فایل: Pinهای طراحی/فونت، جریان/متادیتا، Gate/تغییر بایت و جدایی محیط. |
| مجموعهٔ کامل | ۹۸۹ موفق، صفر Fail، ۹۶ فایل؛ محلی `bun test --timeout 60000`. |
| پس از Generation | CLI واقعی با منبع آفلاین، Version/راهنما/مراجع رسانهٔ مصنوعی؛ سپس ۹۸۹ موفق، صفر Fail، ۹۶ فایل در کپی مستقل. اصل رسانه/DB/شبکه واقعی نیست. |
| Lint/Type/Edge | Lint صفر Error و ۲۹ Warning موجود؛ TypeScript و هر دو Edge Function check موفق. |
| Content/Audit | Content check و Audit با صفر Advisory موفق؛ Release check با Exit 1 همچنان به‌علت محتوای واقعی ناقص مسدود است. |
| Build/Artifact | Build تولیدی تازه، Prepare، Verify با Gate فونت و Wrangler strict dry-run موفق؛ Deploy نیست. |
| CI/Native | CI استاندارد همان Head و لاگ مستقیم Native، پس از ثبت PR، در PR و گزارش کامل تأیید می‌شوند؛ پیشاپیش Pass فرض نشوند. |
| Readiness | false؛ ۲۴ Required Blocked، دو Deferred و دو Pass. محیط، محتوا و پذیرش واقعی هنوز لازم‌اند. |

Dependency/Lockfile، Workflow CI، Timeout داخلی ابزارها و Assertionهای رفتار موجود تغییر نکردند. Buildهای مبنا/نامزد در Cache مستقل و خروجی جاری انجام شدند؛ شمار تست یا اندازهٔ Bundle شاهد سرعت واقعی نیست.

## اندازه و نتیجهٔ محدود

| بخش | PR67 خام / Gzip | ۱۲E خام / Gzip | اختلاف |
| --- | --- | --- | --- |
| Graph اولیهٔ دو فایل JS | 454481 / 140417 | 454510 / 140443 | +29 خام، **+26 Gzip** |
| همهٔ ۲۰ JS | 540642 / 170156 | 540671 / 170167 | +29 خام، +11 Gzip |
| CSS | 26276 / 6248 | 26296 / 6271 | +20 خام، **+23 Gzip**؛ URL فونت عوض شده |
| دو WOFF2 | 130972 / 131050 | 130972 / 131050 | صفر اختلاف بایت/SHA؛ مسیر خروجی نسخه‌دار |

هزینهٔ JS+CSS اولیه **۴۹ بایت Gzip** است. نام/Hash فونت در مسیر تغییر کرده، اما اندازه/SHA باینری و مجوز آن ثابت‌اند. Cold load همچنان همان فایل‌های فونت را لازم دارد؛ دربارهٔ درصد سرعت، LCP/INP/CLS، Lighthouse، رتبه، زمان بارگذاری یا Cache HIT واقعی ادعا نمی‌شود. Gzip از Python سطح ۹ با mtime=0، Graph از `Bun.Transpiler.scan` و Import ثابت است؛ همهٔ ۲۳ فایل JS/CSS/WOFF2 عمومی بررسی شدند.

[JSON حجم/SHA و شاهد فونت](static-delivery-bundle-20261014.json) و [Snapshot آمادگی](static-delivery-readiness-20261014.json).

پذیرش واقعی Preview مستقل، Cloudflare/Access، تنظیمات/کلید، بکاپ ماندگار/Restore مستقل، محتوای دوزبانه/حقوقی، عکس اجتماعی، درخواست/مرورگر و B1–B7 باقی‌اند. آماده‌سازی فنی فونت، مجوز Merge/Deploy نیست؛ هیچ تغییر محیط/DB/Schema/Policy/Secret/Storage، اصل عکس یا پیام انجام نشده است.

منابع اصلی: [Cloudflare Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/)، [Vite Assets](https://vite.dev/guide/assets)، [Vite build API](https://vite.dev/guide/api-javascript#build) و Source/Type نسخهٔ نصب‌شده. صفحهٔ Font best practices گوگل در ابزار خطای خواندن داشت و ادعایی از آن ساخته نشد. [Supabase Changelog](https://supabase.com/changelog) رسمی خوانده شد؛ نسخهٔ Markdown خطای Content type داشت و HTML استفاده شد، بدون تعمیم TLS/SDK به محیط واقعی پروژه.
