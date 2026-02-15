-- Align BackOffice onboarding access with product flow:
-- - Temp-password users can authenticate and read their own backoffice profile row
-- - They cannot access broader BackOffice data/actions until password is changed

CREATE OR REPLACE FUNCTION public.is_backoffice_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.backoffice_users
    WHERE user_id = _user_id
      AND COALESCE(is_active, true) = true
      AND COALESCE(temp_password_required, true) = false
  )
$$;

CREATE OR REPLACE FUNCTION public.has_backoffice_role(_user_id uuid, _role backoffice_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.backoffice_users
    WHERE user_id = _user_id
      AND role = _role
      AND COALESCE(is_active, true) = true
      AND COALESCE(temp_password_required, true) = false
  )
$$;
