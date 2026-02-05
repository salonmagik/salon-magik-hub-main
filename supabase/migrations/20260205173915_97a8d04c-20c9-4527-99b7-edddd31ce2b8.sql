-- Phase 13: Owner Invitation System - Add columns for resend tracking

ALTER TABLE public.staff_invitations
ADD COLUMN IF NOT EXISTS last_resent_at timestamptz,
ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS invited_via text DEFAULT 'staff_module';

-- Add comment for documentation
COMMENT ON COLUMN public.staff_invitations.last_resent_at IS 'Timestamp of last resend attempt for throttling';
COMMENT ON COLUMN public.staff_invitations.resend_count IS 'Number of times invitation was resent';
COMMENT ON COLUMN public.staff_invitations.invited_via IS 'Source: staff_module or onboarding';