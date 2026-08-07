-- send-daily-digest has existed since the messaging wizard split, and the
-- email_daily_digest opt-in toggle in Settings has always worked — but
-- unlike the other four scheduled jobs (appointment reminders, birthday
-- messages, recurring billing, trial expiry), nothing ever actually called
-- it daily. It only ran on manual/internal invocation. Vault secrets
-- (daily_digest_function_url, daily_digest_secret) are created out-of-band
-- via `supabase db query`, same as the other jobs, so this migration
-- applies unchanged across dev/staging/prod.
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-daily-digest') then
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
  end if;
end $$;
