-- PRIVATE OUTPUT: object keys/IDs are inside the recovery material, not public logs.
-- Read-only source inventory. Run to a new 0600 file before and after a paused
-- original-byte export, alongside the same encrypted database generation.
begin read only;
set local statement_timeout = '10000ms';

select pg_catalog.jsonb_build_object(
  'format', 'genesis-storage-inventory-v1',
  'bucket', (
    select pg_catalog.jsonb_build_object(
      'id', b.id, 'name', b.name, 'public', b.public,
      'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types
    ) from storage.buckets b where b.id = 'catalog-media'
  ),
  'unsupported_bucket_count', (
    select count(*) from storage.buckets where id <> 'catalog-media'
  ),
  'unsupported_object_count', (
    select count(*) from storage.objects where bucket_id <> 'catalog-media'
  ),
  'multipart_upload_count', (
    select (select count(*) from storage.s3_multipart_uploads)
      + (select count(*) from storage.s3_multipart_uploads_parts)
  ),
  'objects', (
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', o.id::text, 'name', o.name,
        'content_type', o.metadata ->> 'mimetype',
        'etag', o.metadata ->> 'eTag',
        'size', case
          when coalesce(o.metadata ->> 'size', o.metadata ->> 'contentLength') ~ '^[0-9]{1,10}$'
          then coalesce(o.metadata ->> 'size', o.metadata ->> 'contentLength')::bigint
          else null
        end,
        'version', pg_catalog.to_jsonb(o) ->> 'version',
        'updated_at', pg_catalog.to_char(
          o.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      ) order by o.id
    ), '[]'::jsonb) from storage.objects o where o.bucket_id = 'catalog-media'
  )
)::text;

commit;
