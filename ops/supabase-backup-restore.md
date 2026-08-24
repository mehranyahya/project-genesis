# Supabase backup and restore runbook

This project is currently on the Supabase Free plan, so launch work must not rely on managed daily backups. The repository workflow creates a logical database backup every day at 02:17 UTC and whenever the workflow, compatibility preflight, or restore manifest changes on `main`.

## Backup outputs

The encrypted archive contains:

- `roles.sql`, the complete CLI-filtered role dump;
- `schema.sql`, the complete CLI-filtered application schema dump;
- `data.sql`, the complete CLI platform-data dump, including managed Auth and Storage database rows;
- `drill_schema.sql` and `drill_data.sql`, the isolated `public` restore-drill scope;
- `history_schema.sql` and `history_data.sql`, the `supabase_migrations` history;
- data-minimizing metadata, compatibility evidence, and internal SHA-256 checksums.

The workflow pins Supabase CLI `2.115.0` and the exact digest of the Supabase PostgreSQL `17.6.1.136` drill image. Before encryption it validates the hosted project's restore assumptions, restores the supported drill scope into an isolated container, and compares a deterministic source/restore manifest covering table counts, RLS, constraints, indexes, functions, triggers, policies, sequences, and migration history. It then encrypts the archive with `age` and deletes every plaintext copy before upload.

Every successful run keeps:

- an encrypted GitHub Actions artifact for 7 days;
- an encrypted durable R2 copy when all R2 secrets are configured;
- a matching SHA-256 checksum next to each encrypted archive.

Supabase Storage objects are not contained in a database dump. A separate object-backup policy is required before real media is uploaded.

## Required GitHub secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | Yes | Guards the backup against the wrong project. |
| `SUPABASE_DB_SESSION_POOLER_URL` | Yes | Full session-pooler PostgreSQL URL used only by the backup job. |
| `BACKUP_ENCRYPTION_RECIPIENT` | Yes | Public `age1...` or supported SSH recipient. Keep the private key offline. |
| `R2_ACCOUNT_ID` | Durable copy | Cloudflare account that owns the backup bucket. |
| `R2_ACCESS_KEY_ID` | Durable copy | R2 S3 access key limited to the backup bucket. |
| `R2_SECRET_ACCESS_KEY` | Durable copy | Matching R2 S3 secret. |
| `R2_BACKUP_BUCKET` | Durable copy | Private bucket name. |
| `HEALTHCHECKS_BACKUP_PING_URL` | Optional | Success/failure monitor endpoint. |

If none of the four R2 secrets is set, the workflow succeeds with only the encrypted 7-day Actions artifact. A partial R2 configuration fails closed.

## First launch gate

1. Configure the three required secrets.
2. Preferably configure all four R2 secrets and a private bucket lifecycle policy.
3. Merge a reviewed backup-workflow change or run **Supabase database backup** manually.
4. Confirm the dump, automatic restore drill, encryption and artifact steps are green.
5. Download the encrypted artifact plus checksum and verify the checksum locally.
6. Do not apply production migrations until this gate passes.

## Decrypt and inspect

Use an offline copy of the private age identity:

```bash
sha256sum --check supabase-<project-ref>-<timestamp>.tar.gz.age.sha256
age --decrypt \
  --identity /secure/path/backup-age-key.txt \
  --output backup.tar.gz \
  supabase-<project-ref>-<timestamp>.tar.gz.age
tar -xzf backup.tar.gz
cd <timestamp>
sha256sum --check SHA256SUMS
```

Never commit the private identity, decrypted archive, SQL dumps, database URL, or customer data.

## Automatic restore drill

Hosted Supabase Auth and Storage schemas can be newer than those in a raw PostgreSQL image. Restoring the hosted `data.sql` into that raw image can therefore fail on valid platform-only columns or tables. The automatic drill does not pretend those schemas are version-identical:

1. It keeps the complete `data.sql` encrypted for real managed-project recovery.
2. A read-only preflight counts every Auth, Storage, and `supabase_functions` relation without reading or logging row values.
3. The gate requires no Auth application data, no Storage objects or multipart uploads, and either no bucket or exactly the expected private `catalog-media` bucket metadata.
4. It verifies that `public` has no unsupported managed-schema dependency and uses only the expected database roles.
5. It restores only `public` plus `supabase_migrations` into the pinned raw image. The isolated `supabase_admin` session uses `SET ROLE postgres` while creating schemas, but first revokes the raw image's broad `public`-schema default grants to `anon`, `authenticated`, and `service_role`. This prevents those image defaults from surviving when the dump only needs to add narrower source grants. It then resets to the image superuser only for trigger-safe data loading. `roles.sql` and the hosted managed-schema rows are deliberately not applied to that image.
6. It compares private, deterministic source and restored manifests, including both `last_value` and `is_called` for every application sequence. Table and function ownership is compared explicitly. ACL comparison covers non-owner grantees, privileges, and grantability while ignoring both the environment-specific superuser that issued a restored grant and the equivalent explicit-versus-implicit owner ACL representation. Table and function flags, ACLs, and definitions use separate categories. On mismatch, logs expose only the affected manifest categories—not manifest rows. Manifest files are deleted before encryption and never uploaded separately.

If Auth application data, Storage objects, another bucket, a custom application schema, or a managed-schema dependency appears later, the workflow fails closed. Extend and test the backup strategy instead of weakening the preflight.

This scoped automatic drill satisfies the current Preview migration gate because the live project has no Auth accounts or Storage objects and `public` is self-contained. A managed-project drill remains the stronger release exercise before the first Production launch or after a major PostgreSQL/platform upgrade.

## Managed-project restore exercise

For the stronger release exercise, restore into a new disposable Supabase project first. Obtain its session-pooler URL, then restore with `psql` and stop on the first error:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DATABASE_URL"

psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file history_schema.sql \
  --file history_data.sql \
  --dbname "$NEW_DATABASE_URL"
```

After restore, verify table counts, constraints, RLS, critical RPCs, and migration history. Reconfigure Edge Function secrets and restore Storage objects separately. Delete the disposable project only after the drill evidence has been recorded.

## Rotation and failure rules

- Rotate the age key by changing the recipient only after one backup with the new key has been decrypted successfully.
- Use bucket-scoped R2 credentials; never reuse deployment credentials.
- A failed dump, encryption, artifact upload, R2 upload, or size verification fails the workflow.
- Keep at least two independently verified generations before deleting an older durable backup.
