-- Add browser_name column to staff_sessions so the UI can distinguish
-- Chrome vs Firefox vs Safari on the same device.
alter table public.staff_sessions
  add column if not exists browser_name text;
