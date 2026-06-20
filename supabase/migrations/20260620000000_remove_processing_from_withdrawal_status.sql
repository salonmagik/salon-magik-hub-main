-- Migration: Update withdrawal flow to only debit wallet on webhook confirmation
-- Purpose: Wallet is now only debited when Paystack webhook confirms transfer success
-- 
-- New flow:
--   pending -> Transfer initiated, waiting for webhook
--   completed -> Transfer successful AND wallet debited via webhook
--   failed -> Transfer failed OR wallet debit failed
--
-- Note: We're keeping 'processing' in the enum for backward compatibility and to avoid
-- complex enum migrations, but the code will no longer use this status. All new withdrawals
-- will use 'pending' status until webhook confirms success.

-- Update any existing 'processing' withdrawals to 'pending'
-- They'll complete when the next webhook arrives (if it hasn't already)
UPDATE salon_withdrawals
SET status = 'pending'
WHERE status = 'processing';

-- Add a comment to document the change
COMMENT ON TYPE withdrawal_status IS 
  'Withdrawal status values: pending (transfer initiated, awaiting webhook), completed (transfer successful and wallet debited), failed (transfer failed or wallet debit failed). Note: "processing" status deprecated as of 2026-06-20 - kept for backward compatibility but no longer used.';

COMMENT ON COLUMN salon_withdrawals.status IS
  'Current status of the withdrawal. Use "pending" for initiated transfers, "completed" for successful transfers with wallet debited, "failed" for failed transfers. Status "processing" is deprecated and should not be used for new withdrawals.';

