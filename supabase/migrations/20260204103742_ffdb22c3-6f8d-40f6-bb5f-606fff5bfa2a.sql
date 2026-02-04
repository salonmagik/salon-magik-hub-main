-- Create feature flag scope enum
CREATE TYPE public.feature_flag_scope AS ENUM ('platform', 'app', 'tenant', 'feature');

-- Create feature_flags table
CREATE TABLE public.feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  scope public.feature_flag_scope NOT NULL DEFAULT 'platform',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  target_tenant_ids UUID[] DEFAULT '{}',
  schedule_start TIMESTAMP WITH TIME ZONE,
  schedule_end TIMESTAMP WITH TIME ZONE,
  reason TEXT,
  created_by_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_feature_flags_name ON public.feature_flags(name);
CREATE INDEX idx_feature_flags_is_enabled ON public.feature_flags(is_enabled);

-- Add updated_at trigger
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read active feature flags (needed for frontend checks)
CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags
  FOR SELECT
  USING (true);

-- Seed the waitlist_enabled flag (default: true for waitlist mode)
INSERT INTO public.feature_flags (name, description, scope, is_enabled, reason)
VALUES (
  'waitlist_enabled',
  'When enabled, new signups go through waitlist. When disabled, open access mode.',
  'platform',
  true,
  'Initial launch in waitlist mode'
);