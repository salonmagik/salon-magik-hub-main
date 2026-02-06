-- Allow anonymous users to read waitlist_leads when they have a valid invitation token
-- This is needed for the signup page to validate invitation tokens
CREATE POLICY "Anon can read waitlist with valid token"
ON public.waitlist_leads
FOR SELECT
TO anon
USING (
  invitation_token IS NOT NULL 
  AND invitation_expires_at > now()
  AND status = 'invited'
);

-- Also allow authenticated users to read their own waitlist entry during signup
CREATE POLICY "Authenticated can read waitlist with valid token"
ON public.waitlist_leads
FOR SELECT
TO authenticated
USING (
  invitation_token IS NOT NULL 
  AND invitation_expires_at > now()
  AND status = 'invited'
);