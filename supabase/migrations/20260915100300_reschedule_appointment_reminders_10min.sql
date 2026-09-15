-- notification-settings-missing-per-tenant (AD-6): tighten the reminders
-- cadence from every 30 minutes to every 10, bounding the delivered lead
-- time on the new 30-minute offset to 20-30 minutes instead of 0-30.
--
-- 20260704000001 guards cron.schedule with `if not exists`, which would
-- make this a no-op on every environment that already has the job
-- registered. pg_cron upserts by jobname, so this call is unconditional.

create extension if not exists pg_net;

select cron.schedule(
  'send-appointment-reminders',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'appointment_reminders_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminders-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'appointment_reminders_secret'
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $job$
);
