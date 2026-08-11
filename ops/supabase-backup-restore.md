# Supabase backup and restore runbook

This project is currently on the Supabase Free plan, so production changes must not rely on managed daily backups. The repository workflow creates a logical database backup before launch work and every day at 02:17 UTC.

## Backup outputs

The workflow `.github/workflows/backup-supabase.yml` creates separate dumps for roles, schema, data, and `supabase_migrations` history. It checksums the plaintext files, packs them, encrypts the archive with `age`, and deletes the plaintext copy before upload.

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
3. Run **Supabase database backup** manually from GitHub Actions.
4. Confirm the run is green and download the encrypted artifact plus checksum.
5. Verify the checksum locally.
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

## Restore drill

Always restore into a new disposable Supabase project first. Obtain its session-pooler URL, then restore with `psql` and stop on the first error:

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
