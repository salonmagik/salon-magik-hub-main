-- tenants.brand_color defaulted to '#2563EB' (the old blue scheme) since
-- migration 20260203235035. Every tenant in the system still carries that
-- exact value with zero divergence, confirming no merchant has actually
-- customized it yet — it's purely inherited seed data. Updates the column
-- default for new signups going forward, and backfills existing rows that
-- still match the old default exactly (a real customization to a different
-- color, if any exist later, is left untouched by this WHERE clause).
alter table public.tenants
  alter column brand_color set default '#2E1F4E';

update public.tenants
set brand_color = '#2E1F4E'
where brand_color = '#2563EB';
