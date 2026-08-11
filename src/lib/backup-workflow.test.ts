import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/backup-supabase.yml", import.meta.url),
  "utf8",
);

test("backup workflow is manual or scheduled and keeps repository permissions read-only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request):/m);
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

test("backup workflow verifies the durable R2 copy and always cleans the runner", () => {
  assert.match(workflow, /aws s3api head-object/);
  assert.match(workflow, /remote_size/);
  assert.match(workflow, /local_size/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -rf "\$RUNNER_TEMP\/supabase-backup"/);
});
