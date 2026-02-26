-- WARNING: DESTRUCTIVE
-- Wipes backoffice-domain records, sales ops records, and related auth users.
-- Run in SQL editor per environment after backup.

begin;

create temporary table _backoffice_user_ids on commit drop as
select user_id
from public.backoffice_users;

-- Storage documents tied to sales-agent KYC.
-- NOTE: Supabase blocks direct SQL delete from storage.objects.
-- Empty this bucket via Storage API or Dashboard:
--   Bucket: sales-agent-kyc-docs

-- Sales ops / revenue ops domain.
do $$
begin
  if to_regclass('public.sales_commission_ledger') is not null then
    execute 'truncate table public.sales_commission_ledger cascade';
  end if;
  if to_regclass('public.sales_targets') is not null then
    execute 'truncate table public.sales_targets cascade';
  end if;
  if to_regclass('public.annual_lockin_events') is not null then
    execute 'truncate table public.annual_lockin_events cascade';
  end if;
  if to_regclass('public.annual_lockin_offers') is not null then
    execute 'truncate table public.annual_lockin_offers cascade';
  end if;
  if to_regclass('public.sales_promo_redemptions') is not null then
    execute 'truncate table public.sales_promo_redemptions cascade';
  end if;
  if to_regclass('public.sales_promo_codes') is not null then
    execute 'truncate table public.sales_promo_codes cascade';
  end if;
  if to_regclass('public.sales_promo_campaigns') is not null then
    execute 'truncate table public.sales_promo_campaigns cascade';
  end if;
  if to_regclass('public.sales_agent_documents') is not null then
    execute 'truncate table public.sales_agent_documents cascade';
  end if;
  if to_regclass('public.sales_agent_kyc') is not null then
    execute 'truncate table public.sales_agent_kyc cascade';
  end if;
  if to_regclass('public.sales_agents') is not null then
    execute 'truncate table public.sales_agents cascade';
  end if;
end $$;

-- Backoffice security/auth domain.
do $$
begin
  if to_regclass('public.backoffice_user_role_assignments') is not null then
    execute 'truncate table public.backoffice_user_role_assignments cascade';
  end if;
  if to_regclass('public.backoffice_role_template_permissions') is not null then
    execute 'truncate table public.backoffice_role_template_permissions cascade';
  end if;
  if to_regclass('public.backoffice_role_template_pages') is not null then
    execute 'truncate table public.backoffice_role_template_pages cascade';
  end if;
  if to_regclass('public.backoffice_role_templates') is not null then
    execute 'truncate table public.backoffice_role_templates cascade';
  end if;
  if to_regclass('public.backoffice_sessions') is not null then
    execute 'truncate table public.backoffice_sessions cascade';
  end if;
  if to_regclass('public.backoffice_step_up_challenges') is not null then
    execute 'truncate table public.backoffice_step_up_challenges cascade';
  end if;
  if to_regclass('public.maintenance_events') is not null then
    execute 'truncate table public.maintenance_events cascade';
  end if;
  if to_regclass('public.impersonation_sessions') is not null then
    execute 'truncate table public.impersonation_sessions cascade';
  end if;
end $$;

-- Feature-flag runtime and audit domain.
delete from public.feature_flags
where lower(name) in ('waitlist_enabled', 'other_countries_interest_enabled')
   or feature_id in (
     select id
     from public.platform_features
     where lower(feature_key) in ('waitlist_enabled', 'other_countries_interest_enabled')
   );

update public.platform_features
set
  master_enabled = false,
  default_enabled = false,
  updated_at = now()
where lower(feature_key) in ('waitlist_enabled', 'other_countries_interest_enabled');

-- Optional: clear backoffice/security audit logs for a full clean slate.
delete from public.audit_logs
where entity_type in (
  'backoffice_users',
  'backoffice_role_templates',
  'backoffice_user_role_assignments',
  'feature_flags',
  'platform_features',
  'feature_flag_rules',
  'sales_agents',
  'sales_agent_kyc',
  'sales_agent_documents',
  'sales_promo_campaigns',
  'sales_promo_codes',
  'sales_promo_redemptions',
  'sales_commission_ledger'
);

-- Remove backoffice user rows and linked auth users.
delete from public.backoffice_users;

delete from public.profiles p
using _backoffice_user_ids b
where p.user_id = b.user_id;

delete from auth.users u
using _backoffice_user_ids b
where u.id = b.user_id;

commit;
