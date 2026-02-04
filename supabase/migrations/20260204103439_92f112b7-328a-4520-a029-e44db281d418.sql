-- Create waitlist status enum
CREATE TYPE public.waitlist_status AS ENUM ('pending', 'invited', 'converted', 'rejected');

-- Create waitlist_leads table for lead capture
CREATE TABLE public.waitlist_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  country TEXT NOT NULL,
  plan_interest TEXT, -- solo, studio, chain
  team_size TEXT, -- 1, 2-5, 6-10, 11+
  notes TEXT,
  status public.waitlist_status NOT NULL DEFAULT 'pending',
  position INTEGER,
  invitation_token TEXT UNIQUE,
  invitation_expires_at TIMESTAMP WITH TIME ZONE,
  approved_by_id UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,
  converted_tenant_id UUID REFERENCES public.tenants(id),
  converted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_waitlist_leads_status ON public.waitlist_leads(status);
CREATE INDEX idx_waitlist_leads_email ON public.waitlist_leads(email);
CREATE INDEX idx_waitlist_leads_invitation_token ON public.waitlist_leads(invitation_token);

-- Create function to auto-assign position
CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
    FROM public.waitlist_leads;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for auto-position assignment
CREATE TRIGGER set_waitlist_position
  BEFORE INSERT ON public.waitlist_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_waitlist_position();

-- Add updated_at trigger
CREATE TRIGGER update_waitlist_leads_updated_at
  BEFORE UPDATE ON public.waitlist_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.waitlist_leads ENABLE ROW LEVEL SECURITY;

-- RLS: Anon can insert (submit waitlist form)
CREATE POLICY "Anon can submit to waitlist"
  ON public.waitlist_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- RLS: Authenticated users cannot access (BackOffice will use service role)
-- No SELECT/UPDATE/DELETE policies for regular users