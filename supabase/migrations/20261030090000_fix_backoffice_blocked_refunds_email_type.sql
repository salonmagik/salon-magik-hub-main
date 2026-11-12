-- get_backoffice_blocked_refunds has been failing with Postgres error 42804
-- ("Returned type character varying(255) does not match expected type text
-- in column 15") on every backoffice page load, since auth.users.email is
-- varchar(255) but the function's RETURNS TABLE declares attempted_by_email
-- as text. This made the blocked-refunds panel (and its nav badge) silently
-- show an empty/zero state platform-wide instead of real data. Cast the
-- varchar columns to text explicitly.

create or replace function public.get_backoffice_blocked_refunds(
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  tenant_id uuid,
  tenant_name text,
  transaction_id uuid,
  refund_request_id uuid,
  attempted_amount numeric,
  currency text,
  wallet_balance_at_attempt numeric,
  shortfall numeric,
  refund_type text,
  block_code text,
  reason text,
  attempted_by_id uuid,
  attempted_by_email text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  select
    rbe.id,
    rbe.created_at,
    rbe.tenant_id,
    t.name::text,
    rbe.transaction_id,
    rbe.refund_request_id,
    rbe.attempted_amount,
    rbe.currency,
    rbe.wallet_balance_at_attempt,
    rbe.shortfall,
    rbe.refund_type::text,
    rbe.block_code,
    rbe.reason,
    rbe.attempted_by_id,
    u.email::text,
    count(*) over ()
  from public.refund_block_events rbe
  join public.tenants t on t.id = rbe.tenant_id
  left join auth.users u on u.id = rbe.attempted_by_id
  order by rbe.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

grant execute on function public.get_backoffice_blocked_refunds(int, int) to authenticated;
