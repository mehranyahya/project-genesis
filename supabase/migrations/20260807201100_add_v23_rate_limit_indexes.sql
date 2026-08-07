-- Query support for the v23.2 Turnstile/rate-limit matrix.

create index if not exists requests_bot_verification_created_idx
  on public.requests (bot_verification, created_at desc);

create index if not exists requests_ip_bot_created_idx
  on public.requests (ip_hash, bot_verification, created_at desc)
  where ip_hash is not null;

create index if not exists requests_ip_phone_bot_created_idx
  on public.requests (ip_hash, phone_normalized, bot_verification, created_at desc)
  where ip_hash is not null and phone_normalized is not null;
