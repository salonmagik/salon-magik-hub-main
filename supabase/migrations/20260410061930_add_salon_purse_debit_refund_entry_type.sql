-- Migration: Add salon_purse_debit_refund to wallet_entry_type enum
-- Story: Fix refund transactions to properly debit salon wallet
-- Description: Adds new entry type for tracking refunds that debit the salon wallet

-- Add new entry type to the wallet_entry_type enum
ALTER TYPE wallet_entry_type ADD VALUE IF NOT EXISTS 'salon_purse_debit_refund';

-- Add comment for documentation
COMMENT ON TYPE wallet_entry_type IS 'Enum for wallet ledger entry types. salon_purse_debit_refund tracks refunds where money is debited from salon wallet and credited to customer purse.';
