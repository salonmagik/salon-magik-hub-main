-- The customer_purse_topup webhook case credits the salon's payout wallet
-- via credit_salon_purse(p_entry_type => 'salon_purse_credit_purse_topup'),
-- but that entry_type was never added to the wallet_entry_type enum, so
-- every such credit silently failed (the caller catches the error so the
-- customer's own top-up still succeeds, but the salon's payout balance
-- never grows). Add the missing enum value so the credit can actually land.
ALTER TYPE wallet_entry_type ADD VALUE IF NOT EXISTS 'salon_purse_credit_purse_topup';
