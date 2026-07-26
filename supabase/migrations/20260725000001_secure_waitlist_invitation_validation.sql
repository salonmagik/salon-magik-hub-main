-- Validate a waitlist invitation without relying on broad anonymous SELECT
-- policies. Possession of the high-entropy token grants access only to the
-- minimum lead fields required to prefill signup.

CREATE OR REPLACE FUNCTION public.validate_waitlist_invitation(p_token TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  status public.waitlist_status,
  invitation_expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lead.id,
    lead.name,
    lead.email,
    lead.phone,
    lead.status,
    lead.invitation_expires_at
  FROM public.waitlist_leads AS lead
  WHERE lead.invitation_token = NULLIF(BTRIM(p_token), '')
    AND lead.status = 'invited'
    AND lead.invitation_expires_at > NOW()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_waitlist_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_waitlist_invitation(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.validate_waitlist_invitation(TEXT)
  IS 'Returns the minimum signup fields for an exact high-entropy waitlist invitation token.';
