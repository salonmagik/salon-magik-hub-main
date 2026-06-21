-- Create ENUM for payment setup status
CREATE TYPE payment_setup_status AS ENUM ('pending_bank_account', 'subaccount_pending', 'ready', 'failed');

-- Add fields to tenants table
ALTER TABLE tenants
ADD COLUMN payment_setup_status payment_setup_status NOT NULL DEFAULT 'pending_bank_account',
ADD COLUMN payment_setup_error TEXT,
ADD COLUMN platform_percentage_charge NUMERIC NOT NULL DEFAULT 10;

-- Add fields to salon_payout_destinations table
ALTER TABLE salon_payout_destinations
ADD COLUMN paystack_subaccount_code TEXT,
ADD COLUMN paystack_subaccount_id BIGINT,
ADD COLUMN paystack_subaccount_active BOOLEAN,
ADD COLUMN paystack_subaccount_status TEXT,
ADD COLUMN paystack_subaccount_error TEXT,
ADD COLUMN settlement_schedule TEXT NOT NULL DEFAULT 'manual';
