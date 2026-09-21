-- details_confirmed_at previously doubled for both "confirmed" and "skipped"
-- (see 20260726000018), so a skip was as permanent as a real confirmation —
-- a customer who skipped had no way back to the form. Split skip into its
-- own timestamp: details_confirmed_at now means a real confirmation only,
-- and the profile page can nudge a customer to revisit while only this one
-- is set.
alter table public.profiles
  add column if not exists details_confirmation_skipped_at timestamptz;

comment on column public.profiles.details_confirmed_at is
  'Set only when the customer actually reviewed and confirmed their details. Null + details_confirmation_skipped_at set means they skipped instead — see the profile page nudge.';
comment on column public.profiles.details_confirmation_skipped_at is
  'Set when the customer skipped the confirm-details prompt instead of completing it. Cleared if they later confirm for real.';
