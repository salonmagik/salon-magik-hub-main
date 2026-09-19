-- Keep the daily digest job at its intended cadence even when an older
-- job with the same name already exists. pg_cron upserts by job name.
create extension if not exists pg_net;

select cron.schedule(
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
