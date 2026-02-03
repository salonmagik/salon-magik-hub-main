-- Add flag_reason column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS flag_reason text DEFAULT NULL;

-- Add slot_capacity_default to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS slot_capacity_default integer NOT NULL DEFAULT 1;

-- Create role_permissions table for RBAC
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  module text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, module)
);

-- Create user_permission_overrides table for individual overrides
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  module text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, module)
);

-- Enable RLS on both tables
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user is owner
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = 'owner'
  )
$$;

-- RLS Policies for role_permissions
-- All tenant members can read
CREATE POLICY "Users can read tenant role_permissions"
ON public.role_permissions
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Only owners can insert
CREATE POLICY "Owners can create role_permissions"
ON public.role_permissions
FOR INSERT
WITH CHECK (public.is_tenant_owner(auth.uid(), tenant_id));

-- Only owners can update
CREATE POLICY "Owners can update role_permissions"
ON public.role_permissions
FOR UPDATE
USING (public.is_tenant_owner(auth.uid(), tenant_id))
WITH CHECK (public.is_tenant_owner(auth.uid(), tenant_id));

-- Only owners can delete
CREATE POLICY "Owners can delete role_permissions"
ON public.role_permissions
FOR DELETE
USING (public.is_tenant_owner(auth.uid(), tenant_id));

-- RLS Policies for user_permission_overrides
-- All tenant members can read
CREATE POLICY "Users can read tenant user_permission_overrides"
ON public.user_permission_overrides
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Only owners can insert
CREATE POLICY "Owners can create user_permission_overrides"
ON public.user_permission_overrides
FOR INSERT
WITH CHECK (public.is_tenant_owner(auth.uid(), tenant_id));

-- Only owners can update
CREATE POLICY "Owners can update user_permission_overrides"
ON public.user_permission_overrides
FOR UPDATE
USING (public.is_tenant_owner(auth.uid(), tenant_id))
WITH CHECK (public.is_tenant_owner(auth.uid(), tenant_id));

-- Only owners can delete
CREATE POLICY "Owners can delete user_permission_overrides"
ON public.user_permission_overrides
FOR DELETE
USING (public.is_tenant_owner(auth.uid(), tenant_id));

-- Add updated_at trigger for role_permissions
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();