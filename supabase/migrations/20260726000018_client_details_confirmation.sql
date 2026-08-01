-- Tracks whether a customer has confirmed their canonical details (name,
-- DOB, gender) after first login. These are often entered by a salon admin
-- on the customer's behalf when adding them, so we nudge the customer once
-- to review/correct them. Null means "not yet confirmed or skipped".
alter table public.profiles
  add column if not exists details_confirmed_at timestamptz;
