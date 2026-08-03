-- sync_tenant_payment_setup_status (fires on every insert/delete against
-- salon_payout_destinations, for every tenant, country, and destination
-- type) tried to assign untyped string literals from a CASE expression to
-- tenants.payment_setup_status, a custom enum. Postgres couldn't infer the
-- enum type from the CASE branches and threw "column is of type
-- payment_setup_status but expression is of type text" — meaning every
-- payout destination creation attempt on the whole platform has been
-- failing at this trigger, not at the actual insert. Explicit casts fix it.
CREATE OR REPLACE FUNCTION public.sync_tenant_payment_setup_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_tenant_id uuid;
  v_has_destination boolean;
begin
  v_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  select exists (
    select 1 from public.salon_payout_destinations
    where tenant_id = v_tenant_id
  ) into v_has_destination;

  update public.tenants
  set payment_setup_status = case when v_has_destination then 'ready'::payment_setup_status else 'pending_bank_account'::payment_setup_status end
  where id = v_tenant_id;

  return coalesce(new, old);
end;
$function$;
