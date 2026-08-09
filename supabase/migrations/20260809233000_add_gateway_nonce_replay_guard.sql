-- Signed Worker -> Edge Function replay guard.
-- A nonce is valid for at most five minutes and can be claimed exactly once.

create table public.gateway_nonces (
  nonce text primary key,
  gateway_key_id text not null,
  seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint gateway_nonces_nonce_chk
    check (nonce ~ '^[0-9a-f]{32}$'),
  constraint gateway_nonces_key_id_chk
    check (gateway_key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint gateway_nonces_expiry_chk
    check (expires_at > seen_at and expires_at <= seen_at + interval '5 minutes')
);

create index gateway_nonces_expires_at_idx
  on public.gateway_nonces (expires_at);

alter table public.gateway_nonces enable row level security;
alter table public.gateway_nonces force row level security;

revoke all on table public.gateway_nonces from public, anon, authenticated;
grant select, insert, delete on table public.gateway_nonces to service_role;

create or replace function public.claim_gateway_nonce(
  p_nonce text,
  p_gateway_key_id text,
  p_received_at_unix bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
set statement_timeout to '3s'
set lock_timeout to '1s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_received_at timestamptz;
  v_inserted integer := 0;
begin
  if p_nonce is null
     or p_nonce !~ '^[0-9a-f]{32}$'
     or p_gateway_key_id is null
     or p_gateway_key_id !~ '^[A-Za-z0-9._-]{1,64}$'
     or p_received_at_unix is null then
    return false;
  end if;

  v_received_at := to_timestamp(p_received_at_unix);
  if v_received_at < v_now - interval '60 seconds'
     or v_received_at > v_now + interval '30 seconds' then
    return false;
  end if;

  -- A cryptographically random nonce should not collide. This targeted cleanup
  -- only allows an already-expired value to be reused and avoids a table-wide
  -- delete in the request transaction; routine retention can purge old rows.
  delete from public.gateway_nonces
   where nonce = p_nonce
     and expires_at <= v_now;

  insert into public.gateway_nonces (nonce, gateway_key_id, seen_at, expires_at)
  values (p_nonce, p_gateway_key_id, v_now, v_now + interval '5 minutes')
  on conflict (nonce) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.claim_gateway_nonce(text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.claim_gateway_nonce(text,text,bigint)
  to service_role;
