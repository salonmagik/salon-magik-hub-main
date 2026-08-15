-- Lets the notification bell tag a booking notification as a gift without a
-- join back to appointments — same pattern as the existing `urgent` flag on
-- this table.
alter table public.notifications
  add column if not exists is_gifted boolean not null default false;
