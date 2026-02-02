-- Phase 1: Comprehensive Schema Updates

-- 1.1 Add image_urls to catalog items (max 2 images)
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- 1.2 Add customer status for VIP/blocked/inactive tracking
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vip', 'inactive', 'blocked'));

-- 1.3 Create vouchers table for gift cards
CREATE TABLE IF NOT EXISTS vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  amount numeric NOT NULL,
  balance numeric NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  purchased_by_customer_id uuid REFERENCES customers(id),
  redeemed_by_customer_id uuid REFERENCES customers(id),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant vouchers" ON vouchers 
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create vouchers" ON vouchers 
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update vouchers" ON vouchers 
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 1.4 Create staff_invitations table
CREATE TABLE IF NOT EXISTS staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by_id uuid,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant invitations" ON staff_invitations 
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create invitations" ON staff_invitations 
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update invitations" ON staff_invitations 
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 1.5 Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid,
  type text NOT NULL CHECK (type IN ('appointment', 'payment', 'customer', 'system', 'staff')),
  title text NOT NULL,
  description text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  urgent boolean NOT NULL DEFAULT false,
  entity_type text,
  entity_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant notifications" ON notifications 
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update notifications" ON notifications 
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create notifications" ON notifications 
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 1.6 Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  template_type text NOT NULL CHECK (template_type IN (
    'appointment_confirmation', 'appointment_reminder', 'appointment_cancelled',
    'booking_confirmation', 'payment_receipt', 'refund_confirmation',
    'staff_invitation', 'welcome'
  )),
  subject text NOT NULL,
  body_html text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, template_type)
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant templates" ON email_templates 
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create templates" ON email_templates 
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update templates" ON email_templates 
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 1.7 Create notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) UNIQUE,
  email_appointment_reminders boolean NOT NULL DEFAULT true,
  sms_appointment_reminders boolean NOT NULL DEFAULT false,
  email_new_bookings boolean NOT NULL DEFAULT true,
  email_cancellations boolean NOT NULL DEFAULT true,
  email_daily_digest boolean NOT NULL DEFAULT false,
  reminder_hours_before integer NOT NULL DEFAULT 24,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant notification settings" ON notification_settings 
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create notification settings" ON notification_settings 
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update notification settings" ON notification_settings 
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 1.8 Create message_logs table for delivery history
CREATE TABLE IF NOT EXISTS message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  template_type text,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  credits_used integer NOT NULL DEFAULT 1,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant message logs" ON message_logs 
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create message logs" ON message_logs 
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 1.9 Create catalog-images storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('catalog-images', 'catalog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for catalog-images bucket
CREATE POLICY "Authenticated users can upload catalog images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'catalog-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Anyone can view catalog images"
ON storage.objects FOR SELECT
USING (bucket_id = 'catalog-images');

CREATE POLICY "Authenticated users can update own catalog images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'catalog-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete catalog images"
ON storage.objects FOR DELETE
USING (bucket_id = 'catalog-images' AND auth.role() = 'authenticated');

-- Add updated_at triggers for new tables
CREATE TRIGGER update_vouchers_updated_at
  BEFORE UPDATE ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();