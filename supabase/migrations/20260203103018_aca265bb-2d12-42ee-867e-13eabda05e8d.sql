-- Phase 2: Package products support
ALTER TABLE package_items ADD COLUMN product_id UUID REFERENCES products(id);

-- Phase 5 & 6: Settings and banners for tenants
ALTER TABLE tenants 
ADD COLUMN logo_url TEXT,
ADD COLUMN banner_urls TEXT[] DEFAULT '{}',
ADD COLUMN auto_confirm_bookings BOOLEAN DEFAULT false,
ADD COLUMN default_buffer_minutes INTEGER DEFAULT 0,
ADD COLUMN cancellation_grace_hours INTEGER DEFAULT 24,
ADD COLUMN default_deposit_percentage NUMERIC DEFAULT 0,
ADD COLUMN booking_status_message TEXT;

-- Phase 15: Messaging channel support
ALTER TABLE email_templates 
ADD COLUMN channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp'));