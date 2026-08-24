import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/backup-supabase.yml", import.meta.url),
  "utf8",
);
const restoreManifest = readFileSync(
  new URL("../../scripts/supabase-restore-manifest.sql", import.meta.url),
  "utf8",
);
const backupPreflight = readFileSync(
  new URL("../../scripts/supabase-backup-preflight.sql", import.meta.url),
  "utf8",
);

test("backup workflow is manual, scheduled or self-validating on main", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(
    workflow,
    /push:[\s\S]*branches:[\s\S]*- main[\s\S]*paths:[\s\S]*backup-supabase\.yml[\s\S]*supabase-backup-preflight\.sql[\s\S]*supabase-restore-manifest\.sql/,
  );
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
  assert.doesNotMatch(workflow, /contents: write/);
});

test("backup workflow pins the CLI and dumps both complete and drill scopes", () => {
  assert.match(workflow, /version: 2\.115\.0/);
  assert.match(workflow, /--role-only/);
  assert.match(workflow, /-f "\$backup_dir\/schema\.sql"/);
  assert.match(workflow, /-f "\$backup_dir\/data\.sql"[\s\S]*--use-copy[\s\S]*--data-only/);
  assert.match(workflow, /-f "\$backup_dir\/drill_schema\.sql"[\s\S]*--schema public/);
  assert.match(
    workflow,
    /-f "\$backup_dir\/drill_data\.sql"[\s\S]*--use-copy[\s\S]*--data-only[\s\S]*--schema public/,
  );
  assert.match(workflow, /--schema supabase_migrations/);
  assert.match(workflow, /storage\.buckets_vectors/);
  assert.match(workflow, /storage\.vector_indexes/);
  assert.match(
    workflow,
    /sha256sum[\s\S]*roles\.sql[\s\S]*drill_schema\.sql[\s\S]*drill_data\.sql[\s\S]*METADATA\.json[\s\S]*MANAGED_PREFLIGHT\.json/,
  );
});

test("only encrypted backup files leave the runner", () => {
  assert.match(workflow, /age --encrypt/);
  assert.match(workflow, /BACKUP_ENCRYPTION_RECIPIENT/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /r2\.cloudflarestorage\.com/);

  const artifactStart = workflow.indexOf("uses: actions/upload-artifact@");
  const artifactEnd = workflow.indexOf("\n      - name:", artifactStart);
  assert.ok(artifactStart >= 0 && artifactEnd > artifactStart);
  const artifactStep = workflow.slice(artifactStart, artifactEnd);
  assert.match(artifactStep, /steps\.backup\.outputs\.encrypted/);
  assert.match(artifactStep, /steps\.backup\.outputs\.checksum/);
  assert.doesNotMatch(artifactStep, /roles\.sql|schema\.sql|data\.sql/);
});

test("backup workflow fails closed when the scoped drill is no longer representative", () => {
  assert.match(workflow, /scripts\/supabase-backup-preflight\.sql/);
  assert.match(workflow, /application_schema_scope_valid == true/);
  assert.match(workflow, /public_restore_scope_valid == true/);
  assert.match(workflow, /public_roles_valid == true/);
  assert.match(workflow, /storage_bucket_config_valid == true/);
  assert.match(workflow, /auth\.schema_migrations/);
  assert.match(workflow, /storage\.migrations/);
  assert.match(workflow, /storage\.buckets/);
  assert.match(workflow, /MANAGED_PREFLIGHT\.json/);

  assert.match(backupPreflight, /query_to_xml/);
  assert.match(backupPreflight, /auth', 'storage', 'supabase_functions/);
  assert.match(backupPreflight, /storage_bucket_config_valid/);
  assert.match(backupPreflight, /id = 'catalog-media'/);
  assert.match(backupPreflight, /public_restore_scope_valid/);
  assert.match(backupPreflight, /public_roles_valid/);
  assert.doesNotMatch(backupPreflight, /select \*/i);
});

test("backup workflow restores only public data and migration history", () => {
  assert.match(
    workflow,
    /RESTORE_DRILL_IMAGE: "supabase\/postgres:17\.6\.1\.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00"/,
  );
  assert.match(workflow, /scripts\/supabase-restore-manifest\.sql/);
  assert.match(workflow, /--single-transaction/);
  assert.match(workflow, /set session_replication_role = replica/);
  assert.match(workflow, /set session_replication_role = origin/);
  assert.match(workflow, /--file \/tmp\/backup\/drill_schema\.sql/);
  assert.match(workflow, /--file \/tmp\/backup\/drill_data\.sql/);
  assert.match(workflow, /--file \/tmp\/backup\/history_schema\.sql/);
  assert.match(workflow, /--file \/tmp\/backup\/history_data\.sql/);
  assert.doesNotMatch(workflow, /--file \/tmp\/backup\/roles\.sql/);
  assert.doesNotMatch(workflow, /--file \/tmp\/backup\/data\.sql/);
  assert.match(workflow, /source_manifest/);
  assert.match(workflow, /restored_manifest/);
  assert.match(workflow, /cmp --silent "\$source_manifest" "\$restored_manifest"/);
  assert.match(workflow, /'anon',[\s\S]*'authenticated',[\s\S]*'service_role'/);
  assert.match(workflow, /'create role %I nologin noinherit'/);
  assert.match(workflow, /--env POSTGRES_USER=supabase_admin/);
  assert.ok((workflow.match(/--username supabase_admin/g)?.length ?? 0) >= 3);
  assert.doesNotMatch(workflow, /--username postgres/);
  assert.doesNotMatch(workflow, /create role supabase_realtime_admin/i);
  assert.doesNotMatch(workflow, /source_roles_json/);
  assert.match(restoreManifest, /request rate limit policy must remain present and disabled/);
  assert.match(restoreManifest, /restore manifest is missing a critical RPC/);
  assert.match(restoreManifest, /missing the required pgcrypto digest function/);
  assert.match(restoreManifest, /c\.relkind::text/);
  assert.match(restoreManifest, /con\.contype::text/);
  assert.match(restoreManifest, /t\.tgenabled::text/);
  assert.ok((restoreManifest.match(/string_agg/g)?.length ?? 0) >= 3);
  assert.match(workflow, /trap cleanup_restore_drill EXIT/);
});

test("backup workflow verifies the durable R2 copy and always cleans the runner", () => {
  assert.match(workflow, /aws s3api head-object/);
  assert.match(workflow, /remote_size/);
  assert.match(workflow, /local_size/);
  assert.match(workflow, /remote_checksum_size/);
  assert.match(workflow, /local_checksum_size/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -rf "\$RUNNER_TEMP\/supabase-backup"/);
});
