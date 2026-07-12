-- Migrate sms_provider column from txtconnect/termii to arkesel.
-- Arkesel is now the unified SMS delivery provider for both Nigeria and Ghana.

-- Drop the existing check constraint
alter table public.tenants
  drop constraint if exists tenants_sms_provider_check;

-- Update all existing rows to reflect the new provider
update public.tenants
  set sms_provider = 'arkesel'
  where sms_provider in ('txtconnect', 'termii');

-- Add updated constraint that includes arkesel
alter table public.tenants
  add constraint tenants_sms_provider_check
  check (sms_provider in ('arkesel', 'termii', 'txtconnect'));

-- Update the column default to arkesel
alter table public.tenants
  alter column sms_provider set default 'arkesel';

comment on column public.tenants.sms_provider is 'SMS delivery provider. arkesel is the active provider for NG and GH.';
