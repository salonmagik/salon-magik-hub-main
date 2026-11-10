-- Annual location pricing is derived from the monthly tier price. Existing
-- non-custom tiers created before the backoffice editor used this rule may
-- have a null annual value, so backfill them at a zero annual discount.
update public.additional_location_pricing
set price_per_location_annual = round(price_per_location * 12, 2)
where not is_custom
  and price_per_location is not null
  and price_per_location_annual is null;
