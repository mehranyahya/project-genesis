-- Atomic request creation boundary.
-- The browser never calls this function directly. A same-origin server route
-- validates transport/security inputs and calls this RPC with service_role.

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
as $$
declare
  v_now timestamptz := now();
  v_submission_text text;
  v_submission_id uuid;
  v_existing public.requests%rowtype;
  v_request_type text;
  v_name text;
  v_phone text;
  v_city text;
  v_location text;
  v_preferred_contact text;
  v_contact_time text;
  v_note text;
  v_terms_version text;
  v_terms_hash text;
  v_errors jsonb := '{}'::jsonb;
  v_server_catalog text;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_option_ids text[] := '{}'::text[];
  v_canonical_option_ids text[] := '{}'::text[];
  v_option_docs jsonb := '[]'::jsonb;
  v_option_count integer := 0;
  v_distinct_option_count integer := 0;
  v_has_review boolean := false;
  v_has_estimate boolean := false;
  v_option_total numeric := 0;
  v_total numeric := 0;
  v_server_price_type text;
  v_server_amount bigint;
  v_config jsonb;
  v_price jsonb;
  v_needs_review boolean := false;
  v_tracking_code text;
  v_sequence_value bigint;
  v_stone_type text;
  v_application text;
  v_area jsonb;
  v_source_type text;
  v_portfolio_reference text;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('code', 'VALIDATION_ERROR', 'field_errors', '{}'::jsonb);
  end if;

  if p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_request_fingerprint_key_id is null
     or p_request_fingerprint_key_id !~ '^[A-Za-z0-9._-]{1,64}$'
     or p_risk_flags is null
     or jsonb_typeof(p_risk_flags) <> 'array'
     or not (p_risk_flags <@ '["shared_ip_volume","turnstile_no_token","turnstile_unavailable","fast_submit_signal","repeat_phone_short_window"]'::jsonb)
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  if p_bot_verification not in ('verified','unverified_no_token','unverified_service_error') then
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

  v_submission_text := p_payload->>'submission_id';
  if v_submission_text is null
     or v_submission_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('code', 'VALIDATION_ERROR', 'field_errors', '{}'::jsonb);
  end if;
  v_submission_id := v_submission_text::uuid;

  -- Serialize every use of one submission id. This makes replay/conflict
  -- behaviour deterministic even under concurrent double-clicks/retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_submission_id::text, 0));

  select r.*
    into v_existing
    from public.requests r
   where r.submission_id = v_submission_id;

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
      'tracking_code', v_existing.tracking_code
    );
  end if;

  v_request_type := p_payload->>'request_type';
  if v_request_type not in ('grave_stone','building_stone','contact') then
    return jsonb_build_object('code', 'VALIDATION_ERROR', 'field_errors', '{}'::jsonb);
  end if;

  v_name := btrim(coalesce(p_payload->>'customer_name', ''));
  v_phone := btrim(coalesce(p_payload->>'phone', ''));
  v_city := nullif(btrim(coalesce(p_payload->>'city', '')), '');
  v_location := nullif(btrim(coalesce(p_payload->>'location_text', '')), '');
  v_preferred_contact := nullif(btrim(coalesce(p_payload->>'preferred_contact', '')), '');
  v_contact_time := nullif(btrim(coalesce(p_payload->>'preferred_contact_time', '')), '');
  v_note := nullif(btrim(coalesce(p_payload->>'customer_note', '')), '');
  v_terms_version := btrim(coalesce(p_payload->>'terms_version', ''));
  v_terms_hash := coalesce(p_payload->>'terms_content_hash', '');

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    v_errors := v_errors || jsonb_build_object('customer_name', true);
  end if;
  if v_phone !~ '^\+989[0-9]{9}$' then
    v_errors := v_errors || jsonb_build_object('phone', true);
  end if;
  if v_city is not null and char_length(v_city) > 50 then
    v_errors := v_errors || jsonb_build_object('city', true);
  end if;
  if v_location is not null and char_length(v_location) > 200 then
    v_errors := v_errors || jsonb_build_object('location_text', true);
  end if;
  if v_preferred_contact not in ('phone','whatsapp','telegram') then
    v_errors := v_errors || jsonb_build_object('preferred_contact', true);
  end if;
  if v_contact_time is not null and char_length(v_contact_time) > 100 then
    v_errors := v_errors || jsonb_build_object('preferred_contact_time', true);
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    v_errors := v_errors || jsonb_build_object('customer_note', true);
  end if;
  if v_request_type = 'grave_stone' and v_city is null then
    v_errors := v_errors || jsonb_build_object('city', true);
  end if;
  if v_request_type = 'grave_stone' and v_location is null then
    v_errors := v_errors || jsonb_build_object('location_text', true);
  end if;
  if coalesce((p_payload->>'terms_accepted')::boolean, false) is distinct from true
     or char_length(v_terms_version) < 1
     or char_length(v_terms_version) > 80
     or v_terms_hash !~ '^[0-9a-f]{64}$' then
    v_errors := v_errors || jsonb_build_object('terms', true);
  end if;

  if v_errors <> '{}'::jsonb then
    return jsonb_build_object('code', 'VALIDATION_ERROR', 'field_errors', v_errors);
  end if;

  -- Current terms come from the server-side Git content boundary. Existing
  -- idempotent requests were already replayed above; only new requests require
  -- the current document to be available and accepted.
  if p_current_terms_version is null
     or char_length(btrim(p_current_terms_version)) < 1
     or char_length(btrim(p_current_terms_version)) > 80
     or p_current_terms_hash is null
     or p_current_terms_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
  end if;

  if v_terms_version <> btrim(p_current_terms_version)
     or v_terms_hash <> p_current_terms_hash then
    return jsonb_build_object(
      'code', 'TERMS_UPDATED',
      'terms', jsonb_build_object(
        'version', btrim(p_current_terms_version),
        'content_hash', p_current_terms_hash
      )
    );
  end if;

  -- Serialize the short-window duplicate check for one phone/request type.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_phone || '|' || v_request_type, 1)
  );

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

  v_needs_review := p_bot_verification <> 'verified' or jsonb_array_length(p_risk_flags) > 0;

  if v_request_type = 'grave_stone' then
    if coalesce(p_payload->>'client_catalog_version', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(p_payload->'option_ids') <> 'array' then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    select p.*
      into v_product
      from public.products p
     where p.id = p_payload->>'product_id'
       and p.code = p_payload->>'product_code'
       and p.is_active = true;
    if not found then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    select v.*
      into v_variant
      from public.product_variants v
     where v.id = p_payload->>'variant_id'
       and v.product_id = v_product.id
       and v.stone_code = p_payload->>'stone_code'
       and v.size_code = p_payload->>'size_code'
       and v.is_available = true;
    if not found then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    if exists (
      select 1
        from jsonb_array_elements(p_payload->'option_ids') e(value)
       where jsonb_typeof(e.value) <> 'string'
    ) then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    select coalesce(array_agg(e.value order by e.ord), '{}'::text[])
      into v_option_ids
      from jsonb_array_elements_text(p_payload->'option_ids') with ordinality e(value, ord);

    select count(*), count(distinct x)
      into v_option_count, v_distinct_option_count
      from unnest(v_option_ids) x;
    if v_option_count <> v_distinct_option_count then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    select
      coalesce(array_agg(o.id order by o.sort_order, o.id), '{}'::text[]),
      coalesce(
        jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title) order by o.sort_order, o.id),
        '[]'::jsonb
      )
      into v_canonical_option_ids, v_option_docs
      from public.product_options o
     where o.variant_id = v_variant.id
       and o.id = any(v_option_ids)
       and o.is_available = true
       and v_variant.size_code = any(o.compatible_size_codes);

    if cardinality(v_canonical_option_ids) <> cardinality(v_option_ids) then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    select
      coalesce(bool_or(o.price_type = 'review'), false),
      coalesce(bool_or(o.price_type = 'estimate'), false),
      coalesce(sum(o.amount_toman) filter (where o.amount_toman is not null), 0)
      into v_has_review, v_has_estimate, v_option_total
      from public.product_options o
     where o.variant_id = v_variant.id
       and o.id = any(v_canonical_option_ids);

    if v_variant.size_code = 'custom'
       or v_variant.price_type = 'review'
       or v_has_review then
      v_server_price_type := 'review';
      v_server_amount := null;
      v_needs_review := true;
    else
      v_total := coalesce(v_variant.amount_toman, 0)::numeric + v_option_total;
      if v_total <= 0 or v_total > 9007199254740991 then
        return jsonb_build_object('code', 'TEMPORARILY_UNAVAILABLE');
      end if;
      v_server_amount := v_total::bigint;
      if v_variant.price_type = 'estimate' or v_has_estimate then
        v_server_price_type := 'estimate';
      else
        v_server_price_type := 'fixed';
      end if;
    end if;

    if p_payload->>'client_price_type' is distinct from v_server_price_type
       or (
         v_server_amount is null
         and jsonb_typeof(p_payload->'client_displayed_price') is distinct from 'null'
       )
       or (
         v_server_amount is not null
         and (
           jsonb_typeof(p_payload->'client_displayed_price') is distinct from 'number'
           or (p_payload->>'client_displayed_price') !~ '^[0-9]+$'
           or (p_payload->>'client_displayed_price')::numeric <> v_server_amount::numeric
         )
       ) then
      return jsonb_build_object(
        'code', 'PRICE_CHANGED',
        'price', jsonb_build_object(
          'price_type', v_server_price_type,
          'amount_toman', to_jsonb(v_server_amount)
        )
      );
    end if;

    v_server_catalog := public.compute_operational_catalog_version();
    v_config := jsonb_build_object(
      'content_schema_version', 1,
      'tracking_code_prefix', 'MA',
      'product_id', v_product.id,
      'product_code', v_product.code,
      'variant_id', v_variant.id,
      'stone_code', v_variant.stone_code,
      'size_code', v_variant.size_code,
      'selected_option_ids', to_jsonb(v_canonical_option_ids),
      'selected_options', v_option_docs
    );
    v_price := jsonb_build_object(
      'client_displayed_price', to_jsonb(v_server_amount),
      'server_calculated_price', to_jsonb(v_server_amount),
      'price_type', v_server_price_type,
      'includes', to_jsonb(v_variant.includes),
      'excludes', to_jsonb(v_variant.excludes),
      'calculated_at', to_jsonb(v_now)
    );

  elsif v_request_type = 'building_stone' then
    v_stone_type := p_payload->>'stone_type';
    v_application := p_payload->>'application';
    v_area := p_payload->'area_m2';

    if v_stone_type not in ('marble','granite','travertine','crystal')
       or v_application not in ('facade','flooring','stairs','interior_wall','countertop','other')
       or v_area is null
       or jsonb_typeof(v_area) not in ('number','null')
       or (
         jsonb_typeof(v_area) = 'number'
         and (
           (v_area #>> '{}') !~ '^[0-9]+(?:\.[0-9]{1,3})?$'
           or (v_area #>> '{}')::numeric <= 0
           or (v_area #>> '{}')::numeric > 100000
         )
       )
       or (
         v_application = 'other'
         and (v_note is null or char_length(v_note) < 10 or char_length(v_note) > 500)
       ) then
      return jsonb_build_object('code', 'VALIDATION_ERROR', 'field_errors', '{}'::jsonb);
    end if;

    if p_payload->>'client_price_type' is distinct from 'review'
       or jsonb_typeof(p_payload->'client_displayed_price') is distinct from 'null' then
      return jsonb_build_object(
        'code', 'PRICE_CHANGED',
        'price', jsonb_build_object('price_type', 'review', 'amount_toman', null)
      );
    end if;

    v_needs_review := true;
    v_config := jsonb_build_object(
      'content_schema_version', 1,
      'tracking_code_prefix', 'MA',
      'stone_type_code', v_stone_type,
      'application', v_application,
      'area_m2', v_area
    );
    v_price := jsonb_build_object(
      'client_displayed_price', null,
      'server_calculated_price', null,
      'price_type', 'review',
      'includes', '[]'::jsonb,
      'excludes', '[]'::jsonb,
      'calculated_at', to_jsonb(v_now)
    );

  else
    v_source_type := nullif(btrim(coalesce(p_payload->>'source_type', '')), '');
    v_portfolio_reference := nullif(btrim(coalesce(p_payload->>'portfolio_reference_id', '')), '');

    if (v_source_type is null) <> (v_portfolio_reference is null) then
      return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
    end if;

    v_config := jsonb_build_object(
      'content_schema_version', 1,
      'tracking_code_prefix', 'MA'
    );

    if v_source_type is not null then
      if v_source_type <> 'portfolio'
         or v_portfolio_reference !~ '^pf-[0-9]{4,}$'
         or not exists (
           select 1
             from public.portfolio_items p
            where p.public_reference_id = v_portfolio_reference
              and p.is_active = true
         ) then
        return jsonb_build_object('code', 'SELECTION_UNAVAILABLE');
      end if;
      v_config := v_config || jsonb_build_object(
        'source_type', 'portfolio',
        'portfolio_reference_id', v_portfolio_reference
      );
    end if;

    v_price := null;
  end if;

  v_sequence_value := nextval('public.request_code_seq'::regclass);
  v_tracking_code := 'MA-' || v_sequence_value::text;

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
    v_submission_id,
    p_request_fingerprint,
    p_request_fingerprint_key_id,
    v_now + interval '24 hours',
    v_tracking_code,
    v_request_type,
    case when v_request_type = 'grave_stone' then p_payload->>'client_catalog_version' else null end,
    case when v_request_type = 'grave_stone' then v_server_catalog else null end,
    v_config,
    v_price,
    v_name,
    v_phone,
    v_city,
    v_location,
    v_preferred_contact,
    v_contact_time,
    v_note,
    v_terms_version,
    v_terms_hash,
    v_now,
    p_bot_verification,
    v_needs_review,
    p_risk_flags,
    p_ip_hash,
    v_now,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'code', 'REQUEST_CREATED',
    'tracking_code', v_tracking_code
  );
end;
$$;

revoke all on function public.create_request_atomic(jsonb,text,text,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_request_atomic(jsonb,text,text,text,text,text,jsonb,text)
  to service_role;
