# نتیجهٔ آماده‌سازی P05 و اصلاح مانع امنیت وابستگی — ۲۱ اکتبر ۲۰۲۶

بستهٔ P05 در [دستور اجرای محدود](../ops/precontent-test-execution-fa.md) ثبت است: شش مسیر نمایندهٔ سه خدمت و دو زبان، Fixture/Runner موجود، اتصال به برگهٔ ۳۳ سناریو و تفکیک Hook/SSR از مرورگر/ثبت واقعی. Fixture یا Route عمومی تازه، دادهٔ DB، عکس، متن برند یا شرایط ساختگی منتشر نشد.

## نقص مشاهده‌شده و اصلاح محدود

[CI نسخهٔ راهنما](https://github.com/mehranyahya/project-genesis/actions/runs/39495232066)، Head `0f52f2407f9287633d1aaed4c3478201e92cbb68`، در Audit با دو رکورد Moderate برای یک Advisory مشترک متوقف شد؛ مراحل Test/Build بعدی skipped بودند. نسخهٔ سبز قبلی، این Run تازه را سبز نمی‌کند.

- Vite: `8.1.5` → `8.1.6`، Pin دقیق در devDependencies.
- launch-editor: `2.14.1` → `2.14.2`، Override دقیق برای وابستگی غیرمستقیم Devtools.
- [Advisory رسمی](https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv) مشکل escape روی Windows و پیش‌شرط‌های دست‌کاری فایل/محیط را توضیح می‌دهد. دادهٔ فعلی شاهد نصب نسخهٔ مشمول است؛ بهره‌برداری یا اثر روی Production اثبات نشده است.

محیط اجرای محلی unavailable بود. برای نگهداری Checksum/Metadata واقعی، قفل با Bun پین‌شدهٔ 1.3.14 در [Job موقت فقط‌خواندنی](https://github.com/mehranyahya/project-genesis/actions/runs/39495759651) تولید شد: بدون Secret، دسترسی نوشتن یا اجرای Script بسته‌ها. package.json در آن Job تغییر نکرد؛ bun.lock تولید و Audit موفق با پیام `No vulnerabilities found` شد. قفل از خروجی همان Bun گرفته شد؛ Integrity یا Metadata حدس زده نشد.

مقایسهٔ مجموعهٔ Artifactهای قفل، فقط دو نسخهٔ بالا را حذف/اضافه کرد. Bun محل Hoist و سه ورودی نسخه‌های **قبلی** picomatch 4.0.5/4.0.7 را هم بازچینی کرد؛ این تغییر عمداً ثبت می‌شود. سایر Overrideها و نسخه‌های Artifactها ثابت‌اند؛ این نتیجه ادعای ثابت‌بودن تمام Resolution edgeها یا خروجی Build نیست.

فایل Workflow موقت در Commit `89bfc2b436d05f545f104e75cfca5f4ccaeeb19e` حذف شد. CI اصلی، گیت Audit و نصب `--frozen-lockfile` بدون تغییر باقی‌اند. [اجرای میانی CI](https://github.com/mehranyahya/project-genesis/actions/runs/39495759530) هنگام آماده‌سازی Manifest و پیش از ثبت قفل، پذیرش نهایی نیست؛ نتیجهٔ مورد قبول باید Run جدید روی Manifest/Lock ثبت‌شده و بدون Workflow موقت باشد.

**آماده‌سازی فنی P05 با ابزار موجود و CI کد وصله‌شده تکمیل است؛** اجرای واقعی P06 و به‌روزرسانی فایل گزارش تجمعی هنوز بازند. این سند تازه نتیجهٔ CI بالایی را ثبت می‌کند و نتیجهٔ Head تازه از همان PR پیگیری می‌شود.

## معیار پذیرش و کار باز

- [x] شش مسیر، ابزار/دادهٔ موجود و حدود نتیجه از Source بررسی شدند؛ تنها مستند اجرای P05 افزوده شد.
- [x] نسخه‌های وصله و دامنهٔ Advisory از منبع اولیه تأیید؛ قفل با Bun واقعی تولید و Graph آن بررسی شد.
- [x] Audit قفل پیشنهادی در Job تولید موفق شد؛ این جای CI کامل نسخهٔ نهایی را نمی‌گیرد.
- [x] [CI نسخهٔ ثبت‌شدهٔ قفل، Run 39495991206](https://github.com/mehranyahya/project-genesis/actions/runs/39495991206)، Commit `89bfc2b436d05f545f104e75cfca5f4ccaeeb19e` و Base=PR79: تمام ۱۹ گام موفق؛ ۱۰۲۳ تست/۱۰۷ فایل، صفر Fail در ۵۷٫۹۲ ثانیه؛ Audit بدون آسیب‌پذیری، نصب Frozen، Lint/Typecheck/Edge/Build، نه سناریوی رمزنگاری آفلاین و Artifact/Dry-run موفق. نتیجهٔ Head پس از ثبت این سند از PR خوانده شود.
- [x] هر شش فایل آزمونِ دستور متمرکز در Log اجرای کامل CI همان نسخه حضور و نتیجهٔ موفق دارند. اجرا در این نوبت فقط از طریق CI بود؛ اجرای محلی انجام نشده است و تکرار محلی به شرط اضافی پایان بسته تبدیل نمی‌شود.
- [ ] P06: مرورگر، شبکه/Turnstile واقعی، ثبت یکتا/اعلان/رسیدگی در Preview مجاز؛ آماده‌سازی و تست مصنوعی این Gateها را Pass نمی‌کند.
- [ ] به‌روزرسانی فایل گزارش تجمعی: آخرین نسخهٔ ذخیره‌شده ۴۷ و مبتنی بر P04 است. به‌علت نبود محیط فایل، نتیجهٔ P05 هنوز به آن اضافه نشده؛ این سند و PR مرجع موقت نتیجهٔ این مرحله‌اند.

main، Production، DB/Policy/Secret، Cloudflare، دامنه، ارسال پیام و پرداخت تغییر نکردند. محدودیت قبلی مرورگر/Preview با مسیر دیگر دور زده نشد؛ Job تولید صرفاً قفل وابستگی عمومی را ساخت. تغییر Compiler می‌تواند روی Build اثر بگذارد؛ ثابت‌بودن ۲۴ Asset یا سرعت واقعی برای این بسته ادعا نمی‌شود.

منابع فنی: [قفل و نصب Bun](https://bun.com/docs/pm/cli/install)، [نسخهٔ ثابت Advisory Database](https://github.com/github/advisory-database/blob/ca81e5e10f0e2bffdef04b987374f1be3b131df7/advisories/github-reviewed/2026/10/GHSA-698v-4r3x-3vcv/GHSA-698v-4r3x-3vcv.json). تاریخ ورود Advisory به Database و تاریخ انتشار صفحهٔ Maintainer یکسان نیستند؛ از آن‌ها دربارهٔ زمان وقوع بهره‌برداری نتیجه گرفته نشد.
