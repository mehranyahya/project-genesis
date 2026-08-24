-- Read-only, data-minimizing compatibility gate for the encrypted backup
-- workflow. The only output is schema/table names, row counts and booleans;
-- no row values, credentials or connection details are returned.

with managed_relation_counts as (
  select
    n.nspname || '.' || c.relname as relation,
    (
      (
        pg_catalog.xpath(
          '/row/count/text()',
          pg_catalog.query_to_xml(
            pg_catalog.format(
              'select count(*) as count from %I.%I',
              n.nspname,
              c.relname
            ),
            false,
            true,
            ''
          )
        )
      )[1]::text
    )::bigint as rows
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('auth', 'storage', 'supabase_functions')
    and c.relkind in ('r', 'p')
), public_acl_role_oids as (
  select (pg_catalog.aclexplode(c.relacl)).grantee as role_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union

  select (pg_catalog.aclexplode(p.proacl)).grantee
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'

  union

  select (pg_catalog.aclexplode(n.nspacl)).grantee
  from pg_catalog.pg_namespace n
  where n.nspname = 'public'

  union

  select (pg_catalog.aclexplode(d.defaclacl)).grantee
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public'
), public_roles as (
  select r.rolname
  from public_acl_role_oids a
  join pg_catalog.pg_roles r on r.oid = a.role_oid

  union

  select r.rolname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'public'

  union

  select r.rolname
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'

  union

  select role_name::text
  from pg_catalog.pg_policies p,
       unnest(p.roles) as role_name
  where p.schemaname = 'public'
)
select pg_catalog.jsonb_build_object(
  'managed_relation_counts',
  (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'relation', relation,
          'rows', rows
        )
        order by relation
      ),
      '[]'::pg_catalog.jsonb
    )
    from managed_relation_counts
  ),
  'storage_bucket_config_valid',
  (
    select count(*) = 0
      or (
        count(*) = 1
        and coalesce(
          bool_and(
            id = 'catalog-media'
            and name = 'catalog-media'
            and public is false
            and file_size_limit = 20971520
            and allowed_mime_types = array[
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/avif'
            ]::text[]
          ),
          false
        )
      )
    from storage.buckets
  ),
  'application_schema_scope_valid',
  not exists (
    select 1
    from pg_catalog.pg_namespace n
    where n.nspname <> 'information_schema'
      and n.nspname !~ '^pg_'
      and n.nspname not in (
        'auth',
        'cron',
        'extensions',
        'graphql',
        'graphql_public',
        'net',
        'pgbouncer',
        'pgmq',
        'pgsodium',
        'pgsodium_masks',
        'public',
        'realtime',
        'repack',
        'storage',
        'supabase_functions',
        'supabase_migrations',
        'vault'
      )
  ),
  'public_restore_scope_valid',
  not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class source on source.oid = con.conrelid
    join pg_catalog.pg_namespace source_schema
      on source_schema.oid = source.relnamespace
    join pg_catalog.pg_class target on target.oid = con.confrelid
    join pg_catalog.pg_namespace target_schema
      on target_schema.oid = target.relnamespace
    where con.contype = 'f'
      and source_schema.nspname = 'public'
      and target_schema.nspname <> 'public'
  )
  and not exists (
    select 1
    from pg_catalog.pg_class view_relation
    join pg_catalog.pg_namespace view_schema
      on view_schema.oid = view_relation.relnamespace
    join pg_catalog.pg_rewrite rewrite
      on rewrite.ev_class = view_relation.oid
    join pg_catalog.pg_depend dependency
      on dependency.objid = rewrite.oid
    join pg_catalog.pg_class target_relation
      on target_relation.oid = dependency.refobjid
    join pg_catalog.pg_namespace target_schema
      on target_schema.oid = target_relation.relnamespace
    where view_schema.nspname = 'public'
      and view_relation.relkind in ('v', 'm')
      and target_schema.nspname not in ('public', 'pg_catalog', 'extensions')
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and pg_catalog.pg_get_functiondef(p.oid) ~*
        '(^|[^a-z0-9_])(auth|storage|realtime|vault|supabase_functions)[[:space:]]*\.'
  ),
  'public_roles_valid',
  not exists (
    select 1
    from public_roles r
    where r.rolname not in (
      'anon',
      'authenticated',
      'pg_database_owner',
      'postgres',
      'public',
      'service_role'
    )
  )
)::text;
