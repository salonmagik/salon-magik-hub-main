-- Gifted appointments previously only recorded the recipient's name/email as
-- a JSON string in booking_metadata, with no real link to a customer record.
-- A recipient customer record is now created at booking time (see
-- create-public-booking), and this column ties the appointment to it so the
-- salon can identify and work with the recipient as an actual customer, not
-- just read their name off a receipt.
alter table public.appointments
  add column if not exists gift_recipient_customer_id uuid references public.customers(id) on delete set null;

create index if not exists idx_appointments_gift_recipient_customer_id
  on public.appointments(gift_recipient_customer_id)
  where gift_recipient_customer_id is not null;
