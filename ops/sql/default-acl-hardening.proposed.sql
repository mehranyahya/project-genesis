-- REVIEW PROPOSAL ONLY. Deliberately outside supabase/migrations.
-- NOT executed, syntax/behavior not yet tested against the managed project.
-- Required: fresh encrypted durable backup, offline decrypt/checksums, restore
-- drill, approved isolated Preview, and owner authorization for the DB change.
-- Audit all actual public creators first. These two names are from the Oct 8
-- snapshot, not a claim that no other creator exists today.
-- Global revocations affect FUTURE objects in other schemas too. Review managed
-- extension/platform compatibility in Preview before turning this into a migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter default privileges for role postgres, supabase_admin
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres, supabase_admin
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres, supabase_admin
  revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres, supabase_admin in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres, supabase_admin in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres, supabase_admin in schema public
  revoke all on functions from public, anon, authenticated, service_role;

-- Existing objects, policies, rate-limit settings and data are untouched.
-- New privileged RPC/table access must be granted explicitly by its own review.
commit;
