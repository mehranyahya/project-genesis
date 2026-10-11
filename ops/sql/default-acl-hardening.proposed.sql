-- REVIEW PROPOSAL ONLY. Deliberately outside supabase/migrations.
-- NOT executed, syntax/behavior not yet tested against the managed project.
-- Required: fresh encrypted durable backup, offline decrypt/checksums, restore
-- drill, approved isolated Preview, and owner authorization for the DB change.
-- Oct 11 read-only catalog audit found CREATE for postgres, supabase_admin and
-- pg_database_owner. The latter has implicit database-owner membership; its
-- defaults are distinct when SET ROLE selects it. Audit creators again before use.
-- Global revocations affect FUTURE objects in other schemas too. Review managed
-- extension/platform compatibility in Preview before turning this into a migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter default privileges for role postgres, supabase_admin, pg_database_owner
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres, supabase_admin, pg_database_owner
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres, supabase_admin, pg_database_owner
  revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres, supabase_admin, pg_database_owner in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres, supabase_admin, pg_database_owner in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres, supabase_admin, pg_database_owner in schema public
  revoke all on functions from public, anon, authenticated, service_role;

-- Existing objects, policies, rate-limit settings and data are untouched.
-- New privileged RPC/table access must be granted explicitly by its own review.
commit;
