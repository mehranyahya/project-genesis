# بکاپ و بازیابی فایل‌های اصلی سنگ — دامنهٔ آفلاین

تاریخ: ۲۰۲۶-۱۰-۱۱. ابزار اولیه بر پایهٔ ممیزی S3 و تکمیل رمزنگاری بر پایهٔ `de3faff0ff85f49ca874481e1870ffb20c1f3b8a`، PR55، آماده شد. پذیرش محیط، بکاپ Production یا Restore روی Supabase انجام نشده است. [قرارداد پروژه](../AGENTS.md) و [پذیرش S3](environment-acceptance-fa.md) همچنان برقرارند.

## هدف و مرز فعلی

بکاپ دیتابیس شامل بایت عکس‌های Storage نیست. برای هر نسل، آرشیو مستقل عکس‌های اصلی لازم است؛ فایل اصلی با نسخهٔ WebP/AVIF سایت جایگزین نمی‌شود. این ابزار آرشیو عکس‌ها را به **SHA-256 فایل رمزنگاری‌شدهٔ همان نسل دیتابیس** پیوند می‌دهد. اشتراک تاریخ یا نام فایل به‌تنهایی اثبات سازگاری منبع نیست.

`scripts/storage-backup.py` هیچ اتصال شبکه، SQL تغییردهنده یا Upload ندارد. پنج فرمان دارد:

| فرمان     | کار واقعی                                                                            | چیزی که اثبات نمی‌کند                                        |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `pack`    | بررسی Inventory قبل/بعد، تمام فایل‌ها، اندازه و ETag ساده؛ ساخت ZIP خصوصی با SHA-256 | خودِ دانلود از Supabase، هویت پروژه یا توقف واقعی نویسنده‌ها |
| `verify`  | خواندن جریانی همهٔ بایت‌ها، CRC/ETag/SHA-256، Layout و سقف‌ها، بدون Extract          | اصالت فرستنده یا امکان Decrypt با کلید آفلاین                |
| `encrypt` | اجرای `age` موجود در PATH، فایل `0600` و Sidecar؛ حذف خروجی جدید در شکست             | نصب/اعتماد به Binary، نگهداری کلید خصوصی و بازیابی مستقل     |
| `decrypt` | کنترل Sidecar، اجرای کامل `age` با Identity خصوصی، بررسی ZIP و نسل؛ حذف خروجی ناقص   | هویت مبدأ واقعی، Receiver اصلی، کپی ماندگار یا Restore زنده  |
| `recover` | بررسی دوباره و بازیابی در پوشهٔ جدید `0700`، فایل‌های `0600` و برنامهٔ مقصد مستقل    | وجود/خالی‌بودن/خصوصی‌بودن مقصد یا Upload موفق                |

در PR55 بسته‌بندی/Verify/بازیابی محلی با Fixture اجرا شدند؛ Binary واقعی Age موجود نبود. اکنون `scripts/check-storage-crypto.py` آزمون واقعی آفلاین را در CI **اجباری** می‌کند. Binary رسمی `age v1.3.2` برای Linux/amd64 با SHA-256 ثابت `cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10` نصب می‌شود؛ ابزار غایب، شکست است و Skip/Pass نمی‌شود. نتیجهٔ اجرا باید با Head و Run همان تحویل ثبت شود.

آزمون، کلید X25519 موقتی، PNG مصنوعی بزرگ‌تر از ۱۲۸KiB، Key فارسی و Payload آزمایشی DB را واقعاً رمزنگاری و باز می‌کند؛ Payload DB، Dump/Restore دیتابیس نیست. ZIP و Export اولیه پیش از بازیابی حذف می‌شوند. ۹ سناریو شامل Round-trip/Recover، Identity اشتباه، Checksum نادرست، فساد انتهای Payload با Sidecar دوباره‌محاسبه‌شده، فایل بریده، Plaintext نامعتبر، نسل/Ref ناسازگار، خروجی موجود و دسترسی Identity است. کلید/Plaintext/خروجی خام Subprocess چاپ یا Upload نمی‌شوند و Workspace موقت جمع می‌شود. این آزمون جای Receiver اصلی یا Managed drill را نمی‌گیرد.

Workflow فعلی دیتابیس همچنان با هر Object واقعی Storage، Auth خارج از Scope، Schema یا وابستگی پشتیبانی‌نشده **Fail می‌شود**. افزودن این ابزار Guard را باز نمی‌کند. اتصال Workflow و Managed restore پس از پذیرش واقعی همان سناریو، بستهٔ جداگانه‌اند.

## قرارداد اولیهٔ آرشیو

- فقط Bucket خصوصی `catalog-media` با سقف ۲۰MiB و MIMEهای JPEG/PNG/WebP/AVIF؛ Bucket/Object خارج از Scope یا Multipart در حال اجرا رد می‌شود.
- حداکثر ۱۰٬۰۰۰ Object، مجموع بایت اصلی یک GiB و Manifest هشت MiB. رشد از این سقف با قطع پنهان فایل‌ها مدیریت نمی‌شود؛ قرارداد و آزمون ظرفیت باید بازبینی شوند.
- نسخهٔ اولیه فقط ETag سادهٔ ۳۲ نویسه‌ای MD5، با یا بدون کوتیشن، را می‌پذیرد. ETag ناشناخته/Multipart یا نام منبع ناامن، خطا است. MD5 برای تطبیق انتقال است؛ تمام بایت‌های آرشیو SHA-256 مستقل دارند. این‌ها جای رمزنگاری احراز‌شده را نمی‌گیرند.
- ZIP از نوع `stored` است؛ عکس فشرده دوباره Deflate نمی‌شود. تعداد/اندازهٔ Central Directory پیش از ساخت فهرست ZIP محدود می‌شود. Compression، ZIP encryption، ZIP64، Metadata اضافی، Link و مسیر ناامن پشتیبانی نمی‌شوند.
- نام Object اصلی فقط در Manifest خصوصی باقی می‌ماند. اعضای آرشیو و فایل‌های بازیابی `objects/<UUID>.bin` هستند؛ هیچ Key اصلی به مسیر نوشتن تبدیل نمی‌شود.
- فقط فایل‌های Regular بدون Symlink/Hardlink خوانده می‌شوند. کل درخت Export باید دقیقاً با Inventory برابر باشد. خروجی موجود بازنویسی نمی‌شود؛ شکست بسته‌بندی یا بازیابی فقط خروجی تازهٔ همان عملیات را پاک می‌کند.
- `source_writers_paused_attestation` صرفاً تأیید اپراتور است. دو Inventory برابر جلوی تمام Raceها یا تغییر و برگشت بین Snapshotها را نمی‌گیرد؛ Freeze واقعی شرط پذیرش است.
- Recipient ابزار فعلاً فقط `age1...` نوع X25519 است؛ قرارداد قبلی دیتابیس SSH recipient را هم می‌پذیرد. قبل از اتصال، سازگاری Receiver واقعی تأیید شود؛ این ابزار به‌طور ضمنی الگوریتم را تغییر نمی‌دهد.
- Decrypt فقط فایل Identity محلیِ بدون رمز و تک‌کلید X25519 را در Parent خصوصی و با دسترسی `0600` یا محدودتر می‌پذیرد؛ Plugin، SSH، کلید رمزدار/تعاملی، Symlink و Hardlink رد می‌شوند. کلید با Descriptor به Binary می‌رسد، کپی نمی‌شود و جزئیات خطا چاپ نمی‌شوند. این مسیر میزبان Linux مورداعتماد با `/proc/self/fd` لازم دارد؛ کلید واقعی هرگز در گفتگو درخواست نمی‌شود.
- طبق مستندات رسمی، Age ممکن است در خطای انتهایی، Plaintext جزئیِ احراز‌شده تولید کند. `decrypt` فقط پس از Exit صفر، تطبیق دوبارهٔ Ciphertext، Verify کامل ZIP و تطبیق Ref/نسل موفق است؛ شکست/Timeout خروجی تازه را حذف می‌کند. Plaintext هنگام عملیات خصوصی است و تنها پس از پیام موفق باید مصرف شود؛ فایل/Link موجود حفظ می‌شود.
- احراز صحت Ciphertext، امضای فرستنده نیست. کسی که Recipient عمومی را دارد می‌تواند فایل جدید رمز کند؛ منبع مورداعتماد، منشأ نسل، دسترسی مقصد و کنترل مستقل DB همچنان لازم‌اند.

## برداشت امن منبع — اجرای آینده، با مجوز و محیط پذیرفته‌شده

۱. پروژهٔ منبع، مقصد ماندگار، Scope دسترسی و نسل بکاپ را مشخص کنید. Workspace بازیابی خارج از Git، روی میزبان مورداعتماد و خصوصی باشد. Binaryهای پشتیبان مورداعتماد باشند؛ نصب/استفاده از CLI با نسخه و `--help` همان اجرا بررسی شود.

۲. تغییر Objectها، متن/رسانهٔ کاتالوگ و نویسنده‌های مربوط را با روش مصوب متوقف کنید. ساخت نسخهٔ DB و Export عکس در همین بازه باشد. این بسته خودش هیچ نویسنده‌ای را متوقف نمی‌کند.

۳. `scripts/supabase-storage-inventory.sql` فقط‌خواندنی است، اما خروجی شامل Key/ID خصوصی است. آن را به `before.json` خصوصی هدایت کنید؛ هرگز در MCP، Actions Log، Issue یا Artifact عمومی چاپ نکنید. از Service فایل محلی `psql` و فایل رمز `0600` استفاده کنید؛ URL/Password را در فرمان، خروجی یا Git ننویسید. نمونهٔ قالب برای اجرای آینده:

```bash
umask 077
set -o noclobber
PGSERVICE=source psql -XqAt --set ON_ERROR_STOP=1 \
  --file scripts/supabase-storage-inventory.sql \
  > /secure/recovery-workspace/before.json \
  2> /secure/recovery-workspace/inventory-before.stderr
```

۴. تمام **بایت اصلی** Bucket را با ابزار رسمی S3/Storage و دسترسی مناسب به پوشهٔ خصوصی `originals/` صادر کنید. ساختار Keyهای منبع حفظ شود؛ نسخهٔ Transform، Screenshot یا عکس تولیدشده Export اصلی نیست. این دانلود در این بسته خودکار نشده است. دستور دقیق فقط بعد از بررسی CLI واقعی، Endpoint و دسترسی مجاز انتخاب می‌شود.

۵. بکاپ رمزنگاری‌شدهٔ DB همان بازه و Sidecar آن را مستقل دانلود و بایت/Checksum بازخوانی کنید. پس از Export، همان SQL را به `after.json` تازه هدایت کنید. Generation باید UTC و نام فایل DB مطابق `supabase-<project-ref>-<generation>.tar.gz.age` باشد. محتوای Snapshotها باید برابر بماند؛ نبود Metadata لازم Fail است.

۶. بسته‌بندی و بررسی خصوصی؛ متغیرها در مثال جای مقادیر واقعی‌اند و هیچ Secret در این سند وجود ندارد:

```bash
python3 scripts/storage-backup.py pack \
  --before "$RECOVERY_WORKSPACE/before.json" \
  --after "$RECOVERY_WORKSPACE/after.json" \
  --files "$RECOVERY_WORKSPACE/originals" \
  --output "$RECOVERY_WORKSPACE/storage.zip" \
  --source-project-ref "$BACKUP_SOURCE_REF" \
  --generation "$BACKUP_GENERATION" \
  --database-archive "$DATABASE_CIPHERTEXT" \
  --database-checksum "$DATABASE_CHECKSUM" \
  --writers-paused
python3 scripts/storage-backup.py verify "$RECOVERY_WORKSPACE/storage.zip"
python3 scripts/storage-backup.py encrypt "$RECOVERY_WORKSPACE/storage.zip" \
  --output "$RECOVERY_WORKSPACE/storage-$BACKUP_SOURCE_REF-$BACKUP_GENERATION.zip.age"
```

Recipient عمومی در `BACKUP_ENCRYPTION_RECIPIENT` تنظیم می‌شود؛ کلید خصوصی آفلاین می‌ماند. فایل ZIP، Inventory و Export همگی **Plaintext خصوصی** هستند. فقط `.age` و Sidecar آن به Bucket ماندگار خصوصی فرستاده شوند؛ بازخوانی بایت/Checksum با [ابزار مشترک](../scripts/verify-backup-readback.sh) کنترل شود. پس از پذیرش رمزنگاری/بازخوانی، Plaintext موقت طبق سیاست میزبان امن جمع شود. `encrypt` برای حفظ اختیار اپراتور، ورودی را خودکار حذف نمی‌کند.

## بازیابی مستقل و معیار پایان

۱. نسل DB و Storage را از کپی ماندگار دانلود کنید؛ Sidecar هر دو را مستقل بررسی و با هویت آفلاین Decrypt کنید. هدر Age به‌تنهایی اثبات Decrypt نیست. خروجی DB با [Validator موجود](../scripts/verify-backup-archive.py) بررسی شود. Identity اصلی فقط روی میزبان آفلاین مورداعتماد می‌ماند؛ برای Storage از فرمان زیر استفاده شود تا خروجی ناقص در شکست باقی نماند:

```bash
python3 scripts/storage-backup.py decrypt "$STORAGE_CIPHERTEXT" \
  --checksum "$STORAGE_CHECKSUM" \
  --identity "$OFFLINE_STORAGE_IDENTITY_FILE" \
  --output "$RECOVERY_WORKSPACE/storage.zip"
```

۲. مقصد **واقعاً** مستقل، Disposable، با Bucket خصوصی و همان محدودیت‌ها باشد. تفاوت دو Ref در ابزار فقط Guard نحوی است؛ اپراتور هویت واقعی، ACL/RLS، دسترسی ناشناس و خالی‌بودن مقصد را با شواهد کنترل کند. سپس بازیابی محلی:

```bash
python3 scripts/storage-backup.py recover "$RECOVERY_WORKSPACE/storage.zip" \
  --output "$RECOVERY_WORKSPACE/restored" \
  --source-project-ref "$BACKUP_SOURCE_REF" \
  --target-project-ref "$DISPOSABLE_TARGET_REF" \
  --database-archive "$DATABASE_CIPHERTEXT" \
  --database-checksum "$DATABASE_CHECKSUM"
```

۳. `RECOVERY_COMPLETE.json` فقط پس از موفقیت کامل نوشته می‌شود. برنامهٔ آن `live_target_verified=false` و `live_restore_performed=false` دارد؛ هیچ Upload رخ نداده. Key، MIME و بایت‌های اصلی از Manifest به API/S3 معتبر مقصد منتقل شوند؛ حالت اولیه **Create-only** و بدون Upsert است. Object موجود، اختلاف نسخه یا تعارض نباید با بازنویسی پنهان رفع شود.

۴. نگاشت Key و دادهٔ کاتالوگ/Media را در Managed restore کنترل کنید. مسیر ذخیره و نام فایل حفظ می‌شوند، ولی ID/Version داخلی Storage ممکن است در Upload تازه تغییر کنند. بازگردانی خام `storage.objects` به‌تنهایی فایل ایجاد نمی‌کند و سازگاری SQL/Platform باید طبق راهنمای رسمی و Drill جداگانه اثبات شود؛ این ابزار Raw SQL برای Storage نمی‌سازد.

۵. تمام Objectها را از مقصد دوباره دانلود کنید؛ تعداد، نام، MIME، اندازه و SHA-256 تک‌تک بایت‌ها با Manifest مبدأ برابر باشند. عکس واقعاً در Pipeline خروجی Build و سه خدمت قابل استفاده باشد؛ دسترسی عمومی به اصل خصوصی مسدود بماند. دادهٔ مشتری/کلید/Inventory وارد شواهد عمومی نشود.

۶. دو نسل ماندگار، Receiver واقعی، مدت نگهداری، Monitor شکست، Freeze/سازگاری DB، Decrypt مستقل و Managed restore پذیرفته شوند. سپس پیشنهاد Workflow دارای Storage و Drill بازبینی شود؛ تا آن زمان Guard جاری دست‌نخورده باقی می‌ماند.

## منابع و وضعیت بررسی

- [Age v1.3.2](https://github.com/FiloSottile/age/releases/tag/v1.3.2) و [راهنمای همان نسخه](https://github.com/FiloSottile/age/blob/v1.3.2/doc/age.1.ronn): Exit صفر برای کل ورودی، امکان خروجی جزئی در شکست و سازگاری نسخه‌ها؛ نسخه و Digest Asset با API رسمی Release راستی‌آزمایی شدند.
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups): تفکیک Metadata دیتابیس از Object واقعی.
- [Download Objects](https://supabase.com/docs/guides/storage/management/download-objects): روش‌های رسمی CLI/S3 دانلود.
- [S3 Compatibility](https://supabase.com/docs/guides/storage/s3/compatibility): محدودیت نسخه‌بندی S3؛ نباید به بازیابی Object حذف‌شده با Versioning فرضی تکیه کرد.
- [Copy Storage Objects from Platform](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3): نمونهٔ رسمی کپی S3؛ مقصد این پروژه همچنان نیاز به Managed drill خودش دارد.
- [Changelog](https://supabase.com/changelog): در ۱۱ اکتبر بازخوانی شد؛ اصلاح Postgres و Gateهای قبلی S3 همچنان بازند.

SQL این بسته با `EXPLAIN` فقط‌خواندنی روی پروژهٔ اصلی برنامه‌ریزی شد؛ این خروجی Inventory واقعی یا Drill نیست. شمارش مقدماتی در `2026-10-11T18:19:05Z` صفر Object و وجود دو جدول Multipart را تأیید کرد. نام/ردیف هیچ Object واقعی دریافت نشد؛ این مشاهدهٔ خالی‌بودن، امکان Backup/Restore آینده را اثبات نمی‌کند.
