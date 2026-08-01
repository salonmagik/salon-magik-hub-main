-- Expand broadcast_drafts.audience_preset to allow the new segment-based
-- presets (big_spenders, regulars, loves_packages, lapsed_customers) added to
-- the messaging audience picker. vip_customers now reads from is_starred
-- instead of the retired status='vip' — no constraint change needed for that
-- one, the value is unchanged.
--
-- Drop whatever the inline check constraint on audience_preset is actually
-- named (don't assume the default Postgres naming) before adding the
-- expanded one.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'broadcast_drafts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%audience_preset%';

  if v_constraint_name is not null then
    execute format('alter table public.broadcast_drafts drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.broadcast_drafts
  add constraint broadcast_drafts_audience_preset_check
  check (
    audience_preset in (
      'all_customers',
      'vip_customers',
      'big_spenders',
      'regulars',
      'loves_packages',
      'lapsed_customers',
      'no_appointment_30',
      'no_appointment_60',
      'new_customers',
      'upcoming_appointments',
      'cancelled_appointments'
    )
  );
