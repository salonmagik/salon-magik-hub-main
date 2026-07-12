-- Schedule the send-appointment-reminders edge function every 30 minutes
-- via pg_cron + pg_net. Uses the same vault-secret pattern as the recurring
-- addon billing job so no URLs or keys are hard-coded here.
--
-- Required vault secrets (set per-environment):
--   appointment_reminders_function_url  — full URL to the edge function
--   appointment_reminders_secret        — shared secret sent as x-reminders-secret header
--
-- Set them with:
--   supabase secrets set APPOINTMENT_REMINDERS_SECRET=<value> --project-ref <ref>
-- and register the URL via:
--   supabase db query "select vault.create_secret('<url>', 'appointment_reminders_function_url');" --linked
--   supabase db query "select vault.create_secret('<secret>', 'appointment_reminders_secret');" --linked

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-appointment-reminders') then
    perform cron.schedule(
      'send-appointment-reminders',
      '*/30 * * * *',
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
  end if;
end $$;
