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

test("backup workflow is manual, scheduled or self-validating on main", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(
    workflow,
    /push:[\s\S]*branches:[\s\S]*- main[\s\S]*paths:[\s\S]*backup-supabase\.yml[\s\S]*supabase-restore-manifest\.sql/,
  );
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
  assert.doesNotMatch(workflow, /contents: write/);
});

test("backup workflow dumps roles, schema, data and migration history", () => {
  assert.match(workflow, /--role-only/);
  assert.match(workflow, /-f "\$backup_dir\/schema\.sql"/);
  assert.match(workflow, /-f "\$backup_dir\/data\.sql"[\s\S]*--use-copy[\s\S]*--data-only/);
  assert.match(workflow, /--schema supabase_migrations/);
  assert.match(workflow, /storage\.buckets_vectors/);
  assert.match(workflow, /storage\.vector_indexes/);
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

test("backup workflow restores into disposable Postgres and compares a private manifest", () => {
  assert.match(workflow, /RESTORE_DRILL_IMAGE: supabase\/postgres:17\.6\.1\.136/);
  assert.match(workflow, /scripts\/supabase-restore-manifest\.sql/);
  assert.match(workflow, /--single-transaction/);
  assert.match(workflow, /set session_replication_role = replica/);
  assert.match(workflow, /source_manifest/);
  assert.match(workflow, /restored_manifest/);
  assert.match(workflow, /cmp --silent "\$source_manifest" "\$restored_manifest"/);
  assert.match(workflow, /jsonb_agg\(r\.rolname order by r\.rolname\)/);
  assert.match(
    workflow,
    /jsonb_array_elements_text\([\s\S]*:'source_roles_json'::pg_catalog\.jsonb/,
  );
  assert.match(workflow, /'create role %I nologin noinherit'/);
  assert.doesNotMatch(workflow, /create role supabase_realtime_admin/i);
  assert.doesNotMatch(workflow, /echo .*source_roles_json/);
  assert.match(restoreManifest, /request rate limit policy must remain present and disabled/);
  assert.match(restoreManifest, /restore manifest is missing a critical RPC/);
  assert.match(restoreManifest, /c\.relkind::text/);
  assert.match(restoreManifest, /con\.contype::text/);
  assert.match(restoreManifest, /t\.tgenabled::text/);
  assert.match(workflow, /trap cleanup_restore_drill EXIT/);
});

test("backup workflow verifies the durable R2 copy and always cleans the runner", () => {
  assert.match(workflow, /aws s3api head-object/);
  assert.match(workflow, /remote_size/);
  assert.match(workflow, /local_size/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -rf "\$RUNNER_TEMP\/supabase-backup"/);
});
