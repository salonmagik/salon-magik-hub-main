-- staff_operations_addon_pricing was never seeded on any environment — the
-- Enable/Disable toggle on the Staff Operations add-on requires a valid
-- *active* pricing row for the tenant's country+currency (hasValidPrice in
-- useStaffOperationsAddon), so with zero rows the toggle stayed disabled
-- for every tenant regardless of plan tier, including chain. Placeholder
-- starter prices — adjust via Backoffice > Plans > Staff Operations
-- pricing, which already has full add/edit support for this table.
insert into public.staff_operations_addon_pricing (country_code, currency, unit_price_per_location, status, notes)
select * from (values
  ('NG', 'NGN', 2500, 'active', 'Starter price — adjust via Backoffice > Plans.'),
  ('GH', 'GHS', 30, 'active', 'Starter price — adjust via Backoffice > Plans.')
) as seed(country_code, currency, unit_price_per_location, status, notes)
where not exists (
  select 1 from public.staff_operations_addon_pricing existing
  where existing.country_code = seed.country_code
    and existing.currency = seed.currency
    and existing.status = 'active'
);
