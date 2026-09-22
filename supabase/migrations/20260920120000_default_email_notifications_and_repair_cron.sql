-- Email notifications are enabled by default for new tenants and branch
-- overrides. The previous digest default was "off"; migrate those legacy
-- rows to daily so existing salons receive the new default as well. Owners
-- can still turn the digest off from Notification Settings.
update public.notification_settings
set digest_frequency = 'daily'
where digest_frequency = 'off';

alter table public.notification_settings
  alter column email_appointment_reminders set default true,
  alter column email_new_bookings set default true,
  alter column email_cancellations set default true,
  alter column email_transaction_alerts set default true,
  alter column email_birthday_messages set default true,
  alter column digest_frequency set default 'daily';

-- Re-register the scheduled jobs deterministically. A previous migration used
-- cron.schedule with the same name, which can leave an old or missing job in
-- place when a project has been restored or a migration was partially run.
-- Removing only these named jobs is safe; unrelated cron jobs are untouched.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  job_id bigint;
begin
  for job_id in
    select jobid from cron.job
    where jobname in ('send-appointment-reminders', 'send-daily-digest')
  loop
    perform cron.unschedule(job_id);
  end loop;

  perform cron.schedule(
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

  perform cron.schedule(
    'send-daily-digest',
    '0 7 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_digest_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-daily-digest-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'daily_digest_secret'
        )
      ),
      body := '{}'::jsonb
    ) as request_id;
    $job$
  );
end $$;
