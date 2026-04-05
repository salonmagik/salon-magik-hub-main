-- Migration: Extend customer_reactivation_campaigns table for Termii WhatsApp provider support
-- Story: US-007A - Add Termii Configuration Fields
-- Date: 2026-03-29

-- Add whatsapp_provider column to specify which WhatsApp provider to use for campaigns
alter table public.customer_reactivation_campaigns
  add column if not exists whatsapp_provider text check (whatsapp_provider in ('meta', 'termii'));

-- Add termii_template_id column to store Termii template ID for WhatsApp campaigns
alter table public.customer_reactivation_campaigns
  add column if not exists termii_template_id text;

-- Add termii_device_id column to store Termii device ID for WhatsApp campaigns
alter table public.customer_reactivation_campaigns
  add column if not exists termii_device_id text;

-- Set default value for existing campaigns to 'meta' for backward compatibility
update public.customer_reactivation_campaigns
set whatsapp_provider = 'meta'
where channel = 'whatsapp' and whatsapp_provider is null;

-- Add column comments for documentation
comment on column public.customer_reactivation_campaigns.whatsapp_provider is 'WhatsApp provider to use for this campaign: meta (Meta WhatsApp Business API) or termii (Termii WhatsApp API). Defaults to meta for backward compatibility.';
comment on column public.customer_reactivation_campaigns.termii_template_id is 'Termii template ID for WhatsApp campaigns when using termii provider. Must reference an approved template in whatsapp_templates table.';
comment on column public.customer_reactivation_campaigns.termii_device_id is 'Termii device ID for WhatsApp campaigns when using termii provider. Overrides tenant-level device ID if specified.';
