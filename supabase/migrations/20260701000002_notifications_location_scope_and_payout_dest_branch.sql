-- Add location_id to notifications for branch-scoped notification filtering.
-- NULL = tenant-wide (visible to all branches); populated = branch-specific.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_location_id
  ON public.notifications(location_id);

-- Add location_id to salon_payout_destinations for per-branch payout account config.
-- NULL = tenant default (applies to any branch without a specific account);
-- populated = this destination belongs to a specific branch.
ALTER TABLE public.salon_payout_destinations
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_salon_payout_destinations_location_id
  ON public.salon_payout_destinations(location_id);
