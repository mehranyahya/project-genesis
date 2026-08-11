-- Repository-only migration. Apply only after the ordered Preview backup gate.
-- The catalog bucket remains private and intentionally has no anon/authenticated policy.

alter table public.site_settings
  add column whatsapp_url text null;

alter table public.site_settings
  add constraint site_settings_whatsapp_url_chk check (
    whatsapp_url is null
    or whatsapp_url ~ '^https://wa\.[m]e/[1-9][0-9]{7,15}$'
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'catalog-media',
  'catalog-media',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.site_settings.whatsapp_url is
  'Reviewed public HTTPS wa.me destination; never inferred from a phone number at runtime.';

-- Build-only consistency marker. It covers every row read by the publication
-- job plus private object identity/metadata, while the existing operational
-- catalog version remains the client/server pricing contract.
create or replace function public.compute_catalog_publication_source_version()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'schemaVersion', 1,
          'products', (
            select coalesce(jsonb_agg(to_jsonb(source_row) order by source_row.sort_order, source_row.id), '[]'::jsonb)
            from (
              select
                id, code, slug, product_type, title, summary, description,
                is_active, is_featured, seo_title, seo_description,
                seo_canonical_path, seo_robots, sort_order, updated_at
              from public.products
              where is_active = true
            ) source_row
          ),
          'variants', (
            select coalesce(jsonb_agg(to_jsonb(source_row) order by source_row.sort_order, source_row.id), '[]'::jsonb)
            from (
              select
                id, product_id, stone_code, size_code, price_type, amount_toman,
                price_updated_at, includes, excludes, is_available, sort_order
              from public.product_variants
              where is_available = true
            ) source_row
          ),
          'options', (
            select coalesce(jsonb_agg(to_jsonb(source_row) order by source_row.sort_order, source_row.id), '[]'::jsonb)
            from (
              select
                id, variant_id, title, price_type, amount_toman, price_updated_at,
                is_available, compatible_size_codes, sort_order
              from public.product_options
              where is_available = true
            ) source_row
          ),
          'productMedia', (
            select coalesce(
              jsonb_agg(to_jsonb(source_row) order by source_row.product_id, source_row.sort_order, source_row.media_key),
              '[]'::jsonb
            )
            from (
              select
                product_id, media_key, alt, privacy_cleared, consent_reference,
                width, height, sort_order
              from public.product_media
              where privacy_cleared = true
            ) source_row
          ),
          'portfolioItems', (
            select coalesce(
              jsonb_agg(to_jsonb(source_row) order by source_row.sort_order, source_row.public_reference_id),
              '[]'::jsonb
            )
            from (
              select
                public_reference_id, stone_code, size_code, summary,
                is_active, sort_order, updated_at
              from public.portfolio_items
              where is_active = true
            ) source_row
          ),
          'portfolioMedia', (
            select coalesce(
              jsonb_agg(to_jsonb(source_row) order by source_row.public_reference_id, source_row.sort_order, source_row.media_key),
              '[]'::jsonb
            )
            from (
              select
                public_reference_id, media_key, alt, privacy_cleared,
                consent_reference, width, height, sort_order
              from public.portfolio_media
              where privacy_cleared = true
            ) source_row
          ),
          'siteSettings', (
            select coalesce(jsonb_agg(to_jsonb(source_row) order by source_row.id), '[]'::jsonb)
            from (
              select
                id, display_name, latin_name, phone, whatsapp_url, telegram,
                address, working_hours, instagram_url, website_url, map_url
              from public.site_settings
              where id = 'primary'
            ) source_row
          ),
          'storageObjects', (
            select coalesce(jsonb_agg(to_jsonb(source_row) order by source_row.name), '[]'::jsonb)
            from (
              select id, name, created_at, updated_at, metadata
              from storage.objects
              where bucket_id = 'catalog-media'
            ) source_row
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.compute_catalog_publication_source_version()
  from public, anon, authenticated;
grant execute on function public.compute_catalog_publication_source_version()
  to service_role;
