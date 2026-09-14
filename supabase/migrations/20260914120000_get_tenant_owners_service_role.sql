-- backoffice-add-tenant-co-owner calls get_tenant_owners with the service-role
-- client (index.ts:143). auth.uid() is NULL for that client, so the existing
-- has_backoffice_role gate always denied it, and every grant attempt failed
-- before reaching the co-owner logic. See
-- docs/research/2026-09-14-backoffice-co-owner-grant-analysis.md.
--
-- Extend the self-gate to also accept the trusted server: service_role
-- already bypasses RLS and can read user_roles/auth.users directly, so this
-- grants no new capability. `is distinct from` is required, not `<>` -
-- auth.role() is NULL on a direct connection (e.g. this migration, or the
-- pgTAP suite), and `<>` against NULL is NULL, which would silently bypass
-- the gate entirely.
create or replace function public.get_tenant_owners(p_tenant_id uuid)
returns table (user_id uuid, full_name text, email text, granted_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.role() is distinct from 'service_role'
     and not has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role) then
    raise exception 'BACKOFFICE_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return query
    select ur.user_id, p.full_name, u.email::text, ur.created_at
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.profiles p on p.user_id = ur.user_id
    where ur.tenant_id = p_tenant_id and ur.role = 'owner' and coalesce(ur.is_active, true)
    order by ur.created_at asc;   -- display order only; confers no precedence (FR-3)
end $$;
