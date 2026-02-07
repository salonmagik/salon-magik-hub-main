-- Add temp password columns to staff_invitations
ALTER TABLE public.staff_invitations 
ADD COLUMN IF NOT EXISTS temp_password TEXT,
ADD COLUMN IF NOT EXISTS temp_password_used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE;

-- Add is_active column to user_roles for staff deactivation
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON public.user_roles(is_active);

-- Comment for clarity
COMMENT ON COLUMN public.staff_invitations.temp_password IS 'Temporary password for staff login (plain text, invalidated after password change)';
COMMENT ON COLUMN public.staff_invitations.temp_password_used IS 'Whether the staff has logged in with the temp password';
COMMENT ON COLUMN public.staff_invitations.password_changed_at IS 'When the staff changed their temp password';
COMMENT ON COLUMN public.user_roles.is_active IS 'Whether the staff member is active (false = deactivated)';