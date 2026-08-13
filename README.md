# Project Genesis

وب‌سایت دوزبانهٔ سفارش‌محور Mehrara برای سنگ مزار، سنگ ساختمانی و آثار و مصنوعات سنگی (Stoneworks). این پروژه فروشگاه پرداخت‌محور نیست؛ کاربر محصول یا خدمت را بررسی می‌کند و درخواست ساخت/بررسی سفارش ثبت می‌کند.

## وضعیت معماری

- Frontend و SSR: TanStack Start + React 19 + Vite
- Runtime و Deploy: Cloudflare Workers
- Database, Storage و Edge Functions: Supabase
- زبان‌ها: فارسی در `/` و انگلیسی در `/en`
- محتوا: صفحات بررسی‌شده از Git و داده/رسانهٔ عملیاتی از Supabase، سپس Artifact پاک‌سازی‌شدهٔ Build
- طراحی: Light-first با سیستم `Mineral Signature` و Dark Momentهای محدود

مسیرهای اصلی در هر دو زبان شامل Home، Memorial Stones، Building Stone، Stoneworks، Portfolio، Guides، Quote، About، Contact، Privacy و Terms هستند.

## اجرای محلی

نسخهٔ Bun پروژه در `package.json` قفل شده است.

```sh
git clone <repository-url>
cd project-genesis
bun install --frozen-lockfile
bun run dev
```

فرمان‌های اصلی:

```sh
bun run lint
bun test
bun run edge:check
bun run content:check
bun run build
```

## محتوا

صفحات Git در `content/pages/` نگهداری و با فرمان زیر تولید می‌شوند:

```sh
bun run content:generate
```

داده و رسانهٔ عملیاتی Supabase فقط در زمان Build خوانده می‌شوند و با این فرمان به Artifact عمومی امن تبدیل می‌شوند:

```sh
bun run structured:generate
```

Build انتشار علاوه بر تست‌های معمول، `content:release-check` را اجرا می‌کند تا Privacy/Terms بررسی‌شده، Terms registry و Artifact ساختاریافته موجود باشند. نبود محتوای واقعی باید به Empty state یا `CONTENT_BLOCKED` منجر شود؛ Fixture و اطلاعات ساختگی وارد خروجی انتشار نمی‌شوند.

## تنظیمات و Secretها

نام متغیرهای لازم در `.env.example` مستند شده‌اند. مقدار واقعی Secretها فقط در Secret store مقصد قرار می‌گیرد و نباید در Repository، PR، Log یا پیام ثبت شود.

برای بکاپ و بازیابی Supabase به [ops/supabase-backup-restore.md](ops/supabase-backup-restore.md) مراجعه کنید. هر Migration عملیاتی به بکاپ رمزنگاری‌شدهٔ موفق، Checksum معتبر و Restore drill وابسته است.

## انتشار

Workflowهای GitHub Actions از Secret/Variableهای جداگانهٔ Preview و Production استفاده می‌کنند.

- Preview پیش‌فرض آزمون و تأیید است.
- Production، DNS و انتشار عمومی فقط با اجازهٔ صریح مالک انجام می‌شود.
- `rate_limit_policy.enabled` تا پایان E2E موفق Preview خاموش می‌ماند.
- `PUBLIC_INDEXING` در Preview باید `false` باشد.

## Lovable

پروژه با Lovable همگام است و برای اصلاح UI می‌توان از آن استفاده کرد، اما Backend، Migration، Workflow، محتوای واقعی و Deploy خارج از Scope آن هستند:

https://lovable.dev/projects/be793b77-d478-4a00-b423-7d282bd08424

قرارداد اجرایی کامل و به‌روز در [AGENTS.md](AGENTS.md) قرار دارد.
