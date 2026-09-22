-- Audit every product announcement lifecycle change at the database boundary.
-- This captures direct API mutations as well as the Backoffice UI.

create or replace function public.audit_product_announcement_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'DELETE' then
    v_entity_id := old.id;
    v_before := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_entity_id := new.id;
    v_after := to_jsonb(new);
  else
    v_entity_id := new.id;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  end if;

  v_action := case
    when tg_op = 'INSERT' then 'product_announcement_created'
    when tg_op = 'DELETE' then 'product_announcement_deleted'
    when tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'published' then 'product_announcement_published'
    when tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'scheduled' then 'product_announcement_scheduled'
    when tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'archived' then 'product_announcement_archived'
    else 'product_announcement_updated'
  end;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    metadata
  ) values (
    auth.uid(),
    v_action,
    'product_announcement',
    v_entity_id,
    v_before,
    v_after,
    jsonb_build_object(
      'source', 'product_announcement_trigger',
      'operation', tg_op,
      'status_before', case when tg_op = 'INSERT' then null else old.status end,
      'status_after', case when tg_op = 'DELETE' then null else new.status end,
      'platforms_before', case when tg_op = 'INSERT' then null else old.platforms end,
      'platforms_after', case when tg_op = 'DELETE' then null else new.platforms end
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_product_announcement_change on public.product_announcements;
create trigger audit_product_announcement_change
  after insert or update or delete on public.product_announcements
  for each row execute function public.audit_product_announcement_change();

-- Track customer/admin interaction with an announcement as an audit event too.
-- The existing unique constraint on product_announcement_events keeps these
-- events one-per-user-per-announcement-per-action.
create or replace function public.audit_product_announcement_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    new.user_id,
    'product_announcement_' || new.event_type,
    'product_announcement',
    new.announcement_id,
    jsonb_build_object(
      'source', 'product_announcement_event_trigger',
      'event_id', new.id,
      'event_type', new.event_type,
      'user_id', new.user_id
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_product_announcement_event on public.product_announcement_events;
create trigger audit_product_announcement_event
  after insert on public.product_announcement_events
  for each row execute function public.audit_product_announcement_event();
