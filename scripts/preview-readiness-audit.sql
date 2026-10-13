-- Bounded READ ONLY snapshot for phase 9. Counts and configuration booleans only.
-- This audits the explicitly selected project, not an inferred Preview identity.
-- No customer row, media key, content text, credential or secret value is read.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select jsonb_build_object(
 'server_version', current_setting('server_version'),
 'observed_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'counts', jsonb_build_object(
  'products_active', (select count(*) from public.products where is_active),
  'portfolio_active', (select count(*) from public.portfolio_items where is_active),
  'building_items_active', (select count(*) from public.building_stone_items where is_active),
  'site_primary', (select count(*) from public.site_settings where id = 'primary'),
  'storage_objects', (select count(*) from storage.objects),
  'storage_buckets', (select count(*) from storage.buckets),
  'public_storage_buckets', (select count(*) from storage.buckets where public),
  'auth_users', (select count(*) from auth.users)),
 'rate_limit_enabled', (select jsonb_agg(enabled) from public.request_rate_limit_policy),
 'public_rls_tables', (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
 'public_forced_rls_tables', (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity)
) as readiness;
commit;
