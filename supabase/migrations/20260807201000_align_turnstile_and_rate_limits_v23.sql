-- Align request anti-abuse behavior with Mehrara Launch Core v23.2.
--
-- This is a fix-forward migration. Historical migrations remain immutable.
-- The previous single-window IP/phone wrapper is replaced by the CGNAT-safe
-- matrix defined in v23.2. The policy is deliberately left disabled after this
-- migration; production activation happens only after the migration tests and
-- live Supabase verification pass.

alter table public.request_rate_limit_policy
  add column ip_window_seconds integer,
  add column no_token_phone_window_seconds integer,
  add column max_no_token_per_phone integer,
  add column service_error_window_seconds integer,
  add column max_service_error_global integer,
  add column max_service_error_per_ip_phone integer,
  add column shared_ip_soft_threshold integer;

update public.request_rate_limit_policy
   set enabled = false,
       window_seconds = 600,
       max_requests_per_phone = 3,
       max_requests_per_ip = 200,
       ip_window_seconds = 3600,
       no_token_phone_window_seconds = 1800,
       max_no_token_per_phone = 2,
       service_error_window_seconds = 3600,
       max_service_error_global = 20,
       max_service_error_per_ip_phone = 3,
       shared_ip_soft_threshold = 20
 where id = 'primary';

alter table public.request_rate_limit_policy
  alter column window_seconds set default 600,
  alter column window_seconds set not null,
  alter column max_requests_per_phone set default 3,
  alter column max_requests_per_phone set not null,
  alter column max_requests_per_ip set default 200,
  alter column max_requests_per_ip set not null,
  alter column ip_window_seconds set default 3600,
  alter column ip_window_seconds set not null,
  alter column no_token_phone_window_seconds set default 1800,
  alter column no_token_phone_window_seconds set not null,
  alter column max_no_token_per_phone set default 2,
  alter column max_no_token_per_phone set not null,
  alter column service_error_window_seconds set default 3600,
  alter column service_error_window_seconds set not null,
  alter column max_service_error_global set default 20,
  alter column max_service_error_global set not null,
  alter column max_service_error_per_ip_phone set default 3,
  alter column max_service_error_per_ip_phone set not null,
  alter column shared_ip_soft_threshold set default 20,
  alter column shared_ip_soft_threshold set not null;

alter table public.request_rate_limit_policy
  add constraint request_rate_limit_policy_ip_window_chk
    check (ip_window_seconds between 60 and 86400),
  add constraint request_rate_limit_policy_no_token_window_chk
    check (no_token_phone_window_seconds between 60 and 86400),
  add constraint request_rate_limit_policy_no_token_max_chk
    check (max_no_token_per_phone between 1 and 1000),
  add constraint request_rate_limit_policy_service_window_chk
    check (service_error_window_seconds between 60 and 86400),
  add constraint request_rate_limit_policy_service_global_chk
    check (max_service_error_global between 1 and 10000),
  add constraint request_rate_limit_policy_service_pair_chk
    check (max_service_error_per_ip_phone between 1 and 1000),
  add constraint request_rate_limit_policy_shared_ip_soft_chk
    check (shared_ip_soft_threshold between 1 and 10000),
  add constraint request_rate_limit_policy_threshold_order_chk
    check (shared_ip_soft_threshold < max_requests_per_ip);

-- The original core hard-blocked a same-phone + same-request-type submission
-- inside 10 minutes. v23.2 requires that condition to be a soft review flag;
-- the hard ceiling is the independent 3-per-phone/10-minute rule in the outer
-- transactional wrapper. Patch only the exact historical block and abort the
-- migration if the expected core definition has drifted.
do $migration$
declare
  v_definition text;
  v_old text := $old$
  if exists (
    select 1
      from public.requests r
     where r.phone_normalized = v_phone
       and r.request_type = v_request_type
       and r.anonymized_at is null
       and r.created_at > v_now - interval '10 minutes'
  ) then
    return jsonb_build_object('code', 'RATE_LIMITED');
  end if;
$old$;
  v_new text := $new$
  if exists (
    select 1
      from public.requests r
     where r.phone_normalized = v_phone
       and r.request_type = v_request_type
       and r.anonymized_at is null
       and r.created_at > v_now - interval '10 minutes'
  ) and not (p_risk_flags ? 'repeat_phone_short_window') then
    p_risk_flags := p_risk_flags || '["repeat_phone_short_window"]'::jsonb;
  end if;
$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_request_atomic_core(jsonb,text,text,text,text,text,jsonb,text)'::regprocedure
  ) into v_definition;

  if pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'create_request_atomic_core duplicate block drifted; refusing unsafe patch';
  end if;

  if pg_catalog.strpos(pg_catalog.replace(v_definition, v_old, ''), v_old) <> 0 then
    raise exception 'create_request_atomic_core duplicate block matched more than once';
  end if;

  execute pg_catalog.replace(v_definition, v_old, v_new);
end;
$migration$;

alter function public.create_request_atomic_core(jsonb,text,text,text,text,text,jsonb,text)
  set statement_timeout to '5s';
alter function public.create_request_atomic_core(jsonb,text,text,text,text,text,jsonb,text)
  set lock_timeout to '3s';

create or replace function public.create_request_atomic(
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
set statement_timeout to '5s'
set lock_timeout to '3s'
as $$
declare
  v_now timestamptz := now();
  v_submission_text text;
  v_submission_id uuid;
  v_phone text;
  v_request_type text;
  v_policy public.request_rate_limit_policy%rowtype;
  v_risk_flags jsonb := p_risk_flags;
  v_count integer;
begin
  -- Invalid submission identities remain under the core validation boundary.
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

  -- Replay/idempotency always wins over new-request rate limiting.
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

  -- No silent defaults. New requests remain fail-closed until an operator has
  -- explicitly enabled the fully populated v23.2 policy after verification.
  if not found
     or v_policy.enabled is distinct from true
     or v_policy.window_seconds is null
     or v_policy.max_requests_per_phone is null
     or v_policy.max_requests_per_ip is null
     or v_policy.ip_window_seconds is null
     or v_policy.no_token_phone_window_seconds is null
     or v_policy.max_no_token_per_phone is null
     or v_policy.service_error_window_seconds is null
     or v_policy.max_service_error_global is null
     or v_policy.max_service_error_per_ip_phone is null
     or v_policy.shared_ip_soft_threshold is null then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  v_phone := btrim(coalesce(p_payload->>'phone', ''));
  v_request_type := btrim(coalesce(p_payload->>'request_type', ''));

  -- Security/shape mismatches stay under the authoritative core validator and
  -- therefore never become rate-limit oracles.
  if v_phone !~ '^\+989[0-9]{9}$'
     or v_request_type not in ('grave_stone','building_stone','contact')
     or p_bot_verification not in ('verified','unverified_no_token','unverified_service_error')
     or p_risk_flags is null
     or jsonb_typeof(p_risk_flags) <> 'array'
     or not (p_risk_flags <@ '["shared_ip_volume","turnstile_no_token","turnstile_unavailable","fast_submit_signal","repeat_phone_short_window"]'::jsonb)
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
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

  if (
      p_bot_verification = 'verified'
      and (p_risk_flags ?| array['turnstile_no_token','turnstile_unavailable'])
    ) or (
      p_bot_verification = 'unverified_no_token'
      and (not (p_risk_flags ? 'turnstile_no_token') or p_risk_flags ? 'turnstile_unavailable')
    ) or (
      p_bot_verification = 'unverified_service_error'
      and (not (p_risk_flags ? 'turnstile_unavailable') or p_risk_flags ? 'turnstile_no_token')
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

  -- Lock ordering is deterministic: service-error global, IP, then phone.
  -- Every exact count and the eventual insert happen in this same transaction.
  if p_bot_verification = 'unverified_service_error' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('request-rate-service-error-global', 4)
    );
  end if;

  if p_ip_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('request-rate-ip|' || p_ip_hash, 2)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request-rate-phone|' || v_phone, 3)
  );

  -- Hard general phone ceiling: 3 committed new requests / 10 minutes across
  -- every request type. The fourth new submission is rejected.
  select count(*)::integer
    into v_count
    from public.requests r
   where r.phone_normalized = v_phone
     and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.window_seconds);

  if v_count >= v_policy.max_requests_per_phone then
    return jsonb_build_object('code', 'RATE_LIMITED');
  end if;

  -- Missing Turnstile proof has its own tighter phone ceiling and does not use
  -- IP as a hard key, preserving CGNAT safety.
  if p_bot_verification = 'unverified_no_token' then
    select count(*)::integer
      into v_count
      from public.requests r
     where r.phone_normalized = v_phone
       and r.bot_verification = 'unverified_no_token'
       and r.created_at > v_now - pg_catalog.make_interval(
         secs => v_policy.no_token_phone_window_seconds
       );

    if v_count >= v_policy.max_no_token_per_phone then
      return jsonb_build_object('code', 'RATE_LIMITED');
    end if;
  end if;

  -- Siteverify service failure: global 20/hour plus local 3/hour on the
  -- combined ip_hash + phone key. Missing IP simply removes the local pair
  -- limit; the general phone and global service-error ceilings still apply.
  if p_bot_verification = 'unverified_service_error' then
    select count(*)::integer
      into v_count
      from public.requests r
     where r.bot_verification = 'unverified_service_error'
       and r.created_at > v_now - pg_catalog.make_interval(
         secs => v_policy.service_error_window_seconds
       );

    if v_count >= v_policy.max_service_error_global then
      return jsonb_build_object('code', 'RATE_LIMITED');
    end if;

    if p_ip_hash is not null then
      select count(*)::integer
        into v_count
        from public.requests r
       where r.bot_verification = 'unverified_service_error'
         and r.ip_hash = p_ip_hash
         and r.phone_normalized = v_phone
         and r.created_at > v_now - pg_catalog.make_interval(
           secs => v_policy.service_error_window_seconds
         );

      if v_count >= v_policy.max_service_error_per_ip_phone then
        return jsonb_build_object('code', 'RATE_LIMITED');
      end if;
    end if;
  end if;

  if p_ip_hash is not null then
    -- Emergency CGNAT-safe hard ceiling: only unverified rows count. Verified
    -- users are never blocked solely because a carrier-grade NAT is busy.
    if p_bot_verification <> 'verified' then
      select count(*)::integer
        into v_count
        from public.requests r
       where r.ip_hash = p_ip_hash
         and r.bot_verification in ('unverified_no_token','unverified_service_error')
         and r.created_at > v_now - pg_catalog.make_interval(
           secs => v_policy.ip_window_seconds
         );

      if v_count >= v_policy.max_requests_per_ip then
        return jsonb_build_object('code', 'RATE_LIMITED');
      end if;
    end if;

    -- Shared-IP volume is review-only. It never blocks by itself.
    select count(*)::integer
      into v_count
      from public.requests r
     where r.ip_hash = p_ip_hash
       and r.created_at > v_now - pg_catalog.make_interval(
         secs => v_policy.ip_window_seconds
       );

    if v_count >= v_policy.shared_ip_soft_threshold
       and not (v_risk_flags ? 'shared_ip_volume') then
      v_risk_flags := v_risk_flags || '["shared_ip_volume"]'::jsonb;
    end if;
  end if;

  -- Same phone + same request type inside 10 minutes is a soft duplicate only.
  if exists (
    select 1
      from public.requests r
     where r.phone_normalized = v_phone
       and r.request_type = v_request_type
       and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.window_seconds)
  ) and not (v_risk_flags ? 'repeat_phone_short_window') then
    v_risk_flags := v_risk_flags || '["repeat_phone_short_window"]'::jsonb;
  end if;

  return public.create_request_atomic_core(
    p_payload,
    p_request_fingerprint,
    p_request_fingerprint_key_id,
    p_current_terms_version,
    p_current_terms_hash,
    p_bot_verification,
    v_risk_flags,
    p_ip_hash
  );
end;
$$;

revoke all on function public.create_request_atomic(jsonb,text,text,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_request_atomic(jsonb,text,text,text,text,text,jsonb,text)
  to service_role;
