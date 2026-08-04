-- tenant_trial_overrides has existed since the growth-ops migration and
-- Backoffice's "Tenant Gifted Trials" panel writes to it, but nothing ever
-- read it — is_tenant_operational() only looked at subscription_status and
-- trial_ends_at. Creating a gifted-trial override had zero actual effect on
-- the tenant: no storefront access, no dashboard access, nothing. An active
-- override (status='active', now() within its window) now grants
-- operational status regardless of the tenant's own subscription state.
CREATE OR REPLACE FUNCTION public.is_tenant_operational(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          when 'active' then true
          when 'trialing' then t.trial_ends_at is not null and t.trial_ends_at + interval '3 days' > now()
          else false
        end
    end
  from public.tenants t
  where t.id = p_tenant_id;
$function$;
