-- Trial-expiry email reminders at 7 days, 3 days, and 24 hours before
-- trial_ends_at, sent to the tenant OWNER, nudging them to upgrade to the
-- plan they selected during onboarding.
--
-- Required vault secrets (one-time setup per environment):
--   trial_reminders_function_url  — full URL to the send-trial-expiry-reminders edge function
--   trial_reminders_secret        — shared secret sent as x-trial-reminders-secret header
--                                    (must also be set as an edge function secret:
--                                    supabase secrets set TRIAL_REMINDERS_SECRET=<value>)
--
-- Register with:
--   supabase db query "select vault.create_secret('<url>', 'trial_reminders_function_url');" --linked
--   supabase db query "select vault.create_secret('<secret>', 'trial_reminders_secret');" --linked

-- 1. Expand template_type to the three thresholds actually used (7d/3d/24h —
-- the previously-scaffolded 'trial_ending_3h' is superseded and dropped).
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
      'trial_ending_3d',
      'trial_ending_24h',
      'payment_failed',
      'store_credit_restored',
      'gift_received',
      'voucher_applied',
      'daily_digest',
      'birthday_message'
    )
  );

-- 2. Idempotency: one nullable timestamp per threshold so a tenant gets each
-- reminder at most once, no matter how often the hourly cron re-checks them.
alter table public.tenants
  add column if not exists trial_reminder_7d_sent_at timestamptz,
  add column if not exists trial_reminder_3d_sent_at timestamptz,
  add column if not exists trial_reminder_24h_sent_at timestamptz;

-- 3. Hourly cron (24h-threshold needs better-than-daily precision; 7d/3d don't
-- mind the extra checks, they're no-ops once already sent).
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-trial-expiry-reminders') then
    perform cron.schedule(
      'send-trial-expiry-reminders',
      '0 * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'trial_reminders_function_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-trial-reminders-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'trial_reminders_secret'
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
      $job$
    );
  end if;
end $$;
