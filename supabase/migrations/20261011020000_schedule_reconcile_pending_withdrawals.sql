-- Withdrawals stuck in 'pending'/'awaiting_otp' only ever got reconciled
-- reactively -- when the owner happened to attempt another withdrawal to
-- the same destination, which live-checked the stuck one against Paystack
-- as a side effect. If a transfer.* webhook was dropped and the owner never
-- tried again, the withdrawal (and the balance it reserved) stayed stuck
-- indefinitely with no way to retry -- confirmed in production: two
-- withdrawals sat 'pending' for over two weeks with no automatic recheck.
--
-- Schedules reconcile-pending-withdrawals every 10 minutes via pg_cron +
-- pg_net, same pattern as process-recurring-addon-billing: the function URL
-- and shared secret are pulled from Supabase Vault by name (set per
-- environment via `supabase db query`, never committed here) so this
-- migration is safe to run unchanged on dev/staging/prod.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'reconcile-pending-withdrawals') then
    perform cron.schedule(
      'reconcile-pending-withdrawals',
      '*/10 * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_withdrawals_function_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-reconcile-withdrawals-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_withdrawals_secret'
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
      $job$
    );
  end if;
end $$;
