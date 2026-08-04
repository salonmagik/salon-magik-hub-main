-- New "billing" module: owners always have it; manager/supervisor can be
-- granted it via role_permissions (toggled in salon-admin's Permissions
-- tab); receptionist/staff never can (enforced client-side by disabling
-- the checkbox — this resolver mirrors that by simply never checking
-- their role_permissions row).
--
-- get_tenant_billing_admin_user_ids() is the single source of truth for
-- "who should receive billing-related notifications for this tenant" —
-- used by send-trial-expiry-reminders and future trial-extension notices.
-- SECURITY DEFINER so it works regardless of caller (edge functions call
-- it with the service role, which doesn't need this, but this keeps the
-- function safe to expose via RPC to authenticated users later without
-- redoing this — same reasoning as is_tenant_operational's fix).
create or replace function public.get_tenant_billing_admin_user_ids(p_tenant_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct ur.user_id
  from public.user_roles ur
  where ur.tenant_id = p_tenant_id
    and ur.is_active = true
    and (
      ur.role = 'owner'
      or (
        ur.role in ('manager', 'supervisor')
        and coalesce(
          (
            select upo.allowed
            from public.user_permission_overrides upo
            where upo.tenant_id = p_tenant_id
              and upo.user_id = ur.user_id
              and upo.module = 'billing'
          ),
          (
            select rp.allowed
            from public.role_permissions rp
            where rp.tenant_id = p_tenant_id
              and rp.role = ur.role
              and rp.module = 'billing'
          ),
          false
        )
      )
    );
$function$;
