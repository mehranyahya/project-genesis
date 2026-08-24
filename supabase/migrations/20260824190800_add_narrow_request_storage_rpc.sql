-- Narrow atomic storage boundary for request creation.
-- Business schema, Catalog, Terms and price decisions belong to the Edge Function.
-- This RPC owns only idempotency, transactional rate limits, sequence allocation
-- and insertion of the already-authoritative normalized snapshots.

create or replace function public.create_request_atomic_storage(
  p_submission_id uuid,
  p_request_fingerprint text,
  p_request_fingerprint_key_id text,
  p_request_type text,
  p_client_catalog_version text,
  p_server_catalog_version text,
  p_configuration_snapshot jsonb,
  p_price_snapshot jsonb,
  p_customer_name text,
  p_phone_normalized text,
  p_city text,
  p_location_text text,
  p_preferred_contact text,
  p_preferred_contact_time text,
  p_customer_note text,
  p_terms_version text,
  p_terms_content_hash text,
  p_bot_verification text,
  p_risk_flags jsonb,
  p_ip_hash text,
  p_tracking_code_prefix text
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
  v_existing public.requests%rowtype;
  v_policy public.request_rate_limit_policy%rowtype;
  v_risk_flags jsonb := p_risk_flags;
  v_count integer;
  v_tracking_code text;
  v_sequence_value bigint;
  v_needs_review boolean;
  v_request_id uuid;
begin
  -- These are storage-boundary invariants only. Business/Catalog/Terms decisions
  -- must already have been completed by the Edge Function.
  if p_submission_id is null
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_request_fingerprint_key_id is null
     or p_request_fingerprint_key_id !~ '^[A-Za-z0-9._-]{1,64}$'
     or p_request_type not in ('grave_stone','building_stone','contact')
     or p_customer_name is null
     or char_length(p_customer_name) not between 2 and 80
     or p_customer_name <> btrim(p_customer_name)
     or p_phone_normalized is null
     or p_phone_normalized !~ '^\+989[0-9]{9}$'
     or p_preferred_contact not in ('phone','whatsapp','telegram')
     or (p_city is not null and (char_length(p_city) not between 1 and 50 or p_city <> btrim(p_city)))
     or (p_location_text is not null and (char_length(p_location_text) not between 1 and 200 or p_location_text <> btrim(p_location_text)))
     or (p_preferred_contact_time is not null and (char_length(p_preferred_contact_time) not between 1 and 100 or p_preferred_contact_time <> btrim(p_preferred_contact_time)))
     or (p_customer_note is not null and (char_length(p_customer_note) not between 1 and 1000 or p_customer_note <> btrim(p_customer_note)))
     or p_terms_version is null
     or char_length(p_terms_version) not between 1 and 80
     or p_terms_version <> btrim(p_terms_version)
     or p_terms_content_hash is null
     or p_terms_content_hash !~ '^[0-9a-f]{64}$'
     or p_bot_verification not in ('verified','unverified_no_token','unverified_service_error')
     or p_risk_flags is null
     or jsonb_typeof(p_risk_flags) <> 'array'
     or not (p_risk_flags <@ '["shared_ip_volume","turnstile_no_token","turnstile_unavailable","fast_submit_signal","repeat_phone_short_window"]'::jsonb)
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
     or p_tracking_code_prefix is null
     or p_tracking_code_prefix !~ '^[A-Z][A-Z0-9]{1,9}$'
     or p_configuration_snapshot is null
     or jsonb_typeof(p_configuration_snapshot) <> 'object'
     or not (p_configuration_snapshot ?& array['content_schema_version','tracking_code_prefix'])
     or p_configuration_snapshot->>'tracking_code_prefix' is distinct from p_tracking_code_prefix
     or (p_price_snapshot is not null and jsonb_typeof(p_price_snapshot) <> 'object') then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
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
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  if p_request_type = 'grave_stone' then
    if p_client_catalog_version is null
       or p_client_catalog_version !~ '^[0-9a-f]{64}$'
       or p_server_catalog_version is null
       or p_server_catalog_version !~ '^[0-9a-f]{64}$'
       or p_price_snapshot is null then
      return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
    end if;
  elsif p_client_catalog_version is not null or p_server_catalog_version is not null then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  if p_request_type = 'contact' and p_price_snapshot is not null then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  -- Idempotency always wins over rate limiting. The inspect RPC is only an
  -- optimization before Siteverify; this lock is the final race-safe boundary.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_submission_id::text, 0)
  );

  select r.*
    into v_existing
    from public.requests r
   where r.submission_id = p_submission_id;

  if found then
    if v_now >= v_existing.idempotency_expires_at then
      return jsonb_build_object('code', 'IDEMPOTENCY_EXPIRED');
    end if;
    if v_existing.request_fingerprint is distinct from p_request_fingerprint
       or v_existing.request_fingerprint_key_id is distinct from p_request_fingerprint_key_id then
      return jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT');
    end if;
    return jsonb_build_object(
      'code', 'REQUEST_REPLAYED',
      'tracking_code', v_existing.tracking_code,
      'request_id', v_existing.id
    );
  end if;

  select p.*
    into v_policy
    from public.request_rate_limit_policy p
   where p.id = 'primary';

  -- New writes remain fail-closed until the operator explicitly enables the
  -- fully-populated policy after Preview smoke and DB verification.
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

  -- Lock order is deterministic: global service-error, IP, phone.
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
    pg_catalog.hashtextextended('request-rate-phone|' || p_phone_normalized, 3)
  );

  select count(*)::integer
    into v_count
    from public.requests r
   where r.phone_normalized = p_phone_normalized
     and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.window_seconds);
  if v_count >= v_policy.max_requests_per_phone then
    return jsonb_build_object('code', 'RATE_LIMITED');
  end if;

  if p_bot_verification = 'unverified_no_token' then
    select count(*)::integer
      into v_count
      from public.requests r
     where r.phone_normalized = p_phone_normalized
       and r.bot_verification = 'unverified_no_token'
       and r.created_at > v_now - pg_catalog.make_interval(
         secs => v_policy.no_token_phone_window_seconds
       );
    if v_count >= v_policy.max_no_token_per_phone then
      return jsonb_build_object('code', 'RATE_LIMITED');
    end if;
  end if;

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
         and r.phone_normalized = p_phone_normalized
         and r.created_at > v_now - pg_catalog.make_interval(
           secs => v_policy.service_error_window_seconds
         );
      if v_count >= v_policy.max_service_error_per_ip_phone then
        return jsonb_build_object('code', 'RATE_LIMITED');
      end if;
    end if;
  end if;

  if p_ip_hash is not null then
    if p_bot_verification <> 'verified' then
      select count(*)::integer
        into v_count
        from public.requests r
       where r.ip_hash = p_ip_hash
         and r.bot_verification in ('unverified_no_token','unverified_service_error')
         and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.ip_window_seconds);
      if v_count >= v_policy.max_requests_per_ip then
        return jsonb_build_object('code', 'RATE_LIMITED');
      end if;
    end if;

    select count(*)::integer
      into v_count
      from public.requests r
     where r.ip_hash = p_ip_hash
       and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.ip_window_seconds);
    if v_count >= v_policy.shared_ip_soft_threshold
       and not (v_risk_flags ? 'shared_ip_volume') then
      v_risk_flags := v_risk_flags || '["shared_ip_volume"]'::jsonb;
    end if;
  end if;

  if exists (
    select 1
      from public.requests r
     where r.phone_normalized = p_phone_normalized
       and r.request_type = p_request_type
       and r.created_at > v_now - pg_catalog.make_interval(secs => v_policy.window_seconds)
  ) and not (v_risk_flags ? 'repeat_phone_short_window') then
    v_risk_flags := v_risk_flags || '["repeat_phone_short_window"]'::jsonb;
  end if;

  v_needs_review :=
    p_bot_verification <> 'verified'
    or jsonb_array_length(v_risk_flags) > 0
    or (
      p_price_snapshot is not null
      and p_price_snapshot->>'price_type' = 'review'
    );

  v_sequence_value := nextval('public.request_code_seq'::regclass);
  v_tracking_code := p_tracking_code_prefix || '-' || v_sequence_value::text;

  begin
    insert into public.requests (
      submission_id,
      request_fingerprint,
      request_fingerprint_key_id,
      idempotency_expires_at,
      tracking_code,
      request_type,
      client_catalog_version,
      server_catalog_version,
      configuration_snapshot,
      price_snapshot,
      customer_name,
      phone_normalized,
      city,
      location_text,
      preferred_contact,
      preferred_contact_time,
      customer_note,
      terms_version,
      terms_content_hash,
      terms_accepted_at,
      bot_verification,
      needs_review,
      risk_flags,
      ip_hash,
      created_at,
      updated_at,
      status_changed_at
    ) values (
      p_submission_id,
      p_request_fingerprint,
      p_request_fingerprint_key_id,
      v_now + interval '24 hours',
      v_tracking_code,
      p_request_type,
      p_client_catalog_version,
      p_server_catalog_version,
      p_configuration_snapshot,
      p_price_snapshot,
      p_customer_name,
      p_phone_normalized,
      p_city,
      p_location_text,
      p_preferred_contact,
      p_preferred_contact_time,
      p_customer_note,
      p_terms_version,
      p_terms_content_hash,
      v_now,
      p_bot_verification,
      v_needs_review,
      v_risk_flags,
      p_ip_hash,
      v_now,
      v_now,
      v_now
    )
    returning id into v_request_id;
  exception when unique_violation then
    -- Defensive race fallback. The advisory lock should serialize matching
    -- submission IDs, but a uniqueness race never creates a second code.
    select r.*
      into v_existing
      from public.requests r
     where r.submission_id = p_submission_id;
    if found
       and v_now < v_existing.idempotency_expires_at
       and v_existing.request_fingerprint is not distinct from p_request_fingerprint
       and v_existing.request_fingerprint_key_id is not distinct from p_request_fingerprint_key_id then
      return jsonb_build_object(
        'code', 'REQUEST_REPLAYED',
        'tracking_code', v_existing.tracking_code,
        'request_id', v_existing.id
      );
    end if;
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end;

  return jsonb_build_object(
    'code', 'REQUEST_CREATED',
    'tracking_code', v_tracking_code,
    'request_id', v_request_id
  );
end;
$$;

revoke all on function public.create_request_atomic_storage(
  uuid,text,text,text,text,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.create_request_atomic_storage(
  uuid,text,text,text,text,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,jsonb,text,text
) to service_role;

-- The historical business-heavy functions remain in migration history for
-- rollback/audit, but the runtime principal must not call them after this cutover.
revoke execute on function public.create_request_atomic(
  jsonb,text,text,text,text,text,jsonb,text
) from service_role;
revoke execute on function public.create_request_atomic_core(
  jsonb,text,text,text,text,text,jsonb,text
) from service_role;
