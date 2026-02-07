-- Add user_id column to staff_invitations to link to created user account
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;