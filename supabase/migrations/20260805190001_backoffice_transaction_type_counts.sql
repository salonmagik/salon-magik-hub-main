-- Per-type counts for the transaction-type filter tabs.
create or replace function public.get_backoffice_transaction_type_counts(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  type text,
  tx_count integer
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
  select t.type, count(*)::integer
  from public.transactions t
  where t.created_at >= p_from
    and t.created_at < p_to
  group by t.type;
end;
$$;

grant execute on function public.get_backoffice_transaction_type_counts(timestamptz, timestamptz) to authenticated;
