-- Query support for the transactional IP/phone rate-limit windows.
-- These indexes are deliberately separate from the existing
-- (phone_normalized, request_type, created_at) duplicate-window index because
-- the global phone-rate query does not constrain request_type.

create index if not exists requests_rate_ip_created_idx
  on public.requests (ip_hash, created_at desc)
  where ip_hash is not null and anonymized_at is null;

create index if not exists requests_rate_phone_created_idx
  on public.requests (phone_normalized, created_at desc)
  where phone_normalized is not null and anonymized_at is null;
