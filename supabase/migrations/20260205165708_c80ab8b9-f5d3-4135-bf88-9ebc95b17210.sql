-- Create backoffice_sessions table for single-session enforcement
CREATE TABLE IF NOT EXISTS public.backoffice_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token text NOT NULL UNIQUE,
    ip_address inet,
    user_agent text,
    city text,
    country text,
    region text,
    isp text,
    device_type text,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    end_reason text CHECK (end_reason IN ('logout', 'expired', 'replaced', 'force_ended')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.backoffice_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for backoffice_sessions
CREATE POLICY "BackOffice users can read own sessions"
ON public.backoffice_sessions
FOR SELECT
USING (user_id = auth.uid() OR is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can create own sessions"
ON public.backoffice_sessions
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "BackOffice users can update own sessions"
ON public.backoffice_sessions
FOR UPDATE
USING (user_id = auth.uid() OR has_backoffice_role(auth.uid(), 'super_admin'));

-- Add columns to audit_logs for timing if not exist
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS ended_at timestamptz,
ADD COLUMN IF NOT EXISTS criticality_score numeric;

-- Add columns to staff_invitations if not exist
ALTER TABLE public.staff_invitations 
ADD COLUMN IF NOT EXISTS last_resent_at timestamptz,
ADD COLUMN IF NOT EXISTS resend_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS invited_via text DEFAULT 'staff_module';

-- Add INSERT policy for super_admin to create backoffice users
CREATE POLICY "Super admins can create backoffice users"
ON public.backoffice_users
FOR INSERT
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

-- Add DELETE policy for super_admin (cannot delete self)
CREATE POLICY "Super admins can delete backoffice users"
ON public.backoffice_users
FOR DELETE
USING (has_backoffice_role(auth.uid(), 'super_admin') AND user_id != auth.uid());

-- Create index for session lookups
CREATE INDEX IF NOT EXISTS idx_backoffice_sessions_user_active 
ON public.backoffice_sessions(user_id) 
WHERE ended_at IS NULL;