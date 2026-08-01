-- Deactivating/reactivating another backoffice admin was done via a direct
-- UPDATE on public.backoffice_users from the client. RLS only exposes a
-- "backoffice_users self update" policy (using auth.uid() = user_id), so an
-- admin updating *another* admin's row matched zero rows with NO error — the
-- UI showed a success toast while nothing changed.
--
-- Provide a SECURITY DEFINER RPC (same pattern as backoffice_assign_user_role)
-- that enforces super_admin and performs the update, bypassing the self-only
-- RLS policy.

create or replace function public.backoffice_set_user_active(
  p_backoffice_user_id uuid,
  p_is_active boolean
)
returns public.backoffice_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result public.backoffice_users;
begin
  if v_actor is null or not has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  -- Guard against locking yourself out.
  if not p_is_active and exists (
    select 1
    from public.backoffice_users
    where id = p_backoffice_user_id
      and user_id = v_actor
  ) then
    raise exception 'CANNOT_DEACTIVATE_SELF';
  end if;

  update public.backoffice_users
  set is_active = p_is_active
  where id = p_backoffice_user_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'BACKOFFICE_USER_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

grant execute on function public.backoffice_set_user_active(uuid, boolean) to authenticated;
