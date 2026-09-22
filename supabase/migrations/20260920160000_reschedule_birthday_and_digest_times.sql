-- Birthday messages and the daily digest were scheduled at 8:00 AM UTC and
-- 7:00 AM UTC respectively, an hour later than the product spec (5:00 AM
-- and 6:00 AM). pg_cron upserts by jobname, so this is unconditional like
-- 20260919141000_reschedule_daily_digest.sql.
create extension if not exists pg_net;

select cron.schedule(
  'send-birthday-messages',
  '0 5 * * *',
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

select cron.schedule(
  'send-daily-digest',
  '0 6 * * *',
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
