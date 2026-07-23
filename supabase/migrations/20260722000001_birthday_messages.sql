-- Birthday messages: schema additions + daily cron job
--
-- 1. customers.birthday         — the client's date of birth (month+day used for matching)
-- 2. customers.last_birthday_email_sent_at — idempotency: don't re-send in the same calendar year
-- 3. notification_settings.email_birthday_messages — per-tenant opt-out
-- 4. email_templates check constraint expanded to allow 'birthday_message'
-- 5. Daily cron via pg_cron + pg_net (8:00 AM UTC)
--
-- Required vault secrets (one-time setup per environment):
--   birthday_messages_function_url  — full URL to the send-birthday-messages edge function
--   birthday_messages_secret        — shared secret sent as x-birthday-secret header
--
-- Register with:
--   supabase db query "select vault.create_secret('<url>', 'birthday_messages_function_url');" --linked
--   supabase db query "select vault.create_secret('<secret>', 'birthday_messages_secret');" --linked

-- 1. Customers table extensions
alter table public.customers
  add column if not exists birthday date,
  add column if not exists last_birthday_email_sent_at timestamptz;

-- 2. Notification settings opt-in column (default true — auto-enabled for all tenants)
alter table public.notification_settings
  add column if not exists email_birthday_messages boolean not null default true;

-- 3. Expand email_templates check constraint to include birthday_message
alter table public.email_templates
  drop constraint if exists email_templates_template_type_check;

alter table public.email_templates
  add constraint email_templates_template_type_check
  check (
    template_type in (
      'appointment_confirmation',
      'appointment_reminder',
      'appointment_cancelled',
      'booking_confirmation',
      'payment_receipt',
      'refund_confirmation',
      'staff_invitation',
      'welcome',
      'password_reset',
      'password_changed',
      'email_verification',
      'welcome_owner',
      'service_started',
      'buffer_requested',
      'service_change_approval',
      'trial_ending_7d',
      'trial_ending_3h',
      'payment_failed',
      'store_credit_restored',
      'gift_received',
      'voucher_applied',
      'daily_digest',
      'birthday_message'
    )
  );

-- 4. Schedule daily birthday messages at 8:00 AM UTC
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-birthday-messages') then
    perform cron.schedule(
      'send-birthday-messages',
      '0 8 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'birthday_messages_function_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-birthday-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'birthday_messages_secret'
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
      $job$
    );
  end if;
end $$;
