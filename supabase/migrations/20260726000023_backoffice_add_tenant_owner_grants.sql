-- backoffice-add-tenant-owner (new edge function) calls both of these via
-- the service-role client — grant execute so those calls actually succeed.
grant execute on function public.check_owner_invite_email(text) to service_role;
grant execute on function public.get_auth_user_by_email(text) to service_role;
