-- Stabilize backoffice helper functions used by RLS and resolver RPCs.
-- Do not gate role checks on temp_password_required; page access is handled in app flow.

create or replace function public.is_backoffice_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backoffice_users
    where user_id = _user_id
      and coalesce(is_active, true) = true
  );
$$;

create or replace function public.has_backoffice_role(_user_id uuid, _role backoffice_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backoffice_users
    where user_id = _user_id
      and role = _role
      and coalesce(is_active, true) = true
  );
$$;
