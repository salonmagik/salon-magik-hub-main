-- A destination that Paystack synchronously rejects at transfer creation
-- (e.g. "Recipient is blacklisted", invalid account) needs to stop accepting
-- new withdrawal attempts until someone reviews it. Without this, nothing
-- stopped a salon from resubmitting the same bad recipient over and over —
-- which is exactly what escalated a real-world rejection into Paystack's
-- own automatic recipient blacklist.
alter table public.salon_payout_destinations
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_reason text,
  add column if not exists blocked_at timestamptz;
