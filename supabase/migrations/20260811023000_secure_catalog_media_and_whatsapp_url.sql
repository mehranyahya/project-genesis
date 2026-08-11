-- Secure build-time media source and explicit WhatsApp URL contract.
-- The bucket stays private. Browser/anon access is never granted; uploads remain
-- manual or service-role mediated outside the public application.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'site_settings'
      AND column_name = 'whatsapp'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'site_settings'
      AND column_name = 'whatsapp_url'
  ) THEN
    ALTER TABLE public.site_settings RENAME COLUMN whatsapp TO whatsapp_url;
  END IF;
END
$$;

ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_whatsapp_url_chk;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_whatsapp_url_chk
  CHECK (
    whatsapp_url IS NULL
    OR whatsapp_url ~ '^https://(wa\.me/[1-9][0-9]{7,14}|api\.whatsapp\.com/send(\?.*)?)$'
  );

-- A row cannot be marked publication-safe without a non-empty consent/ownership
-- reference. The reference remains private build metadata and never enters the
-- browser-facing media DTO.
ALTER TABLE public.product_media
  DROP CONSTRAINT IF EXISTS product_media_publication_consent_chk;
ALTER TABLE public.product_media
  ADD CONSTRAINT product_media_publication_consent_chk
  CHECK (
    privacy_cleared IS NOT TRUE
    OR NULLIF(BTRIM(consent_reference), '') IS NOT NULL
  );

ALTER TABLE public.portfolio_media
  DROP CONSTRAINT IF EXISTS portfolio_media_publication_consent_chk;
ALTER TABLE public.portfolio_media
  ADD CONSTRAINT portfolio_media_publication_consent_chk
  CHECK (
    privacy_cleared IS NOT TRUE
    OR NULLIF(BTRIM(consent_reference), '') IS NOT NULL
  );

ALTER TABLE public.building_stone_media
  DROP CONSTRAINT IF EXISTS building_stone_media_publication_consent_chk;
ALTER TABLE public.building_stone_media
  ADD CONSTRAINT building_stone_media_publication_consent_chk
  CHECK (
    privacy_cleared IS NOT TRUE
    OR NULLIF(BTRIM(consent_reference), '') IS NOT NULL
  );

-- 20 MiB is an application-level source cap. The media build performs a second
-- byte-level cap plus magic-byte, decoded-dimension and pixel-count validation.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'catalog-media',
  'catalog-media',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects policy is created here. A private bucket with no anon or
-- authenticated SELECT/INSERT policy is intentionally inaccessible to browser
-- roles. Build tooling uses a service-role secret only inside CI.
