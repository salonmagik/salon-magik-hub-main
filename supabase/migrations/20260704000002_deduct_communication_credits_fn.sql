-- Atomic credit deduction for messaging sends.
-- Replaces the supabase.raw() pattern in edge functions (not a valid Supabase JS API).
create or replace function deduct_communication_credits(p_tenant_id uuid, p_amount int)
returns void
language plpgsql
security definer
as $$
begin
  update public.communication_credits
  set balance   = greatest(0, balance - p_amount),
      updated_at = now()
  where tenant_id = p_tenant_id;
end;
$$;

grant execute on function deduct_communication_credits(uuid, int) to service_role;
