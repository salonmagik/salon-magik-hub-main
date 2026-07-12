-- Periodically apply plan_change_batches whose scheduled rollout_at has passed.
-- Without this, scheduling a pricing change (go-live date) never actually takes effect.
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'process-due-scheduled-plan-batches') then
    perform cron.schedule(
      'process-due-scheduled-plan-batches',
      '*/5 * * * *',
      $job$select public.process_due_scheduled_plan_batches();$job$
    );
  end if;
end $$;
