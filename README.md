# Project Genesis

## دستور دقیق به Lovable

پروژهٔ تازه را فقط Bootstrap کن. هیچ صفحه، Feature، Route، Component، Style، Content، Package، Backend، Database، Cloud resource، Integration، GitHub sync، Deploy یا Publish نساز و هیچ قابلیت محصول را شروع نکن.

Package جدید و Route جدید صریحاً ممنوع‌اند.

فقط این چهار نوشتن مجاز است و محتوا باید **byte-for-byte** از پیوست متناظر کپی شود:

- `AGENTS.md` ← پیوست `AGENTS.md`
- `public/fonts/vazirmatn-400.woff2` ← پیوست `vazirmatn-400.woff2`
- `public/fonts/vazirmatn-700.woff2` ← پیوست `vazirmatn-700.woff2`
- `public/fonts/OFL.txt` ← پیوست `OFL.txt`

Project Knowledge به این پیام پیوست نشده است؛ آن را حدس نزن، نساز و داخل Repository قرار نده. سامانهٔ بیرونی فقط پس از Bootstrap Pass آن را با API مستقل و Get-empty/Set/Get فعال می‌کند.

فایل‌های Scaffold پایه‌ای که خود پلتفرم هنگام ایجاد پروژه می‌سازد فقط خوانده شوند. به‌جز چهار مسیر مجاز بالا هیچ فایل موجود یا تازه‌ای را تغییر نده. هیچ Command نصب، Upgrade، Format یا Codegen اجرا نکن. `AGENTS.md` و فایل‌های باینری را بازنویسی، Normalize یا تبدیل نکن.

به‌طور خاص همهٔ این مسیرها Protected و خارج Scope هستند: `supabase/`, `wrangler.jsonc`, `.github/workflows/`, `scripts/`, `content/`, `ops/`, `src/server.ts`, `src/worker/`, `src/security/`, هر Migration، فایل Secret/Env واقعی، Project Knowledge و Preflight. `AGENTS.md` فقط همان استثنای چهارمسیرهٔ بالا است و پس از کپی Protected می‌شود.

پس از نوشتن چهار فایل فقط این موارد را گزارش کن:

- Framework و Package manager خوانده‌شده از فایل‌های واقعی پروژه؛
- فهرست دقیق فایل‌های ایجاد/تغییرکرده؛
- SHA-256 و اندازهٔ چهار فایل مجاز؛
- هر Script موجود Baseline که بدون نصب Dependency تازه قابل اجرا بوده و Exit code آن؛
- تأیید صریح اینکه UI/Route/Package/Backend/Database/Integration/Publish ساخته نشده است.

اگر پیوستی غایب است، مسیر مقصد قابل‌تشخیص نیست، Framework واقعی TanStack Start نیست، یا برای انجام این Scope نیاز به تغییر فایل دیگری داری، هیچ حدسی نزن و با `BOOTSTRAP 00 FAIL / PROMPT_01_NOT_RUN` توقف کن.

در پایان موفق دقیقاً با `BOOTSTRAP 00 PASS / PROMPT_01_NOT_RUN` توقف کن. Prompt ۱ یا هیچ Fix دیگری را خودکار اجرا نکن.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/be793b77-d478-4a00-b423-7d282bd08424).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
