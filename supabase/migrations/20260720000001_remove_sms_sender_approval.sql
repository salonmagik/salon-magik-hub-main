-- Remove SMS sender name approval workflow columns from tenants.
-- The sms_sender_name column itself is kept as a plain configurable field.
alter table public.tenants
  drop column if exists sms_sender_name_status,
  drop column if exists sms_sender_name_approved_at,
  drop column if exists sms_sender_name_company,
  drop column if exists sms_sender_name_requested_at,
  drop column if exists sms_sender_name_use_case;
