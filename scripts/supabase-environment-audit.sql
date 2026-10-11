-- PostgreSQL 17. READ ONLY: catalog metadata, privileges and counts, never row values.
-- Run separately in each already-authorized project; no automatic migration.
begin read only;
set local statement_timeout = '10000ms';

with creators as (
  select r.oid, r.rolname, r.rolcanlogin, r.rolbypassrls
  from pg_catalog.pg_roles r
  where pg_catalog.has_schema_privilege(r.oid, 'public', 'CREATE')
), object_types as (
  select * from (values ('r'::"char", 'table'), ('S'::"char", 'sequence'), ('f'::"char", 'function')) t(code, label)
), future_acl as (
  select c.rolname as creator, t.label as object_type, a.grantee, a.privilege_type
  from creators c
  cross join object_types t
  left join pg_catalog.pg_default_acl g
    on g.defaclrole = c.oid and g.defaclobjtype = t.code and g.defaclnamespace = 0
  left join pg_catalog.pg_default_acl s
    on s.defaclrole = c.oid and s.defaclobjtype = t.code
    and s.defaclnamespace = (select oid from pg_catalog.pg_namespace where nspname = 'public')
  -- Schema grants ADD to the global default. A schema-only REVOKE cannot
  -- remove PostgreSQL's implicit global PUBLIC EXECUTE on new functions.
  cross join lateral pg_catalog.aclexplode(
    coalesce(g.defaclacl, pg_catalog.acldefault(t.code, c.oid))
    || coalesce(s.defaclacl, '{}'::aclitem[])
  ) a
  where a.grantee = 0 or a.grantee in (
    select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')
  )
-- Materialize typed OID sets: privilege helpers can throw on an index/sequence
-- if the planner evaluates them before an inlined catalog filter.
), public_relations as materialized (
  select c.oid from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
), public_functions as materialized (
  select p.oid from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
), public_sequences as materialized (
  select c.oid from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
)
select pg_catalog.jsonb_build_object(
  'server_version', pg_catalog.current_setting('server_version'),
  'database_owner', (select pg_catalog.pg_get_userbyid(datdba)
    from pg_catalog.pg_database where datname = pg_catalog.current_database()),
  'extensions', (select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('name', extname, 'version', extversion) order by extname
  ), '[]'::jsonb) from pg_catalog.pg_extension),
  'public_creators', (select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('role', rolname, 'login', rolcanlogin, 'bypass_rls', rolbypassrls)
    order by rolname
  ), '[]'::jsonb) from creators),
  'future_public_exposures', (select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'creator', creator, 'object_type', object_type,
      'grantee', case when grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(grantee) end,
      'privilege', privilege_type
    ) order by creator, object_type, grantee, privilege_type
  ), '[]'::jsonb) from (select distinct * from future_acl) a),
  'current_exposure_counts', (select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'role', r.rolname,
      'relations', (select count(*) from public_relations c where pg_catalog.has_table_privilege(
        r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
      )),
      'column_relations', (select count(*) from public_relations c where pg_catalog.has_any_column_privilege(
        r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'
      )),
      'sequences', (select count(*) from public_sequences s where pg_catalog.has_sequence_privilege(
        r.oid, s.oid, 'USAGE, SELECT, UPDATE'
      )),
      'functions', (select count(*) from public_functions p where pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE'))
    ) order by r.rolname
  ), '[]'::jsonb) from pg_catalog.pg_roles r where r.rolname in ('anon', 'authenticated'))
)::text;

commit;
