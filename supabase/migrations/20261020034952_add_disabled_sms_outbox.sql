-- Preparation only. Apply only after the project's encrypted backup/restore
-- gate. No provider, template, historical backfill or active sending is seeded.
create table public.sms_delivery_policy (
  id text primary key default 'primary' check (id = 'primary'),
  enabled boolean not null default false,
  provider_id text check (provider_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  fa_template_id text check (fa_template_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  en_template_id text check (en_template_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  fa_terms_hash text check (fa_terms_hash ~ '^[0-9a-f]{64}$'),
  en_terms_hash text check (en_terms_hash ~ '^[0-9a-f]{64}$'),
  max_attempts_per_day integer not null default 20 check (max_attempts_per_day between 1 and 10000),
  max_attempts_per_phone_day integer not null default 2 check (max_attempts_per_phone_day between 1 and 10),
  max_attempts_per_phone_hour integer not null default 1 check (max_attempts_per_phone_hour between 1 and 3),
  constraint sms_policy_activation_chk check (
    not enabled or (
      provider_id is not null and fa_template_id is not null and en_template_id is not null
      and fa_terms_hash is not null and en_terms_hash is not null
      and fa_terms_hash <> en_terms_hash
    )
  )
);
insert into public.sms_delivery_policy (id, enabled) values ('primary', false);

-- Exactly one request_received event per stored request. No arbitrary receiver
-- or message body can be enqueued through an RPC. Phone/name/note are not copied.
create table public.sms_outbox (
  request_id uuid primary key references public.requests(id) on delete cascade,
  provider_id text not null check (provider_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  template_id text not null check (template_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  locale text not null check (locale in ('fa', 'en')),
  state text not null default 'pending' check (
    state in ('pending','sending','accepted','failed','uncertain','expired','cancelled')
  ),
  attempt integer not null default 0 check (attempt between 0 and 3),
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  provider_receipt text check (provider_receipt ~ '^[A-Za-z0-9._:-]{1,128}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint sms_outbox_expiry_chk check (expires_at = created_at + interval '24 hours'),
  constraint sms_outbox_state_chk check (
    (state = 'pending' and attempt between 0 and 2 and next_attempt_at is not null
      and lease_token is null and lease_until is null and provider_receipt is null)
    or (state = 'sending' and attempt between 1 and 3 and next_attempt_at is null
      and lease_token is not null and lease_until is not null and provider_receipt is null)
    or (state = 'accepted' and attempt between 1 and 3 and provider_receipt is not null
      and next_attempt_at is null and lease_token is null and lease_until is null)
    or (state in ('failed','uncertain','expired','cancelled') and provider_receipt is null
      and next_attempt_at is null and lease_token is null and lease_until is null)
  )
);
create index sms_outbox_due_idx on public.sms_outbox (next_attempt_at, request_id) where state = 'pending';
create index sms_outbox_lease_idx on public.sms_outbox (lease_until) where state = 'sending';

-- Reservations count against the budget even if a worker dies before sending.
-- No recipient, text, provider response body or credential is stored here.
create table public.sms_delivery_attempts (
  request_id uuid not null references public.sms_outbox(request_id) on delete cascade,
  attempt integer not null check (attempt between 1 and 3),
  reserved_at timestamptz not null default now(),
  primary key (request_id, attempt)
);
create index sms_delivery_attempts_budget_idx on public.sms_delivery_attempts (reserved_at);

alter table public.sms_delivery_policy enable row level security;
alter table public.sms_delivery_policy force row level security;
alter table public.sms_outbox enable row level security;
alter table public.sms_outbox force row level security;
alter table public.sms_delivery_attempts enable row level security;
alter table public.sms_delivery_attempts force row level security;
revoke all on table public.sms_delivery_policy, public.sms_outbox, public.sms_delivery_attempts
  from public, anon, authenticated, service_role;

create function public.enqueue_request_receipt_sms()
returns trigger language plpgsql security definer
set search_path = pg_catalog
set statement_timeout to '5s'
set lock_timeout to '3s'
as $$
declare
  v_policy public.sms_delivery_policy%rowtype;
  v_locale text;
  v_template text;
begin
  select p.* into v_policy from public.sms_delivery_policy p where p.id = 'primary' for share;
  if not found or v_policy.enabled is distinct from true
     or new.bot_verification <> 'verified' or new.anonymized_at is not null
     or new.status = 'spam' or new.phone_normalized is null
     or new.phone_normalized !~ '^\+989[0-9]{9}$' then
    return new;
  end if;
  -- Accepted Terms document hash is authoritative locale metadata, not a
  -- browser-provided phone locale. Unknown releases fail closed for SMS only.
  if new.terms_content_hash = v_policy.fa_terms_hash then
    v_locale := 'fa'; v_template := v_policy.fa_template_id;
  elsif new.terms_content_hash = v_policy.en_terms_hash then
    v_locale := 'en'; v_template := v_policy.en_template_id;
  else
    return new;
  end if;
  insert into public.sms_outbox (
    request_id, provider_id, template_id, locale, next_attempt_at, created_at, expires_at
  ) values (
    new.id, v_policy.provider_id, v_template, v_locale, new.created_at,
    new.created_at, new.created_at + interval '24 hours'
  ) on conflict (request_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_request_receipt_sms() from public, anon, authenticated, service_role;
create trigger requests_enqueue_receipt_sms after insert on public.requests
  for each row execute function public.enqueue_request_receipt_sms();

create function public.claim_sms_notifications(p_provider_id text, p_limit integer default 5, p_request_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
set statement_timeout to '5s'
set lock_timeout to '3s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_policy public.sms_delivery_policy%rowtype;
  v_row record;
  v_day_count integer;
  v_phone_day integer;
  v_phone_hour integer;
  v_phone_last timestamptz;
  v_phone_next timestamptz;
  v_token uuid;
  v_items jsonb := '[]'::jsonb;
begin
  if p_provider_id is null or p_provider_id !~ '^[a-z][a-z0-9_-]{1,39}$'
     or p_limit is null or p_limit not between 1 and 5 then
    return jsonb_build_object('code', 'INVALID');
  end if;
  -- All reservations take this same short transaction lock: concurrent jobs
  -- cannot exceed the global or phone budget. Network I/O happens after commit.
  select p.* into v_policy from public.sms_delivery_policy p where p.id = 'primary' for update;
  if not found or v_policy.enabled is distinct from true or v_policy.provider_id <> p_provider_id then
    return jsonb_build_object('code', 'DISABLED', 'items', v_items);
  end if;
  -- A lost response or expired worker lease might already have sent a message.
  -- Never turn an expired sending lease into an automatic resend.
  update public.sms_outbox set state = 'uncertain', lease_token = null, lease_until = null
    where state = 'sending' and lease_until <= v_now;
  update public.sms_outbox set state = 'expired', next_attempt_at = null
    where state = 'pending' and expires_at <= v_now;
  update public.sms_outbox o set state = 'cancelled', next_attempt_at = null
    from public.requests r where o.request_id = r.id and o.state = 'pending'
      and (r.anonymized_at is not null or r.phone_normalized is null or r.status = 'spam');
  select count(*)::integer into v_day_count from public.sms_delivery_attempts a
    where a.reserved_at > v_now - interval '24 hours';
  if v_day_count >= v_policy.max_attempts_per_day then
    return jsonb_build_object('code', 'CLAIMED', 'items', v_items);
  end if;
  for v_row in
    select o.*, r.phone_normalized
      from public.sms_outbox o join public.requests r on r.id = o.request_id
     where o.state = 'pending' and o.next_attempt_at <= v_now and o.expires_at > v_now
       and o.provider_id = p_provider_id
       and o.template_id = case o.locale when 'fa' then v_policy.fa_template_id else v_policy.en_template_id end
       and (p_request_id is null or o.request_id = p_request_id)
     order by o.next_attempt_at, o.request_id
     limit 100 for update of o skip locked
  loop
    exit when jsonb_array_length(v_items) >= (case when p_request_id is null then p_limit else 1 end)
      or v_day_count >= v_policy.max_attempts_per_day;
    select count(*) filter (where a.reserved_at > v_now - interval '24 hours')::integer,
           count(*) filter (where a.reserved_at > v_now - interval '1 hour')::integer,
           max(a.reserved_at)
      into v_phone_day, v_phone_hour, v_phone_last
      from public.sms_delivery_attempts a join public.requests r on r.id = a.request_id
     where r.phone_normalized = v_row.phone_normalized and a.reserved_at > v_now - interval '24 hours';
    if v_phone_day >= v_policy.max_attempts_per_phone_day or v_phone_hour >= v_policy.max_attempts_per_phone_hour then
      -- Move quota-blocked rows out of the due scan so repeated jobs for one
      -- phone cannot starve unrelated recipients behind the bounded 100 scan.
      v_phone_next := v_phone_last + case when v_phone_day >= v_policy.max_attempts_per_phone_day
        then interval '24 hours' else interval '1 hour' end;
      update public.sms_outbox set
        state = case when v_phone_next >= expires_at then 'expired' else 'pending' end,
        next_attempt_at = case when v_phone_next >= expires_at then null else v_phone_next end
        where request_id = v_row.request_id;
      continue;
    end if;
    v_token := gen_random_uuid();
    update public.sms_outbox set state = 'sending', attempt = attempt + 1,
      next_attempt_at = null, lease_token = v_token, lease_until = v_now + interval '2 minutes'
      where request_id = v_row.request_id;
    insert into public.sms_delivery_attempts(request_id, attempt, reserved_at)
      values (v_row.request_id, v_row.attempt + 1, v_now);
    v_day_count := v_day_count + 1;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'request_id', v_row.request_id, 'provider_id', v_row.provider_id,
      'template_id', v_row.template_id, 'locale', v_row.locale, 'attempt', v_row.attempt + 1,
      'lease_token', v_token, 'lease_until', v_now + interval '2 minutes'
    ));
  end loop;
  return jsonb_build_object('code', 'CLAIMED', 'items', v_items);
end;
$$;

create function public.authorize_sms_attempt(p_request_id uuid, p_attempt integer, p_lease_token uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
set statement_timeout to '5s'
set lock_timeout to '3s'
as $$
declare
  v_policy public.sms_delivery_policy%rowtype;
  v_job public.sms_outbox%rowtype;
  v_request public.requests%rowtype;
begin
  select p.* into v_policy from public.sms_delivery_policy p where p.id = 'primary' for share;
  select o.* into v_job from public.sms_outbox o where o.request_id = p_request_id for update;
  if not found or v_job.state <> 'sending' or v_job.attempt is distinct from p_attempt
     or v_job.lease_token is distinct from p_lease_token or v_job.lease_until <= clock_timestamp() then
    return jsonb_build_object('code', 'STALE');
  end if;
  if v_job.expires_at <= clock_timestamp() then
    update public.sms_outbox set state = 'expired', lease_token = null, lease_until = null where request_id = p_request_id;
    return jsonb_build_object('code', 'CANCELLED');
  end if;
  select r.* into v_request from public.requests r where r.id = p_request_id;
  if v_policy.enabled is distinct from true or v_policy.provider_id is distinct from v_job.provider_id
     or v_job.template_id is distinct from (case v_job.locale when 'fa' then v_policy.fa_template_id else v_policy.en_template_id end)
     or v_request.anonymized_at is not null or v_request.status = 'spam'
     or v_request.phone_normalized is null or v_request.phone_normalized !~ '^\+989[0-9]{9}$' then
    update public.sms_outbox set state = 'cancelled', lease_token = null, lease_until = null where request_id = p_request_id;
    return jsonb_build_object('code', 'CANCELLED');
  end if;
  return jsonb_build_object('code', 'SEND_ALLOWED', 'phone', v_request.phone_normalized, 'tracking_code', v_request.tracking_code);
end;
$$;

create function public.complete_sms_notification(
  p_request_id uuid, p_attempt integer, p_lease_token uuid, p_outcome text,
  p_provider_receipt text default null, p_retry_after_seconds integer default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
set statement_timeout to '5s'
set lock_timeout to '3s'
as $$
declare
  v_job public.sms_outbox%rowtype;
  v_next timestamptz;
  v_state text;
  v_now timestamptz := clock_timestamp();
begin
  if p_outcome is null or p_outcome not in ('accepted','retryable','permanent_failure','uncertain')
     or p_attempt is null or p_attempt not between 1 and 3 or p_lease_token is null
     or (p_outcome = 'accepted' and (p_provider_receipt is null or p_provider_receipt !~ '^[A-Za-z0-9._:-]{1,128}$'))
     or (p_outcome <> 'accepted' and p_provider_receipt is not null)
     or (p_retry_after_seconds is not null and (p_outcome <> 'retryable' or p_retry_after_seconds not between 1 and 86400)) then
    return jsonb_build_object('code', 'INVALID');
  end if;
  select o.* into v_job from public.sms_outbox o where o.request_id = p_request_id for update;
  if not found or v_job.state <> 'sending' or v_job.attempt <> p_attempt
     or v_job.lease_token is distinct from p_lease_token or v_job.lease_until <= v_now then
    return jsonb_build_object('code', 'STALE');
  end if;
  if p_outcome = 'retryable' then
    v_next := v_now + make_interval(secs => greatest(case p_attempt when 1 then 300 else 1800 end, coalesce(p_retry_after_seconds, 0)));
    v_state := case when p_attempt >= 3 then 'failed' when v_next >= v_job.expires_at then 'expired' else 'pending' end;
  else
    v_state := case p_outcome when 'permanent_failure' then 'failed' else p_outcome end;
  end if;
  update public.sms_outbox set state = v_state,
    next_attempt_at = case when v_state = 'pending' then v_next else null end,
    lease_token = null, lease_until = null, provider_receipt = p_provider_receipt
    where request_id = p_request_id;
  return jsonb_build_object('code', case when v_state = 'pending' then 'RETRY_SCHEDULED' else upper(v_state) end);
end;
$$;

revoke all on function public.claim_sms_notifications(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.authorize_sms_attempt(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_sms_notification(uuid, integer, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_sms_notifications(text, integer, uuid) to service_role;
grant execute on function public.authorize_sms_attempt(uuid, integer, uuid) to service_role;
grant execute on function public.complete_sms_notification(uuid, integer, uuid, text, text, integer) to service_role;
