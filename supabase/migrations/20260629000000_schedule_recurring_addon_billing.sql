-- Schedules the process-recurring-addon-billing edge function daily via
-- pg_cron + pg_net. Both the function URL and the shared secret it sends as
-- x-recurring-billing-secret are pulled from Supabase Vault by name (set
-- per-environment via `supabase db query`, never committed to a migration
-- file) so this same migration is safe to run unchanged on dev/staging/prod
-- and no secret or environment-specific URL ever lands in git history.
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'process-recurring-addon-billing') then
    perform cron.schedule(
      'process-recurring-addon-billing',
      '0 3 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'recurring_billing_function_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-recurring-billing-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'recurring_billing_secret'
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
      $job$
    );
  end if;
end $$;
