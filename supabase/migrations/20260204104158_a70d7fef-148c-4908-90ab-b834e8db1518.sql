-- Create helper function to check if user is a backoffice user
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
      AND totp_enabled = true
  )
$$;

-- Create helper function to check backoffice role
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
      AND totp_enabled = true
  )
$$;

-- RLS for backoffice_allowed_domains (BackOffice users only)
CREATE POLICY "BackOffice users can read allowed domains"
  ON public.backoffice_allowed_domains
  FOR SELECT
  TO authenticated
  USING (public.is_backoffice_user(auth.uid()));

-- RLS for backoffice_users (users can read own, admins can manage)
CREATE POLICY "BackOffice users can read own record"
  ON public.backoffice_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_backoffice_role(auth.uid(), 'super_admin'));

CREATE POLICY "BackOffice users can update own record"
  ON public.backoffice_users
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS for maintenance_events (public read for active, BackOffice full access)
CREATE POLICY "Anyone can read active maintenance events"
  ON public.maintenance_events
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "BackOffice users can manage maintenance events"
  ON public.maintenance_events
  FOR ALL
  TO authenticated
  USING (public.is_backoffice_user(auth.uid()))
  WITH CHECK (public.is_backoffice_user(auth.uid()));

-- RLS for platform_settings (BackOffice only)
CREATE POLICY "BackOffice users can read platform settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.is_backoffice_user(auth.uid()));

CREATE POLICY "Super admins can update platform settings"
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_backoffice_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_backoffice_role(auth.uid(), 'super_admin'));