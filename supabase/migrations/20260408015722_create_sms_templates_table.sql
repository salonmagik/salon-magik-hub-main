-- Create SMS templates table for managing SMS message templates
-- This table stores customizable SMS templates with auto-send triggers

CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  auto_send_enabled BOOLEAN DEFAULT false,
  auto_send_trigger TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure unique template per tenant
  CONSTRAINT sms_templates_tenant_type_unique UNIQUE (tenant_id, template_type),
  
  -- Validate template types
  CONSTRAINT sms_templates_type_check CHECK (
    template_type IN (
      'appointment_confirmation',
      'appointment_reminder',
      'appointment_cancelled',
      'payment_receipt'
    )
  ),
  
  -- Validate auto-send triggers
  CONSTRAINT sms_templates_trigger_check CHECK (
    auto_send_trigger IS NULL OR auto_send_trigger IN (
      'on_booking',
      '24h_before',
      'on_cancellation',
      'on_payment'
    )
  )
);

-- Create index on tenant_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_sms_templates_tenant_id ON sms_templates(tenant_id);

-- Create index on template_type for filtering
CREATE INDEX IF NOT EXISTS idx_sms_templates_type ON sms_templates(template_type);

-- Add RLS policies
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to view SMS templates for their tenant
CREATE POLICY sms_templates_select_policy ON sms_templates
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Policy: Allow users to insert SMS templates for their tenant
CREATE POLICY sms_templates_insert_policy ON sms_templates
  FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Policy: Allow users to update SMS templates for their tenant
CREATE POLICY sms_templates_update_policy ON sms_templates
  FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Policy: Allow users to delete SMS templates for their tenant
CREATE POLICY sms_templates_delete_policy ON sms_templates
  FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sms_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sms_templates_updated_at_trigger
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_templates_updated_at();

-- Add column comments for documentation
COMMENT ON TABLE sms_templates IS 'Stores SMS templates with auto-send configuration';
COMMENT ON COLUMN sms_templates.template_type IS 'Type of SMS template (appointment_confirmation, appointment_reminder, etc.)';
COMMENT ON COLUMN sms_templates.message IS 'SMS message content with variable placeholders like {{customer_name}}';
COMMENT ON COLUMN sms_templates.is_active IS 'Whether this template is active and can be used';
COMMENT ON COLUMN sms_templates.auto_send_enabled IS 'Whether to automatically send this SMS on trigger events';
COMMENT ON COLUMN sms_templates.auto_send_trigger IS 'Trigger event for auto-sending (on_booking, 24h_before, etc.)';
