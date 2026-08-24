-- Deterministic, data-minimizing manifest used by the encrypted backup
-- workflow. It compares the source with a disposable restored database without
-- writing row values, customer data, credentials, or connection details to
-- logs or artifacts.

do $manifest_checks$
begin
  if not exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
  ) then
    raise exception 'restore manifest found no public tables';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
  ) then
    raise exception 'restore manifest found a public table without RLS';
  end if;

  if not (
    select count(*) = 1 and coalesce(bool_and(not enabled), false)
      from public.request_rate_limit_policy
  ) then
    raise exception 'request rate limit policy must remain present and disabled';
  end if;

  if pg_catalog.to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'restore manifest is missing the required pgcrypto digest function';
  end if;

  if exists (
    select required.name
      from (
        values
          ('claim_telegram_notifications'),
          ('complete_telegram_notification'),
          ('compute_operational_catalog_version'),
          ('create_request_atomic'),
          ('inspect_request_idempotency'),
          ('requests_before_update'),
          ('touch_updated_at')
      ) as required(name)
     where not exists (
       select 1
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = required.name
     )
  ) then
    raise exception 'restore manifest is missing a critical RPC';
  end if;

  if (
    select count(*)
      from supabase_migrations.schema_migrations
  ) < 11 then
    raise exception 'restore manifest has incomplete migration history';
  end if;
end
$manifest_checks$;

select
  'table|'
  || n.nspname || '.' || c.relname
  || '|' || c.relkind::text
  || '|' || c.relrowsecurity::text
  || '|' || c.relforcerowsecurity::text
  || '|' || coalesce(
    (
      select pg_catalog.string_agg(
        acl_item::text,
        ','
        order by acl_item::text
      )
      from unnest(c.relacl) as acl_item
    ),
    ''
  )
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname;

select pg_catalog.format(
  'select %L || count(*)::text from %I.%I;',
  'rows|' || n.nspname || '.' || c.relname || '|',
  n.nspname,
  c.relname
)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname
\gexec

select
  'sequence|'
  || schemaname || '.' || sequencename
  || '|' || coalesce(last_value::text, '')
from pg_catalog.pg_sequences
where schemaname = 'public'
order by schemaname, sequencename;

select
  'constraint|'
  || n.nspname || '.' || c.relname
  || '|' || con.conname
  || '|' || con.contype::text
  || '|' || pg_catalog.md5(pg_catalog.pg_get_constraintdef(con.oid, true))
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by n.nspname, c.relname, con.conname;

select
  'index|'
  || n.nspname || '.' || c.relname
  || '|' || i.relname
  || '|' || pg_catalog.md5(pg_catalog.pg_get_indexdef(i.oid))
from pg_catalog.pg_index x
join pg_catalog.pg_class c on c.oid = x.indrelid
join pg_catalog.pg_class i on i.oid = x.indexrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by n.nspname, c.relname, i.relname;

select
  'function|'
  || n.nspname || '.' || p.proname
  || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
  || '|' || p.prosecdef::text
  || '|' || coalesce(
    (
      select pg_catalog.string_agg(
        acl_item::text,
        ','
        order by acl_item::text
      )
      from unnest(p.proacl) as acl_item
    ),
    ''
  )
  || '|' || pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f', 'p')
order by n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);

select
  'trigger|'
  || n.nspname || '.' || c.relname
  || '|' || t.tgname
  || '|' || t.tgenabled::text
  || '|' || pn.nspname || '.' || p.proname
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by n.nspname, c.relname, t.tgname;

select
  'policy|'
  || schemaname || '.' || tablename
  || '|' || policyname
  || '|' || permissive
  || '|' || coalesce(
    (
      select pg_catalog.string_agg(
        role_name::text,
        ','
        order by role_name::text
      )
      from unnest(roles) as role_name
    ),
    ''
  )
  || '|' || cmd
  || '|' || pg_catalog.md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
from pg_catalog.pg_policies
where schemaname = 'public'
order by schemaname, tablename, policyname;

select
  'migration|'
  || (pg_catalog.to_jsonb(m) - 'statements')::text
from supabase_migrations.schema_migrations m
order by m.version;
