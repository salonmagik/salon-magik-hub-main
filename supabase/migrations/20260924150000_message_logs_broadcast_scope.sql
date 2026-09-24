-- Tags each message_logs row with the audience scope it was sent under
-- ("single" for a 1:1 send, a preset name like "all_customers" or
-- "vip_customers" for a broadcast) so the Overview page's Marketing
-- summary can bucket sends into individual/targeted/bulk without
-- re-deriving intent from unrelated columns. Populated going forward by
-- send-bulk-message; existing rows are left null and simply excluded from
-- all three buckets (a launch-day transition window, not backfilled).
alter table public.message_logs
  add column if not exists broadcast_scope text;
