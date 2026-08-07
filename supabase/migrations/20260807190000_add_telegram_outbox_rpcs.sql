-- Telegram notification outbox state machine from the v23.2 launch contract.
--
-- Delivery is a side effect of request creation: request rows are committed in
-- `pending` state first. These RPCs claim and complete delivery attempts without
-- ever participating in the request-creation transaction itself.

alter table public.requests
  add constraint requests_telegram_state_chk check (
    (
      (
        telegram_status = 'pending'
        and telegram_attempt_count between 0 and 4
        and telegram_next_attempt_at is not null
        and telegram_lease_until is null
        and telegram_failed_at is null
      )
      or
      (
        telegram_status = 'sending'
        and telegram_attempt_count between 1 and 5
        and telegram_next_attempt_at is null
        and telegram_lease_until is not null
        and telegram_failed_at is null
      )
      or
      (
        telegram_status = 'sent'
        and telegram_attempt_count between 1 and 5
        and telegram_next_attempt_at is null
        and telegram_lease_until is null
        and telegram_failed_at is null
      )
      or
      (
        telegram_status = 'failed'
        and telegram_attempt_count between 1 and 5
        and telegram_next_attempt_at is null
        and telegram_lease_until is null
        and telegram_failed_at is not null
      )
    )
    and (
      (
        telegram_attempt_count = 0
        and telegram_last_attempt_at is null
        and telegram_next_attempt_at = created_at
      )
      or (
        telegram_attempt_count >= 1
        and telegram_last_attempt_at is not null
      )
    )
    and (
      telegram_alerted_at is null
      or (
        telegram_status = 'failed'
        and telegram_alerted_at >= telegram_failed_at
      )
    )
  );

create function public.claim_telegram_notifications(
  p_limit integer default 25,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_limit integer;
  v_items jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    return jsonb_build_object('code', 'VALIDATION_ERROR');
  end if;

  v_limit := case when p_request_id is null then p_limit else 1 end;

  -- An expired lease on the fifth attempt is terminal. Finalize it without a
  -- sixth send before looking for claimable rows.
  update public.requests r
     set telegram_status = 'failed',
         telegram_next_attempt_at = null,
         telegram_lease_until = null,
         telegram_failed_at = v_now
   where r.telegram_status = 'sending'
     and r.telegram_attempt_count = 5
     and r.telegram_lease_until <= v_now
     and (p_request_id is null or r.id = p_request_id);

  with candidates as (
    select r.id
      from public.requests r
     where (
       (
         r.telegram_status = 'pending'
         and r.telegram_next_attempt_at <= v_now
       )
       or (
         r.telegram_status = 'sending'
         and r.telegram_attempt_count < 5
         and r.telegram_lease_until <= v_now
       )
     )
       and (p_request_id is null or r.id = p_request_id)
     order by
       coalesce(r.telegram_next_attempt_at, r.telegram_lease_until),
       r.created_at,
       r.id
     for update skip locked
     limit v_limit
  ), claimed as (
    update public.requests r
       set telegram_status = 'sending',
           telegram_attempt_count = r.telegram_attempt_count + 1,
           telegram_last_attempt_at = v_now,
           telegram_next_attempt_at = null,
           telegram_lease_until = v_now + interval '2 minutes',
           telegram_failed_at = null
      from candidates c
     where r.id = c.id
    returning
      r.id,
      r.tracking_code,
      r.request_type,
      r.customer_name,
      r.phone_normalized,
      r.city,
      r.location_text,
      r.preferred_contact,
      r.preferred_contact_time,
      r.customer_note,
      r.configuration_snapshot,
      r.price_snapshot,
      r.needs_review,
      r.telegram_attempt_count,
      r.telegram_lease_until,
      r.created_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'request_id', c.id,
        'tracking_code', c.tracking_code,
        'request_type', c.request_type,
        'customer_name', c.customer_name,
        'phone', c.phone_normalized,
        'city', c.city,
        'location_text', c.location_text,
        'preferred_contact', c.preferred_contact,
        'preferred_contact_time', c.preferred_contact_time,
        'customer_note', c.customer_note,
        'configuration', c.configuration_snapshot,
        'price', c.price_snapshot,
        'needs_review', c.needs_review,
        'attempt', c.telegram_attempt_count,
        'lease_until', c.telegram_lease_until,
        'created_at', c.created_at
      )
      order by c.created_at, c.id
    ),
    '[]'::jsonb
  )
    into v_items
    from claimed c;

  return jsonb_build_object(
    'code', 'CLAIMED',
    'items', v_items
  );
end;
$$;

revoke all on function public.claim_telegram_notifications(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_telegram_notifications(integer, uuid)
  to service_role;

create function public.complete_telegram_notification(
  p_request_id uuid,
  p_attempt integer,
  p_outcome text,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_request public.requests%rowtype;
  v_next_attempt timestamptz;
begin
  if p_request_id is null
     or p_attempt is null
     or p_attempt < 1
     or p_attempt > 5
     or p_outcome not in ('sent', 'retryable', 'permanent_failure')
     or (p_retry_after_seconds is not null and p_retry_after_seconds < 1)
     or (p_outcome <> 'retryable' and p_retry_after_seconds is not null) then
    return jsonb_build_object('code', 'VALIDATION_ERROR');
  end if;

  select r.*
    into v_request
    from public.requests r
   where r.id = p_request_id
   for update;

  if not found then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;

  -- Attempt count is the lease generation. Once a row has been reclaimed, a
  -- late response from the older worker is stale and must not mutate state.
  if v_request.telegram_status <> 'sending'
     or v_request.telegram_attempt_count <> p_attempt then
    return jsonb_build_object('code', 'STALE');
  end if;

  if p_outcome = 'sent' then
    update public.requests
       set telegram_status = 'sent',
           telegram_next_attempt_at = null,
           telegram_lease_until = null,
           telegram_failed_at = null
     where id = p_request_id;

    return jsonb_build_object('code', 'SENT');
  end if;

  if p_outcome = 'permanent_failure' or p_attempt = 5 then
    update public.requests
       set telegram_status = 'failed',
           telegram_next_attempt_at = null,
           telegram_lease_until = null,
           telegram_failed_at = v_now
     where id = p_request_id;

    return jsonb_build_object('code', 'FAILED');
  end if;

  v_next_attempt := case p_attempt
    when 1 then v_request.created_at + interval '1 hour'
    when 2 then v_request.created_at + interval '4 hours'
    when 3 then v_request.created_at + interval '12 hours'
    when 4 then v_request.created_at + interval '24 hours'
    else null
  end;

  if p_retry_after_seconds is not null then
    v_next_attempt := greatest(
      v_next_attempt,
      v_now + pg_catalog.make_interval(secs => p_retry_after_seconds)
    );
  end if;

  update public.requests
     set telegram_status = 'pending',
         telegram_next_attempt_at = v_next_attempt,
         telegram_lease_until = null,
         telegram_failed_at = null
   where id = p_request_id;

  return jsonb_build_object(
    'code', 'RETRY_SCHEDULED',
    'next_attempt_at', v_next_attempt
  );
end;
$$;

revoke all on function public.complete_telegram_notification(uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_telegram_notification(uuid, integer, text, integer)
  to service_role;
