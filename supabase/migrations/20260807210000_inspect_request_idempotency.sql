-- Read-only idempotency inspection used before Turnstile verification.
-- It never creates or mutates a request and never returns PII.

create or replace function public.inspect_request_idempotency(
  p_submission_id uuid,
  p_request_fingerprint text,
  p_request_fingerprint_key_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set statement_timeout to '3s'
as $$
declare
  v_now timestamptz := now();
  v_existing public.requests%rowtype;
begin
  if p_submission_id is null
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_request_fingerprint_key_id is null
     or p_request_fingerprint_key_id !~ '^[A-Za-z0-9._-]{1,64}$' then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  select r.*
    into v_existing
    from public.requests r
   where r.submission_id = p_submission_id;

  if not found then
    return jsonb_build_object('code', 'MISSING');
  end if;

  -- Manual anonymization clears the fingerprint. As required by the master
  -- contract, that existing identifier is treated as expired rather than as a
  -- conflict so the client can generate a fresh submission id.
  if v_now >= v_existing.idempotency_expires_at
     or v_existing.request_fingerprint is null then
    return jsonb_build_object('code', 'IDEMPOTENCY_EXPIRED');
  end if;

  if v_existing.request_fingerprint is distinct from p_request_fingerprint
     or v_existing.request_fingerprint_key_id is distinct from p_request_fingerprint_key_id then
    return jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT');
  end if;

  return jsonb_build_object(
    'code', 'REQUEST_REPLAYED',
    'tracking_code', v_existing.tracking_code
  );
end;
$$;

revoke all on function public.inspect_request_idempotency(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.inspect_request_idempotency(uuid,text,text)
  to service_role;
