-- Fix the security definer view issue by setting security_invoker
ALTER VIEW public.public_booking_tenants SET (security_invoker = true);