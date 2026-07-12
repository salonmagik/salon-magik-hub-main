-- Add Paystack plan codes to plan_pricing.
-- Two columns: monthly and annual, because Paystack creates separate Plan objects
-- per billing interval. Each plan_pricing row is already scoped to a currency, so
-- NGN rows map to the Nigeria Paystack account and GHS rows to Ghana's account.
ALTER TABLE public.plan_pricing
  ADD COLUMN IF NOT EXISTS paystack_plan_code_monthly text,
  ADD COLUMN IF NOT EXISTS paystack_plan_code_annual  text;
