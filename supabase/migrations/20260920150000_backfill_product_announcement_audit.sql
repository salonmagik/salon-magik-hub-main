-- The announcement audit triggers only see mutations after they are installed.
-- Record a safe snapshot for announcements that already existed so their
-- history is visible immediately after this migration is promoted.
insert into public.audit_logs (
  actor_user_id,
  action,
  entity_type,
  entity_id,
  after_json,
  metadata
)
select
  pa.created_by_id,
  'product_announcement_snapshot',
  'product_announcement',
  pa.id,
  to_jsonb(pa),
  jsonb_build_object(
    'source', 'product_announcement_audit_backfill',
    'status', pa.status,
    'platforms', pa.platforms
  )
from public.product_announcements pa
where not exists (
  select 1
  from public.audit_logs al
  where al.entity_type = 'product_announcement'
    and al.entity_id = pa.id
    and al.action in ('product_announcement_created', 'product_announcement_snapshot')
);
