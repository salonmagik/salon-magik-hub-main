-- Drop Termii columns from tenants
alter table public.tenants
  drop column if exists termii_device_id,
  drop column if exists termii_sender_id,
  drop column if exists termii_sender_id_approved_at,
  drop column if exists termii_sender_id_company,
  drop column if exists termii_sender_id_requested_at,
  drop column if exists termii_sender_id_status,
  drop column if exists termii_sender_id_use_case;

-- Drop Termii columns from message_logs
alter table public.message_logs
  drop column if exists termii_message_id,
  drop column if exists termii_device_id;

-- Drop Termii columns from customer_reactivation_campaigns
alter table public.customer_reactivation_campaigns
  drop column if exists termii_device_id,
  drop column if exists termii_template_id,
  drop column if exists whatsapp_provider;

-- Drop impersonation sessions table
drop table if exists public.impersonation_sessions;
