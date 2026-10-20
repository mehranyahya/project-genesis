-- Operator-only aggregate health check; no identifiers, contact details,
-- request text, RPC side effects, delivery calls or writes are returned/run.
-- Run in the intended project's authenticated SQL editor, not a public route.
begin read only;
set local statement_timeout = '15s';

select pg_catalog.jsonb_build_object(
  'request_policy_rows', (select count(*) from public.request_rate_limit_policy),
  'requests_enabled', (
    select enabled from public.request_rate_limit_policy where id = 'primary'
  ),
  'total_requests', count(*),
  'new_requests', count(*) filter (where status = 'new'),
  'contacted_requests', count(*) filter (where status = 'contacted'),
  'followups_due', count(*) filter (
    where status = 'contacted' and next_review_at <= pg_catalog.transaction_timestamp()
  ),
  'active_telegram_pending_due', count(*) filter (
    where status in ('new', 'contacted') and telegram_status = 'pending'
      and telegram_next_attempt_at <= pg_catalog.transaction_timestamp()
  ),
  'active_telegram_expired_leases', count(*) filter (
    where status in ('new', 'contacted') and telegram_status = 'sending'
      and telegram_lease_until <= pg_catalog.transaction_timestamp()
  ),
  'active_telegram_failed', count(*) filter (
    where status in ('new', 'contacted') and telegram_status = 'failed'
  )
) as request_operations
from public.requests;

commit;
