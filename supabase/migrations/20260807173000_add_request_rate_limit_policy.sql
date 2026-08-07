-- Transactional request rate limiting.
--
-- This migration deliberately creates the policy disabled and without request
-- ceilings. Production must opt in by setting both ceilings explicitly. While
-- disabled, existing idempotent submissions may still replay, but new requests
-- fail closed. The public RPC signature remains unchanged.

create table public.request_rate_limit_policy (
  id text primary key default 'primary',
  enabled boolean not null default false,
  window_seconds integer null,
  max_requests_per_ip integer null,
  max_requests_per_phone integer null,
  updated_at timestamptz not null default now(),
  constraint request_rate_limit_policy_singleton_chk check (id = 'primary'),
  constraint request_rate_limit_policy_window_chk check (
    window_seconds is null or window_seconds between 60 and 86400
  ),
  constraint request_rate_limit_policy_ip_chk check (
    max_requests_per_ip is null or max_requests_per_ip between 1 and 10000
  ),
  constraint request_rate_limit_policy_phone_chk check (
    max_requests_per_phone is null or max_requests_per_phone between 1 and 10000
  )
);

alter table public.request_rate_limit_policy enable row level security;
alter table public.request_rate_limit_policy force row level security;

revoke all on table public.request_rate_limit_policy from public, anon, authenticated, service_role;

insert into public.request_rate_limit_policy (
  id,
  enabled,
  window_seconds,
  max_requests_per_ip,
  max_requests_per_phone
) values (
  'primary',
  false,
  null,
  null,
  null
);

create trigger request_rate_limit_policy_touch_updated_at
before update on public.request_rate_limit_policy
for each row execute function public.touch_updated_at();

alter function public.create_request_atomic(jsonb, text, text, text, text, text, jsonb, text)
  rename to create_request_atomic_core;

revoke all on function public.create_request_atomic_core(jsonb, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.create_request_atomic(
  p_payload jsonb,
  p_request_fingerprint text,
  p_request_fingerprint_key_id text,
  p_current_terms_version text,
  p_current_terms_hash text,
  p_bot_verification text,
  p_risk_flags jsonb,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_submission_text text;
  v_submission_id uuid;
  v_phone text;
  v_policy public.request_rate_limit_policy%rowtype;
  v_ip_count integer;
  v_phone_count integer;
begin
  -- Invalid submission identities are delegated to the existing validation
  -- boundary. It cannot insert a row before rejecting this shape.
  if jsonb_typeof(p_payload) <> 'object' then
    return public.create_request_atomic_core(
      p_payload,
      p_request_fingerprint,
      p_request_fingerprint_key_id,
      p_current_terms_version,
      p_current_terms_hash,
      p_bot_verification,
      p_risk_flags,
      p_ip_hash
    );
  end if;

  v_submission_text := p_payload->>'submission_id';
  if v_submission_text is null
     or v_submission_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return public.create_request_atomic_core(
      p_payload,
      p_request_fingerprint,
      p_request_fingerprint_key_id,
      p_current_terms_version,
      p_current_terms_hash,
      p_bot_verification,
      p_risk_flags,
      p_ip_hash
    );
  end if;
  v_submission_id := v_submission_text::uuid;

  -- Serialize against the core RPC's idempotency lock. Existing submissions
  -- must remain replayable even if new-request rate limiting is disabled.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_submission_id::text, 0)
  );

  if exists (
    select 1
      from public.requests r
     where r.submission_id = v_submission_id
  ) then
    return public.create_request_atomic_core(
      p_payload,
      p_request_fingerprint,
      p_request_fingerprint_key_id,
      p_current_terms_version,
      p_current_terms_hash,
      p_bot_verification,
      p_risk_flags,
      p_ip_hash
    );
  end if;

  select p.*
    into v_policy
    from public.request_rate_limit_policy p
   where p.id = 'primary';

  -- No silent defaults: until an operator explicitly configures both ceilings
  -- and enables the policy, every new request fails closed.
  if not found
     or v_policy.enabled is distinct from true
     or v_policy.window_seconds is null
     or v_policy.max_requests_per_ip is null
     or v_policy.max_requests_per_phone is null then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  v_phone := btrim(coalesce(p_payload->>'phone', ''));

  -- Invalid phone/security inputs stay under the core validation contract and
  -- cannot insert a row. A valid new request must have both rate-limit keys.
  if v_phone !~ '^\+989[0-9]{9}$'
     or p_ip_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return public.create_request_atomic_core(
      p_payload,
      p_request_fingerprint,
      p_request_fingerprint_key_id,
      p_current_terms_version,
      p_current_terms_hash,
      p_bot_verification,
      p_risk_flags,
      p_ip_hash
    );
  end if;

  -- Every request takes locks in the same order to avoid deadlocks. These locks
  -- make the count-and-insert decision race-safe across concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request-rate-ip|' || p_ip_hash, 2)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request-rate-phone|' || v_phone, 3)
  );

  select count(*)::integer
    into v_ip_count
    from public.requests r
   where r.ip_hash = p_ip_hash
     and r.anonymized_at is null
     and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.window_seconds);

  if v_ip_count >= v_policy.max_requests_per_ip then
    return jsonb_build_object('code', 'RATE_LIMITED');
  end if;

  select count(*)::integer
    into v_phone_count
    from public.requests r
   where r.phone_normalized = v_phone
     and r.anonymized_at is null
     and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.window_seconds);

  if v_phone_count >= v_policy.max_requests_per_phone then
    return jsonb_build_object('code', 'RATE_LIMITED');
  end if;

  return public.create_request_atomic_core(
    p_payload,
    p_request_fingerprint,
    p_request_fingerprint_key_id,
    p_current_terms_version,
    p_current_terms_hash,
    p_bot_verification,
    p_risk_flags,
    p_ip_hash
  );
end;
$$;

revoke all on function public.create_request_atomic(jsonb, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_request_atomic(jsonb, text, text, text, text, text, jsonb, text)
  to service_role;
