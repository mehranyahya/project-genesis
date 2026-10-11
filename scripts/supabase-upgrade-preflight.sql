-- READ ONLY, PostgreSQL 17. Catalog-only screening for the 17.11 upgrade.
-- Sources: https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
-- No row scans/decryption or temporary functions. Zero metadata counts do not
-- prove absence of legacy PGP ciphertext or external encryption callers.
begin read only;
set local statement_timeout = '10000ms';
with index_classes as (
  select idx.indexrelid, am.amname, ty.typname
  from pg_index idx
  join pg_class ic on idx.indexrelid=ic.oid
  join pg_am am on am.oid=ic.relam
  join lateral unnest(idx.indclass::oid[]) with ordinality as k(opclass,pos) on true
  join pg_opclass oc on oc.oid=k.opclass
  join pg_type ty on ty.oid=oc.opcintype
  where k.pos<=idx.indnkeyatts
), affected_operators as (
  select o.oid from pg_operator o join pg_namespace n on o.oprnamespace=n.oid
  where n.nspname not in ('pg_catalog','information_schema')
    and ((o.oprrest<>0 and o.oprrest::oid>=10000) or (o.oprjoin<>0 and o.oprjoin::oid>=10000))
    and not exists (select 1 from pg_depend d
      where d.classid='pg_operator'::regclass and d.objid=o.oid and d.deptype='e')
)
select jsonb_build_object(
  'encoding',(select pg_encoding_to_char(encoding) from pg_database where datname=current_database()),
  'collation_provider',(select datlocprovider from pg_database where datname=current_database()),
  'ltree_indexes',(select count(distinct indexrelid) from index_classes where typname in ('ltree','_ltree')),
  'gist_float_indexes',(select count(distinct indexrelid) from index_classes
    where amname='gist' and typname in ('float4','float8')),
  'custom_estimator_operators',(select count(*) from affected_operators),
  'public_routine_pgp_references',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p')
      and p.prosrc ~* 'pgp_(sym|pub)_(encrypt|decrypt)'),
  'public_bytea_columns',(select count(*) from pg_attribute a
    join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
      and a.atttypid='bytea'::regtype),
  'pgcrypto_data_verification','NOT_PERFORMED',
  'external_pgp_callers','UNKNOWN'
) as compatibility;
commit;
