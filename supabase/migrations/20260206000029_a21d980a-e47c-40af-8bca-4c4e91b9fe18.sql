-- Fix the overly permissive policy for staff_invitations
-- The previous policy allowed reading ALL pending invitations, which is wrong.
-- We need to remove this and instead handle token validation in the edge function.

DROP POLICY IF EXISTS "Anyone can read invitation by valid token" ON staff_invitations;

-- The accept-invitation flow should validate the token in the edge function,
-- not expose data directly via RLS. Edge functions use service role which bypasses RLS.