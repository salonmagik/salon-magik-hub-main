-- is_tenant_operational() is called inside public_booking_tenants' WHERE
-- clause to gate the public storefront. The view itself is owned by
-- postgres (bypassrls) so its outer column selection ignores tenants'
-- RLS, but this function was SECURITY INVOKER (the default) — its own
-- internal "select ... from tenants" ran as the *calling* role, which
-- for an anonymous storefront visitor is `anon`. tenants' RLS has no
-- policy granting anon any read access, so the function's internal
-- query returned zero rows, the function returned NULL, and
-- "WHERE ... AND is_tenant_operational(id)" silently discarded every
-- tenant — the public booking page always showed "Salon Not Found"
-- regardless of slug or online_booking_enabled. Match the existing
-- is_backoffice_user/has_backoffice_role pattern: SECURITY DEFINER so
-- this check runs with the function owner's visibility, independent of
-- who's calling it.
CREATE OR REPLACE FUNCTION public.is_tenant_operational(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    case t.subscription_status
      when 'active' then true
      when 'trialing' then t.trial_ends_at is not null and t.trial_ends_at + interval '3 days' > now()
      else false
    end
  from public.tenants t
  where t.id = p_tenant_id;
$function$;
