-- Create backoffice role enum
CREATE TYPE public.backoffice_role AS ENUM ('super_admin', 'admin', 'support_agent');

-- Create backoffice_allowed_domains table
CREATE TABLE public.backoffice_allowed_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backoffice_users table
CREATE TABLE public.backoffice_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  role public.backoffice_role NOT NULL DEFAULT 'support_agent',
  email_domain TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create maintenance_events table
CREATE TABLE public.maintenance_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- planned, emergency, incident
  scope TEXT NOT NULL DEFAULT 'platform', -- platform, app, tenant
  severity TEXT NOT NULL DEFAULT 'low', -- low, medium, high, critical
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_id UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create platform_settings table (key-value store)
CREATE TABLE public.platform_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_by_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_backoffice_users_user_id ON public.backoffice_users(user_id);
CREATE INDEX idx_maintenance_events_is_active ON public.maintenance_events(is_active);
CREATE INDEX idx_platform_settings_key ON public.platform_settings(key);

-- Add updated_at triggers
CREATE TRIGGER update_backoffice_users_updated_at
  BEFORE UPDATE ON public.backoffice_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_events_updated_at
  BEFORE UPDATE ON public.maintenance_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.backoffice_allowed_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backoffice_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Seed initial allowed domain
INSERT INTO public.backoffice_allowed_domains (domain) VALUES ('salonmagik.com');

-- Seed platform settings
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('kill_switch', '{"enabled": false, "reason": null}', 'Platform-wide read-only mode for emergencies'),
  ('domain_allowlist', '{"domains": ["salonmagik.com"]}', 'Allowed email domains for BackOffice access');