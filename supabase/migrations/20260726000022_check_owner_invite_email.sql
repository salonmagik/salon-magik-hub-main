-- Lets the onboarding "invite an owner" step validate up front, before
-- submitting, whether the email being invited can actually be invited.
--
-- send-staff-invitation currently rejects ANY email that already has an
-- auth.users account, for any role — it only knows how to create a brand
-- new account, not add an existing one to another tenant. That rejection
-- was previously invisible: OnboardingPage.tsx awaited the invite call
-- without checking its response, so the whole thing silently no-opped and
-- onboarding "completed" with no owner ever assigned. Fixed alongside this
-- by making that response checked and surfaced.
--
-- Returns a reason so the two failure cases get distinct, accurate copy:
-- 'already_owner' (also blocked at the DB level by
-- enforce_single_owner_tenant, 20260726000020) vs the broader
-- 'existing_account' case, which covers any other pre-existing email
-- (a different role elsewhere, a client-portal account, etc.) — inviting
-- an existing account to a new tenant isn't supported yet at all.
--
-- Narrowly scoped (no account details beyond the reason code) to avoid
-- adding an email-enumeration surface, and authenticated-only since this
-- only ever runs mid-onboarding while the caller already has a session.
create or replace function public.check_owner_invite_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_uid uuid;
begin
  if v_email is null then
    return jsonb_build_object('available', true);
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
  if v_uid is null then
    return jsonb_build_object('available', true);
  end if;

  if exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
      and coalesce(r.is_active, true)
  ) then
    return jsonb_build_object('available', false, 'reason', 'already_owner');
  end if;

  return jsonb_build_object('available', false, 'reason', 'existing_account');
end;
$$;

grant execute on function public.check_owner_invite_email(text) to authenticated;
