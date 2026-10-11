# Supabase backup and restore runbook

The last inspected plan was Supabase Free (2026-10-08); this package does not reverify today's plan. Launch work must not rely on an unverified managed-backup entitlement. The repository workflow creates a logical database backup every day at 02:17 UTC and whenever a migration, the workflow, compatibility preflight, or restore manifest changes on `main`.

## Backup outputs

The encrypted archive contains:

- `roles.sql`, the complete CLI-filtered role dump;
- `schema.sql`, the complete CLI-filtered application schema dump;
- `data.sql`, the complete CLI platform-data dump, including managed Auth and Storage database rows;
- `drill_schema.sql` and `drill_data.sql`, the isolated `public` restore-drill scope;
- `history_schema.sql` and `history_data.sql`, the `supabase_migrations` history;
- data-minimizing metadata, compatibility evidence, and internal SHA-256 checksums.

The workflow pins Supabase CLI `2.115.0` and the exact digest of the Supabase PostgreSQL `17.6.1.136` drill image. Before encryption it validates the hosted project's restore assumptions, restores the supported drill scope into an isolated container, and compares a deterministic source/restore manifest covering table counts, RLS, constraints, indexes, functions, triggers, policies, sequences, and migration history. It validates the exact archive layout and all internal checksums with `scripts/verify-backup-archive.py`, then encrypts the archive with `age` and deletes every plaintext copy before upload.

Every successful run keeps:

- an encrypted GitHub Actions artifact for 7 days;
- an encrypted durable R2 copy with downloaded-byte and checksum verification;
- a matching SHA-256 checksum next to each encrypted archive.

Supabase Storage objects are not contained in a database dump. A separate object-backup policy is required before real media is uploaded.

## Required GitHub secrets

| Secret                           | Required | Purpose                                                                    |
| -------------------------------- | -------- | -------------------------------------------------------------------------- |
| `SUPABASE_PROJECT_REF`           | Yes      | Guards the backup against the wrong project.                               |
| `SUPABASE_DB_SESSION_POOLER_URL` | Yes      | Full session-pooler PostgreSQL URL used only by the backup job.            |
| `BACKUP_ENCRYPTION_RECIPIENT`    | Yes      | Public `age1...` or supported SSH recipient. Keep the private key offline. |
| `R2_ACCOUNT_ID`                  | Yes      | Cloudflare account that owns the backup bucket.                            |
| `R2_ACCESS_KEY_ID`               | Yes      | R2 S3 access key limited to the backup bucket.                             |
| `R2_SECRET_ACCESS_KEY`           | Yes      | Matching R2 S3 secret.                                                     |
| `R2_BACKUP_BUCKET`               | Yes      | Private bucket name.                                                       |
| `HEALTHCHECKS_BACKUP_PING_URL`   | Yes      | Private success/failure monitor endpoint.                                  |

All four R2 secrets and the monitor endpoint are required. Missing configuration fails before the dump; a 7-day artifact alone no longer counts as a successful complete backup. The DB URL must select the expected `postgres.<project-ref>` session-pooler account on port 5432, `/postgres`, with an explicit TLS `sslmode` and no query overrides. This is an intentional stricter contract; configure it before merging/running this proposal.

## First launch gate

1. Configure the three required secrets.
2. Configure all four R2 secrets, monitoring, private-bucket retention, and recovery access; keep at least two independently verified generations.
3. Merge a reviewed backup-workflow change or run **Supabase database backup** manually.
4. Confirm dump, automatic scoped drill, archive verification, encryption, artifact, R2 download/readback and monitoring steps are green for the reviewed code.
5. Independently download the durable encrypted generation, verify its checksum, decrypt with the offline identity, validate the inner archive, and record a restore drill.
6. Do not apply production migrations until this gate passes.

## Decrypt and inspect

Use an offline copy of the private age identity:

```bash
sha256sum --check supabase-<project-ref>-<timestamp>.tar.gz.age.sha256
age --decrypt \
  --identity /secure/path/backup-age-key.txt \
  --output backup.tar.gz \
  supabase-<project-ref>-<timestamp>.tar.gz.age
python3 scripts/verify-backup-archive.py backup.tar.gz
# Only after validation, extract into a new private directory:
umask 077
mkdir recovered-backup
tar -xzf backup.tar.gz -C recovered-backup
cd recovered-backup/<timestamp>
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

The scoped drill is valid only while its live read-only preflight remains true. It is not independent age decryption, durable retention, Storage-byte recovery or a managed-project restore. Those acceptance checks remain required before the relevant migration/release; see [S3 environment acceptance](environment-acceptance-fa.md). No live backup/restore or DB change was executed by this package.

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
- A failed configuration gate, dump, drill, archive verification, encryption, artifact upload, R2 upload/download, byte/checksum comparison or monitoring fails the workflow.
- Keep at least two independently verified generations before deleting an older durable backup.
