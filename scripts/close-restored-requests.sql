-- Only for the disposable local restore drill. The workflow executes this as
-- the final file in the local restore transaction, never on the source URL.
do $close_restore$
begin
  update public.request_rate_limit_policy set enabled = false where id = 'primary';
  if not (
    select count(*) = 1 and coalesce(bool_and(id = 'primary' and enabled is false), false)
      from public.request_rate_limit_policy
  ) then
    raise exception 'restored request policy is not closed';
  end if;
end
$close_restore$;
