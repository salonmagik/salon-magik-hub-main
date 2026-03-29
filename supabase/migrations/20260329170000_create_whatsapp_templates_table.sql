-- Migration: Create whatsapp_templates table
-- Description: Store WhatsApp template configurations for Termii and Meta providers
-- Author: Ralph Agent
-- Date: 2026-03-29

-- Create whatsapp_templates table
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_id TEXT, -- Termii template ID (assigned after approval)
  template_content JSONB NOT NULL, -- Template structure with placeholders
  variables TEXT[] DEFAULT '{}', -- Array of variable names/placeholders
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  provider TEXT NOT NULL DEFAULT 'termii' CHECK (provider IN ('termii', 'meta')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  -- Ensure unique template names per tenant
  CONSTRAINT whatsapp_templates_tenant_name_unique UNIQUE (tenant_id, template_name)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant_id ON whatsapp_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_provider ON whatsapp_templates(provider);

-- Add column comments for documentation
COMMENT ON TABLE whatsapp_templates IS 'Stores WhatsApp template configurations for multi-provider messaging (Termii/Meta)';
COMMENT ON COLUMN whatsapp_templates.id IS 'Primary key UUID';
COMMENT ON COLUMN whatsapp_templates.tenant_id IS 'Foreign key to tenants table (which salon owns this template)';
COMMENT ON COLUMN whatsapp_templates.template_name IS 'Unique name for the template within tenant scope';
COMMENT ON COLUMN whatsapp_templates.template_id IS 'Provider-assigned template ID (e.g., Termii template ID after approval)';
COMMENT ON COLUMN whatsapp_templates.template_content IS 'JSONB structure containing template body and placeholders';
COMMENT ON COLUMN whatsapp_templates.variables IS 'Array of variable names/placeholders used in template (e.g., ["customer_name", "appointment_time"])';
COMMENT ON COLUMN whatsapp_templates.status IS 'Approval status: pending (awaiting approval), approved (ready to use), rejected (needs revision)';
COMMENT ON COLUMN whatsapp_templates.provider IS 'WhatsApp provider: termii (Termii API) or meta (Meta WhatsApp Business API)';
COMMENT ON COLUMN whatsapp_templates.created_at IS 'Timestamp when template was created';
COMMENT ON COLUMN whatsapp_templates.updated_at IS 'Timestamp when template was last updated';

-- Enable RLS
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenants can SELECT their own templates
CREATE POLICY whatsapp_templates_select_policy ON whatsapp_templates
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM auth.users WHERE id = auth.uid()));

-- RLS Policy: Tenants can INSERT their own templates
CREATE POLICY whatsapp_templates_insert_policy ON whatsapp_templates
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM auth.users WHERE id = auth.uid()));

-- RLS Policy: Tenants can UPDATE their own templates
CREATE POLICY whatsapp_templates_update_policy ON whatsapp_templates
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM auth.users WHERE id = auth.uid()));

-- RLS Policy: Tenants can DELETE their own templates
CREATE POLICY whatsapp_templates_delete_policy ON whatsapp_templates
  FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM auth.users WHERE id = auth.uid()));

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_templates_updated_at_trigger
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_templates_updated_at();
