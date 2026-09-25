-- When a tenant has exactly one payout destination, there's no real
-- choice to make — it should just cover everything: the General wallet
-- (is_default) and every branch (location_ids), kept in sync as branches
-- and destinations are added or removed. The moment a second destination
-- exists, this stops — from then on it's a genuine choice, made from the
-- Accounts tab or nudged during withdrawal.
create or replace function public.sync_solo_payout_destination_coverage(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dest_id uuid;
begin
  select id into v_dest_id
  from public.salon_payout_destinations
  where tenant_id = p_tenant_id;

  if v_dest_id is null then
    return;
  end if;

  if (select count(*) from public.salon_payout_destinations where tenant_id = p_tenant_id) <> 1 then
    return;
  end if;

  update public.salon_payout_destinations
  set is_default = true,
      location_ids = coalesce(
        (select array_agg(id) from public.locations where tenant_id = p_tenant_id),
        '{}'
      )
  where id = v_dest_id
    and (is_default is distinct from true
      or location_ids is distinct from coalesce(
        (select array_agg(id) from public.locations where tenant_id = p_tenant_id),
        '{}'
      ));
end;
$$;

create or replace function public.trg_sync_solo_payout_destination_coverage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_solo_payout_destination_coverage(coalesce(new.tenant_id, old.tenant_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists salon_payout_destinations_sync_solo_coverage on public.salon_payout_destinations;
create trigger salon_payout_destinations_sync_solo_coverage
after insert or delete on public.salon_payout_destinations
for each row execute function public.trg_sync_solo_payout_destination_coverage();

drop trigger if exists locations_sync_solo_payout_coverage on public.locations;
create trigger locations_sync_solo_payout_coverage
after insert or delete on public.locations
for each row execute function public.trg_sync_solo_payout_destination_coverage();

-- Backfill: fix any tenant that already has exactly one destination today
-- (e.g. created before "Set as default" existed, like the bug report this
-- migration follows from).
do $$
declare r record;
begin
  for r in select distinct tenant_id from public.salon_payout_destinations loop
    perform public.sync_solo_payout_destination_coverage(r.tenant_id);
  end loop;
end $$;
