-- Existing rate limiting on phone_otp_tokens is scoped per target phone
-- number only, so an attacker rotating through many phone numbers from one
-- IP is unthrottled. Track the sender's IP alongside each token so
-- send-phone-otp / send-client-phone-otp / request-phone-change-otp can also
-- cap requests per-IP.
alter table public.phone_otp_tokens
  add column if not exists ip_address text;

create index if not exists idx_phone_otp_tokens_ip_created
  on public.phone_otp_tokens (ip_address, created_at)
  where ip_address is not null;
