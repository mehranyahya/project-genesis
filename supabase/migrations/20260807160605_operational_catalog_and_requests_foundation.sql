-- Project Genesis / Mehrara integration foundation.
-- Operational catalog is Supabase-backed behind repository adapters.
-- Guides/legal remain Git-versioned. Media rows reference neutral media keys;
-- physical media remains outside the database in V1.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.touch_updated_at() to service_role;

create table public.products (
  id text primary key,
  code text not null unique,
  slug text not null unique,
  product_type text not null,
  title text not null,
  summary text null,
  description text null,
  is_active boolean not null default false,
  is_featured boolean not null default false,
  seo_title text null,
  seo_description text null,
  seo_canonical_path text null,
  seo_robots text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_id_chk check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  constraint products_code_chk check (char_length(btrim(code)) between 1 and 80 and code = btrim(code)),
  constraint products_slug_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint products_type_chk check (product_type in ('simple','cnc_box')),
  constraint products_title_chk check (char_length(btrim(title)) between 1 and 160 and title = btrim(title)),
  constraint products_sort_chk check (sort_order between -1000000 and 1000000)
);

create table public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  stone_code text not null,
  size_code text not null,
  price_type text not null,
  amount_toman bigint null,
  price_updated_at timestamptz null,
  includes text[] not null default '{}'::text[],
  excludes text[] not null default '{}'::text[],
  is_available boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_id_chk check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  constraint product_variants_stone_chk check (char_length(btrim(stone_code)) between 1 and 80 and stone_code = btrim(stone_code)),
  constraint product_variants_size_chk check (size_code in ('120x60','160x60','180x60','custom')),
  constraint product_variants_price_type_chk check (price_type in ('fixed','estimate','review')),
  constraint product_variants_amount_chk check (
    (price_type in ('fixed','estimate') and amount_toman is not null and amount_toman > 0)
    or (price_type = 'review' and amount_toman is null)
  ),
  constraint product_variants_price_time_chk check (
    (amount_toman is null and price_updated_at is null)
    or (amount_toman is not null and price_updated_at is not null)
  ),
  constraint product_variants_sort_chk check (sort_order between -1000000 and 1000000),
  unique (product_id, stone_code, size_code)
);

create table public.product_options (
  id text primary key,
  variant_id text not null references public.product_variants(id) on delete cascade,
  title text not null,
  price_type text not null,
  amount_toman bigint null,
  price_updated_at timestamptz null,
  is_available boolean not null default false,
  compatible_size_codes text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_options_id_chk check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  constraint product_options_title_chk check (char_length(btrim(title)) between 1 and 160 and title = btrim(title)),
  constraint product_options_price_type_chk check (price_type in ('fixed','estimate','review')),
  constraint product_options_amount_chk check (
    (price_type in ('fixed','estimate') and amount_toman is not null and amount_toman > 0)
    or (price_type = 'review' and amount_toman is null)
  ),
  constraint product_options_price_time_chk check (
    (amount_toman is null and price_updated_at is null)
    or (amount_toman is not null and price_updated_at is not null)
  ),
  constraint product_options_sizes_chk check (
    compatible_size_codes <@ array['120x60','160x60','180x60','custom']::text[]
  ),
  constraint product_options_sort_chk check (sort_order between -1000000 and 1000000),
  unique (variant_id, id)
);

create table public.product_media (
  product_id text not null references public.products(id) on delete cascade,
  media_key text not null,
  alt text not null,
  caption text null,
  privacy_cleared boolean not null default false,
  consent_reference text null,
  width integer null,
  height integer null,
  sort_order integer not null default 0,
  primary key (product_id, media_key),
  constraint product_media_key_chk check (char_length(btrim(media_key)) between 1 and 240 and media_key = btrim(media_key)),
  constraint product_media_alt_chk check (char_length(btrim(alt)) between 1 and 300 and alt = btrim(alt)),
  constraint product_media_consent_chk check (consent_reference is null or char_length(btrim(consent_reference)) between 1 and 200),
  constraint product_media_dimensions_chk check ((width is null and height is null) or (width > 0 and height > 0)),
  constraint product_media_sort_chk check (sort_order between -1000000 and 1000000)
);

create index products_active_sort_idx on public.products (is_active, sort_order, updated_at desc);
create index products_featured_idx on public.products (is_featured, is_active, sort_order);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);
create index product_variants_available_idx on public.product_variants (is_available, size_code, product_id);
create index product_options_variant_idx on public.product_options (variant_id, sort_order);

create table public.building_stone_items (
  id text primary key,
  code text not null unique,
  slug text not null unique,
  title text not null,
  stone_type_code text not null,
  summary text null,
  applications text[] not null default '{}'::text[],
  is_active boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint building_stone_items_id_chk check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  constraint building_stone_items_code_chk check (char_length(btrim(code)) between 1 and 80 and code = btrim(code)),
  constraint building_stone_items_slug_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint building_stone_items_type_chk check (stone_type_code in ('marble','granite','travertine','crystal')),
  constraint building_stone_items_apps_chk check (applications <@ array['facade','flooring','stairs','interior_wall','countertop','other']::text[]),
  constraint building_stone_items_title_chk check (char_length(btrim(title)) between 1 and 160 and title = btrim(title)),
  constraint building_stone_items_sort_chk check (sort_order between -1000000 and 1000000)
);

create table public.building_stone_media (
  item_id text not null references public.building_stone_items(id) on delete cascade,
  media_key text not null,
  alt text not null,
  caption text null,
  privacy_cleared boolean not null default false,
  consent_reference text null,
  width integer null,
  height integer null,
  sort_order integer not null default 0,
  primary key (item_id, media_key),
  constraint building_stone_media_key_chk check (char_length(btrim(media_key)) between 1 and 240 and media_key = btrim(media_key)),
  constraint building_stone_media_alt_chk check (char_length(btrim(alt)) between 1 and 300 and alt = btrim(alt)),
  constraint building_stone_media_dimensions_chk check ((width is null and height is null) or (width > 0 and height > 0)),
  constraint building_stone_media_sort_chk check (sort_order between -1000000 and 1000000)
);

create index building_stone_active_sort_idx on public.building_stone_items (is_active, sort_order, updated_at desc);

create table public.portfolio_items (
  public_reference_id text primary key,
  stone_code text null,
  size_code text null,
  summary text null,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_reference_chk check (public_reference_id ~ '^pf-[0-9]{4,}$'),
  constraint portfolio_size_chk check (size_code is null or size_code in ('120x60','160x60','180x60','custom')),
  constraint portfolio_sort_chk check (sort_order between -1000000 and 1000000)
);

create table public.portfolio_media (
  public_reference_id text not null references public.portfolio_items(public_reference_id) on delete cascade,
  media_key text not null,
  alt text not null,
  caption text null,
  privacy_cleared boolean not null default false,
  consent_reference text null,
  width integer null,
  height integer null,
  sort_order integer not null default 0,
  primary key (public_reference_id, media_key),
  constraint portfolio_media_key_chk check (char_length(btrim(media_key)) between 1 and 240 and media_key = btrim(media_key)),
  constraint portfolio_media_alt_chk check (char_length(btrim(alt)) between 1 and 300 and alt = btrim(alt)),
  constraint portfolio_media_privacy_chk check (privacy_cleared = true),
  constraint portfolio_media_dimensions_chk check ((width is null and height is null) or (width > 0 and height > 0)),
  constraint portfolio_media_sort_chk check (sort_order between -1000000 and 1000000)
);

create index portfolio_active_sort_idx on public.portfolio_items (is_active, sort_order, updated_at desc);

create table public.site_settings (
  id text primary key default 'primary',
  display_name text not null,
  latin_name text not null,
  phone text null,
  whatsapp text null,
  telegram text null,
  address text null,
  working_hours text null,
  instagram_url text null,
  website_url text null,
  map_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton_chk check (id = 'primary'),
  constraint site_settings_display_name_chk check (char_length(btrim(display_name)) between 1 and 120 and display_name = btrim(display_name)),
  constraint site_settings_latin_name_chk check (char_length(btrim(latin_name)) between 1 and 120 and latin_name = btrim(latin_name)),
  constraint site_settings_phone_chk check (phone is null or phone ~ '^\+?[0-9]{8,16}$'),
  constraint site_settings_whatsapp_chk check (whatsapp is null or whatsapp ~ '^\+?[0-9]{8,16}$')
);

create or replace function public.compute_operational_catalog_version()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(
        coalesce((
          select jsonb_build_object(
            'schemaVersion', 1,
            'products', coalesce(jsonb_agg(product_doc order by product_doc->>'id'), '[]'::jsonb)
          )::text
          from (
            select jsonb_build_object(
              'id', p.id,
              'code', p.code,
              'slug', p.slug,
              'type', p.product_type,
              'isActive', p.is_active,
              'variants', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', v.id,
                    'stoneCode', v.stone_code,
                    'sizeCode', v.size_code,
                    'priceType', v.price_type,
                    'amountToman', v.amount_toman,
                    'priceUpdatedAt', v.price_updated_at,
                    'includes', to_jsonb(v.includes),
                    'excludes', to_jsonb(v.excludes),
                    'isAvailable', v.is_available,
                    'options', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'id', o.id,
                          'title', o.title,
                          'priceType', o.price_type,
                          'amountToman', o.amount_toman,
                          'priceUpdatedAt', o.price_updated_at,
                          'isAvailable', o.is_available,
                          'compatibleSizeCodes', to_jsonb(o.compatible_size_codes)
                        ) order by o.sort_order, o.id
                      ) from public.product_options o where o.variant_id = v.id
                    ), '[]'::jsonb)
                  ) order by v.sort_order, v.id
                ) from public.product_variants v where v.product_id = p.id
              ), '[]'::jsonb)
            ) as product_doc
            from public.products p
          ) catalog_rows
        ), '{"schemaVersion":1,"products":[]}'::text),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.compute_operational_catalog_version() from public, anon, authenticated;
grant execute on function public.compute_operational_catalog_version() to service_role;

create sequence public.request_code_seq start with 1001 increment by 1 minvalue 1001 no maxvalue no cycle cache 1;

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique not null,
  request_fingerprint text null,
  request_fingerprint_key_id text null,
  idempotency_expires_at timestamptz not null default (now() + interval '24 hours'),
  tracking_code text unique not null,
  request_type text not null,
  client_catalog_version text null,
  server_catalog_version text null,
  configuration_snapshot jsonb not null,
  price_snapshot jsonb null,
  customer_name text null,
  phone_normalized varchar(16) null,
  city text null,
  location_text text null,
  preferred_contact text null,
  preferred_contact_time text null,
  customer_note text null,
  terms_version text not null,
  terms_content_hash text not null,
  terms_accepted_at timestamptz not null,
  status text not null default 'new',
  telegram_status text not null default 'pending',
  telegram_attempt_count integer not null default 0,
  telegram_last_attempt_at timestamptz null,
  telegram_next_attempt_at timestamptz null default now(),
  telegram_lease_until timestamptz null,
  telegram_failed_at timestamptz null,
  telegram_alerted_at timestamptz null,
  bot_verification text not null,
  needs_review boolean not null default false,
  risk_flags jsonb not null default '[]'::jsonb,
  ip_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  next_review_at timestamptz null,
  review_set_at timestamptz null,
  closed_at timestamptz null,
  anonymized_at timestamptz null,
  constraint requests_request_type_chk check (request_type in ('grave_stone','building_stone','contact')),
  constraint requests_status_chk check (status in ('new','contacted','closed','spam')),
  constraint requests_telegram_status_chk check (telegram_status in ('pending','sending','sent','failed')),
  constraint requests_bot_verification_chk check (bot_verification in ('verified','unverified_no_token','unverified_service_error')),
  constraint requests_preferred_contact_chk check (preferred_contact is null or preferred_contact in ('phone','whatsapp','telegram')),
  constraint requests_telegram_attempt_chk check (telegram_attempt_count between 0 and 5),
  constraint requests_json_types_chk check (
    jsonb_typeof(configuration_snapshot) = 'object'
    and (price_snapshot is null or jsonb_typeof(price_snapshot) = 'object')
    and jsonb_typeof(risk_flags) = 'array'
    and configuration_snapshot ?& array['content_schema_version','tracking_code_prefix']
    and jsonb_typeof(configuration_snapshot->'content_schema_version') = 'number'
    and (configuration_snapshot->>'content_schema_version') ~ '^[1-9][0-9]*$'
    and jsonb_typeof(configuration_snapshot->'tracking_code_prefix') = 'string'
    and (configuration_snapshot->>'tracking_code_prefix') ~ '^[A-Z][A-Z0-9]{1,9}$'
    and risk_flags <@ '["shared_ip_volume","turnstile_no_token","turnstile_unavailable","fast_submit_signal","repeat_phone_short_window"]'::jsonb
  ),
  constraint requests_bot_risk_state_chk check (
    (bot_verification = 'verified' and not (risk_flags ?| array['turnstile_no_token','turnstile_unavailable']))
    or (bot_verification = 'unverified_no_token' and needs_review = true and risk_flags ? 'turnstile_no_token' and not (risk_flags ? 'turnstile_unavailable'))
    or (bot_verification = 'unverified_service_error' and needs_review = true and risk_flags ? 'turnstile_unavailable' and not (risk_flags ? 'turnstile_no_token'))
  ),
  constraint requests_hashes_chk check (
    (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$')
    and ((request_fingerprint is null) = (request_fingerprint_key_id is null))
    and (request_fingerprint_key_id is null or request_fingerprint_key_id ~ '^[A-Za-z0-9._-]{1,64}$')
    and terms_content_hash ~ '^[0-9a-f]{64}$'
    and (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint requests_catalog_versions_chk check ((client_catalog_version is null or client_catalog_version ~ '^[0-9a-f]{64}$') and (server_catalog_version is null or server_catalog_version ~ '^[0-9a-f]{64}$')),
  constraint requests_tracking_code_chk check (tracking_code ~ '^[A-Z][A-Z0-9]{1,9}-[0-9]{4,}$'),
  constraint requests_phone_chk check (phone_normalized is null or phone_normalized ~ '^\+989[0-9]{9}$'),
  constraint requests_identity_state_chk check ((anonymized_at is null and customer_name is not null and phone_normalized is not null) or (anonymized_at is not null and customer_name is null and phone_normalized is null and city is null and location_text is null and preferred_contact is null and preferred_contact_time is null and customer_note is null and request_fingerprint is null and request_fingerprint_key_id is null and ip_hash is null)),
  constraint requests_grave_stone_required_chk check (
    anonymized_at is not null or request_type <> 'grave_stone' or (
      client_catalog_version is not null and server_catalog_version is not null and city is not null and location_text is not null and preferred_contact is not null and price_snapshot is not null
      and configuration_snapshot ?& array['product_id','variant_id','selected_option_ids']
      and jsonb_typeof(configuration_snapshot->'product_id') = 'string' and jsonb_typeof(configuration_snapshot->'variant_id') = 'string' and jsonb_typeof(configuration_snapshot->'selected_option_ids') = 'array'
      and char_length(btrim(configuration_snapshot->>'product_id')) between 1 and 120 and char_length(btrim(configuration_snapshot->>'variant_id')) between 1 and 120
      and price_snapshot ?& array['client_displayed_price','server_calculated_price','price_type','includes','excludes','calculated_at']
      and jsonb_typeof(price_snapshot->'client_displayed_price') in ('number','null') and jsonb_typeof(price_snapshot->'server_calculated_price') in ('number','null') and jsonb_typeof(price_snapshot->'price_type')='string'
      and price_snapshot->>'price_type' in ('fixed','estimate','review')
      and case price_snapshot->>'price_type'
        when 'fixed' then jsonb_typeof(price_snapshot->'client_displayed_price')='number' and jsonb_typeof(price_snapshot->'server_calculated_price')='number' and (price_snapshot->>'client_displayed_price')~'^[0-9]+$' and (price_snapshot->>'server_calculated_price')~'^[0-9]+$' and (price_snapshot->>'client_displayed_price')::numeric>0 and (price_snapshot->>'server_calculated_price')::numeric>0 and price_snapshot->>'client_displayed_price'=price_snapshot->>'server_calculated_price'
        when 'estimate' then jsonb_typeof(price_snapshot->'client_displayed_price')='number' and jsonb_typeof(price_snapshot->'server_calculated_price')='number' and (price_snapshot->>'client_displayed_price')~'^[0-9]+$' and (price_snapshot->>'server_calculated_price')~'^[0-9]+$' and (price_snapshot->>'client_displayed_price')::numeric>0 and (price_snapshot->>'server_calculated_price')::numeric>0 and price_snapshot->>'client_displayed_price'=price_snapshot->>'server_calculated_price'
        when 'review' then jsonb_typeof(price_snapshot->'client_displayed_price')='null' and jsonb_typeof(price_snapshot->'server_calculated_price')='null'
        else false end
      and jsonb_typeof(price_snapshot->'includes')='array' and jsonb_typeof(price_snapshot->'excludes')='array' and jsonb_typeof(price_snapshot->'calculated_at')='string'
    )
  ),
  constraint requests_building_stone_required_chk check (
    anonymized_at is not null or request_type <> 'building_stone' or (
      city is not null and preferred_contact is not null and needs_review=true
      and configuration_snapshot ?& array['stone_type_code','application','shipping_required']
      and jsonb_typeof(configuration_snapshot->'stone_type_code')='string' and jsonb_typeof(configuration_snapshot->'application')='string' and jsonb_typeof(configuration_snapshot->'shipping_required')='boolean'
      and configuration_snapshot->>'stone_type_code' in ('marble','granite','travertine','crystal') and configuration_snapshot->>'application' in ('facade','flooring','stairs','interior_wall','countertop','other') and not(configuration_snapshot?'area_estimate')
      and (not(configuration_snapshot?'area_m2') or (jsonb_typeof(configuration_snapshot->'area_m2')='number' and (configuration_snapshot->>'area_m2')::numeric>0 and (configuration_snapshot->>'area_m2')::numeric<=100000))
      and (configuration_snapshot->>'application'<>'other' or (customer_note is not null and char_length(btrim(customer_note)) between 10 and 500))
      and price_snapshot is not null and price_snapshot ?& array['client_displayed_price','server_calculated_price','price_type','includes','excludes','calculated_at']
      and jsonb_typeof(price_snapshot->'client_displayed_price')='null' and jsonb_typeof(price_snapshot->'server_calculated_price')='null' and price_snapshot->>'price_type'='review' and jsonb_typeof(price_snapshot->'includes')='array' and jsonb_typeof(price_snapshot->'excludes')='array' and jsonb_typeof(price_snapshot->'calculated_at')='string'
    )
  ),
  constraint requests_contact_required_chk check (anonymized_at is not null or request_type <> 'contact' or (preferred_contact is not null and price_snapshot is null)),
  constraint requests_review_flag_chk check (price_snapshot is null or price_snapshot->>'price_type' <> 'review' or needs_review=true),
  constraint requests_referral_source_chk check ((not(configuration_snapshot?'source_type') and not(configuration_snapshot?'portfolio_reference_id')) or (request_type='contact' and configuration_snapshot ?& array['source_type','portfolio_reference_id'] and configuration_snapshot->>'source_type'='portfolio' and configuration_snapshot->>'portfolio_reference_id' ~ '^pf-[0-9]{4,}$')),
  constraint requests_name_len_chk check (customer_name is null or char_length(customer_name) between 2 and 80),
  constraint requests_city_len_chk check (city is null or char_length(city) between 1 and 50),
  constraint requests_location_len_chk check (location_text is null or char_length(location_text) between 1 and 200),
  constraint requests_contact_time_len_chk check (preferred_contact_time is null or char_length(preferred_contact_time) between 1 and 100),
  constraint requests_contact_time_parent_chk check (preferred_contact_time is null or preferred_contact is not null),
  constraint requests_note_len_chk check (customer_note is null or char_length(customer_note) between 1 and 1000),
  constraint requests_terms_version_len_chk check (char_length(terms_version) between 1 and 80),
  constraint requests_text_trim_chk check ((customer_name is null or customer_name=btrim(customer_name)) and (city is null or city=btrim(city)) and (location_text is null or location_text=btrim(location_text)) and (preferred_contact_time is null or preferred_contact_time=btrim(preferred_contact_time)) and (customer_note is null or customer_note=btrim(customer_note)) and terms_version=btrim(terms_version)),
  constraint requests_time_order_chk check (updated_at>=status_changed_at and status_changed_at>=created_at and idempotency_expires_at=created_at+interval '24 hours' and (telegram_last_attempt_at is null or telegram_last_attempt_at>=created_at) and (telegram_next_attempt_at is null or telegram_next_attempt_at>=created_at) and (telegram_lease_until is null or telegram_lease_until=telegram_last_attempt_at+interval '2 minutes') and (telegram_failed_at is null or telegram_failed_at>=telegram_last_attempt_at)),
  constraint requests_review_schedule_chk check ((status='contacted' and next_review_at is not null and review_set_at is not null and next_review_at>=review_set_at+interval '1 hour' and next_review_at<=review_set_at+interval '30 days') or (status<>'contacted' and next_review_at is null and review_set_at is null)),
  constraint requests_closed_at_chk check (((status in ('closed','spam'))=(closed_at is not null)) and (closed_at is null or closed_at>=created_at)),
  constraint requests_anonymized_after_closed_chk check (anonymized_at is null or (closed_at is not null and anonymized_at>=closed_at))
);

create index requests_phone_type_created_idx on public.requests (phone_normalized,request_type,created_at desc);
create index requests_status_created_idx on public.requests (status,created_at desc);
create index requests_review_idx on public.requests (status,next_review_at,review_set_at);
create index requests_telegram_status_created_idx on public.requests (status,telegram_status,created_at desc);
create index requests_telegram_pending_idx on public.requests (telegram_status,telegram_next_attempt_at) where telegram_status='pending';
create index requests_telegram_sending_idx on public.requests (telegram_status,telegram_lease_until) where telegram_status='sending';
create index requests_closed_idx on public.requests (closed_at) where anonymized_at is null;
create index requests_telegram_failed_idx on public.requests (telegram_status,telegram_alerted_at,created_at) where telegram_status='failed';
create index requests_idempotency_expiry_idx on public.requests (idempotency_expires_at) where request_fingerprint is not null;

create or replace function public.requests_before_update()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  new.updated_at:=now();
  if new.status is distinct from old.status then
    new.status_changed_at:=now();
    if new.status in ('closed','spam') and new.closed_at is null then new.closed_at:=now();
    elsif new.status in ('new','contacted') then new.closed_at:=null; end if;
  end if;
  if new.status<>'contacted' then new.next_review_at:=null; new.review_set_at:=null;
  elsif new.next_review_at is distinct from old.next_review_at then new.review_set_at:=now(); end if;
  return new;
end; $$;
revoke all on function public.requests_before_update() from public,anon,authenticated;
grant execute on function public.requests_before_update() to service_role;

create trigger products_touch_updated_at before update on public.products for each row execute function public.touch_updated_at();
create trigger product_variants_touch_updated_at before update on public.product_variants for each row execute function public.touch_updated_at();
create trigger product_options_touch_updated_at before update on public.product_options for each row execute function public.touch_updated_at();
create trigger building_stone_items_touch_updated_at before update on public.building_stone_items for each row execute function public.touch_updated_at();
create trigger portfolio_items_touch_updated_at before update on public.portfolio_items for each row execute function public.touch_updated_at();
create trigger site_settings_touch_updated_at before update on public.site_settings for each row execute function public.touch_updated_at();
create trigger requests_before_update_trigger before update on public.requests for each row execute function public.requests_before_update();

alter table public.products enable row level security; alter table public.products force row level security;
alter table public.product_variants enable row level security; alter table public.product_variants force row level security;
alter table public.product_options enable row level security; alter table public.product_options force row level security;
alter table public.product_media enable row level security; alter table public.product_media force row level security;
alter table public.building_stone_items enable row level security; alter table public.building_stone_items force row level security;
alter table public.building_stone_media enable row level security; alter table public.building_stone_media force row level security;
alter table public.portfolio_items enable row level security; alter table public.portfolio_items force row level security;
alter table public.portfolio_media enable row level security; alter table public.portfolio_media force row level security;
alter table public.site_settings enable row level security; alter table public.site_settings force row level security;
alter table public.requests enable row level security; alter table public.requests force row level security;

revoke all on table public.products,public.product_variants,public.product_options,public.product_media,public.building_stone_items,public.building_stone_media,public.portfolio_items,public.portfolio_media,public.site_settings,public.requests from public,anon,authenticated;
revoke all on sequence public.request_code_seq from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke all on sequences from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
grant select,insert,update,delete on table public.products,public.product_variants,public.product_options,public.product_media,public.building_stone_items,public.building_stone_media,public.portfolio_items,public.portfolio_media,public.site_settings to service_role;
grant select,insert,update,delete on table public.requests to service_role;
grant usage,select on sequence public.request_code_seq to service_role;
