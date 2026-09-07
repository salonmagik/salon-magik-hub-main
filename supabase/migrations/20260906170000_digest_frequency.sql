-- Replaces the daily-only email_daily_digest boolean with a real frequency
-- choice. A weekly/monthly digest showing only "today's" numbers would be
-- nearly all zeros most mornings, so send-daily-digest also needs to know
-- which period to aggregate over, not just whether to send at all.
alter table public.notification_settings
  add column digest_frequency text not null default 'off'
  check (digest_frequency in ('off', 'daily', 'weekly', 'monthly'));

update public.notification_settings
set digest_frequency = case when email_daily_digest then 'daily' else 'off' end;

alter table public.notification_settings drop column email_daily_digest;
