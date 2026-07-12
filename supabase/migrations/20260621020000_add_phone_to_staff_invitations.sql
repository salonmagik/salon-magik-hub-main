-- The onboarding owner-invite step collects a phone number, but send-staff-invitation
-- silently drops it (it's not in the InvitationRequest interface and staff_invitations
-- has no phone column), so it never shows up anywhere downstream.
alter table public.staff_invitations
  add column if not exists phone text;
