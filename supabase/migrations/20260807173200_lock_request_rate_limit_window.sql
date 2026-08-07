-- The public HTTP contract already returns Retry-After: 600 for RATE_LIMITED.
-- Keep the database policy window locked to the same ten-minute contract so
-- operators may tune request ceilings without creating a contradictory retry
-- duration.

update public.request_rate_limit_policy
   set window_seconds = 600,
       updated_at = now()
 where id = 'primary';

alter table public.request_rate_limit_policy
  alter column window_seconds set default 600,
  alter column window_seconds set not null;

alter table public.request_rate_limit_policy
  drop constraint request_rate_limit_policy_window_chk;

alter table public.request_rate_limit_policy
  add constraint request_rate_limit_policy_window_chk
  check (window_seconds = 600);
