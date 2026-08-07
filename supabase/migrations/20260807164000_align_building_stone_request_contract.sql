-- Align the persisted building-stone request constraint with the current
-- frontend payload contract. City is optional for building-stone requests,
-- there is no shipping_required field, and area_m2 is always present as either
-- a positive number <= 100000 or JSON null.

alter table public.requests
  drop constraint requests_building_stone_required_chk;

alter table public.requests
  add constraint requests_building_stone_required_chk check (
    anonymized_at is not null
    or request_type <> 'building_stone'
    or (
      preferred_contact is not null
      and needs_review = true
      and configuration_snapshot ?& array['stone_type_code','application','area_m2']
      and jsonb_typeof(configuration_snapshot->'stone_type_code') = 'string'
      and jsonb_typeof(configuration_snapshot->'application') = 'string'
      and configuration_snapshot->>'stone_type_code' in ('marble','granite','travertine','crystal')
      and configuration_snapshot->>'application' in ('facade','flooring','stairs','interior_wall','countertop','other')
      and not (configuration_snapshot ? 'shipping_required')
      and not (configuration_snapshot ? 'area_estimate')
      and (
        jsonb_typeof(configuration_snapshot->'area_m2') = 'null'
        or (
          jsonb_typeof(configuration_snapshot->'area_m2') = 'number'
          and (configuration_snapshot->>'area_m2')::numeric > 0
          and (configuration_snapshot->>'area_m2')::numeric <= 100000
        )
      )
      and (
        configuration_snapshot->>'application' <> 'other'
        or (
          customer_note is not null
          and char_length(btrim(customer_note)) between 10 and 500
        )
      )
      and price_snapshot is not null
      and price_snapshot ?& array[
        'client_displayed_price',
        'server_calculated_price',
        'price_type',
        'includes',
        'excludes',
        'calculated_at'
      ]
      and jsonb_typeof(price_snapshot->'client_displayed_price') = 'null'
      and jsonb_typeof(price_snapshot->'server_calculated_price') = 'null'
      and price_snapshot->>'price_type' = 'review'
      and jsonb_typeof(price_snapshot->'includes') = 'array'
      and jsonb_typeof(price_snapshot->'excludes') = 'array'
      and jsonb_typeof(price_snapshot->'calculated_at') = 'string'
    )
  );
