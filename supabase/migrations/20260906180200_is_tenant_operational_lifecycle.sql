-- Tenants already sitting in past_due at deploy time have no grace deadline.
-- Give them a full fresh window rather than instantly suspending them —
-- they have never been warned, and the dunning reminder emails have never
-- been sent to them. Runs before the function replacement below so no
-- tenant is momentarily reopened by the new past_due branch.
update public.tenants
set billing_grace_ends_at = now() + interval '14 days',
    billing_grace_started_at = now()
where subscription_status = 'past_due'
  and billing_grace_ends_at is null;

-- past_due is now a *warned but working* state for the length of the grace
-- window (see BILLING_GRACE_PERIOD_DAYS in process-recurring-addon-billing).
-- Suspension — not the payment failure itself — is what takes the storefront
-- down. A past_due tenant with no grace deadline stamped keeps the old,
-- stricter behaviour so nothing is accidentally re-opened. Preserves the
-- gifted-trial-override precedence introduced in
-- 20260803233000_honor_tenant_trial_overrides.sql.
create or replace function public.is_tenant_operational(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    case
      when exists (
        select 1 from public.tenant_trial_overrides o
        where o.tenant_id = p_tenant_id
          and o.status = 'active'
          and now() between o.starts_at and o.ends_at
      ) then true
      else
        case t.subscription_status
          when 'active'   then true
          when 'trialing' then t.trial_ends_at is not null
                               and t.trial_ends_at + interval '3 days' > now()
          when 'past_due' then t.billing_grace_ends_at is not null
                               and t.billing_grace_ends_at > now()
          else false
        end
    end
  from public.tenants t
  where t.id = p_tenant_id;
$function$;
