-- Mirrors getNextBillingAt() in supabase/functions/_shared/paystack-helpers.ts
-- — 30 days for monthly, 365 for annual, deliberately not calendar months.
-- Keep the two in step. Used at settlement time so a tenant who recovers
-- from past_due/suspended resumes on their original cycle anchor rather
-- than being handed every day they spent in retry/grace for free.
create or replace function public.advance_billing_anchor(
  p_due_at timestamptz,
  p_billing_cycle text
) returns timestamptz
language plpgsql
stable
as $$
declare
  v_step interval;
  v_next timestamptz;
  v_iterations integer := 0;
begin
  v_step := case when p_billing_cycle = 'annual' then interval '365 days' else interval '30 days' end;
  v_next := coalesce(p_due_at, now()) + v_step;

  while v_next <= now() loop
    v_next := v_next + v_step;
    v_iterations := v_iterations + 1;
    if v_iterations > 100 then
      raise exception 'ADVANCE_BILLING_ANCHOR_RUNAWAY: p_due_at=%, p_billing_cycle=%', p_due_at, p_billing_cycle;
    end if;
  end loop;

  return v_next;
end;
$$;

grant execute on function public.advance_billing_anchor(timestamptz, text) to service_role;
grant execute on function public.advance_billing_anchor(timestamptz, text) to authenticated;
