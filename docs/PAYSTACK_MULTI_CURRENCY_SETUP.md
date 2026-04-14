# Multi-Currency Paystack Setup Guide

This document provides instructions for configuring and deploying the multi-currency Paystack payment system for SalonMagik.

## Overview

The system now supports two separate Paystack accounts for handling transactions in:
- **Nigerian Naira (NGN)** - Nigerian Paystack account
- **Ghanaian Cedi (GHS)** - Ghanaian Paystack account

## Environment Variables

### Required Secrets

You need to set the following environment variables in your Supabase project:

```bash
PAYSTACK_SECRET_KEY_NG=sk_live_xxx    # Nigerian Paystack account secret key
PAYSTACK_SECRET_KEY_GH=sk_live_xxx    # Ghanaian Paystack account secret key
```

### Setting Secrets Locally (for development/testing)

```bash
cd supabase

# Set test keys for local development
npx supabase secrets set PAYSTACK_SECRET_KEY_NG=sk_test_your_ng_key_here
npx supabase secrets set PAYSTACK_SECRET_KEY_GH=sk_test_your_gh_key_here
```

### Setting Secrets in Production

```bash
# Get your project reference
npx supabase projects list

# Set production keys
npx supabase secrets set --project-ref YOUR_PROJECT_REF PAYSTACK_SECRET_KEY_NG=sk_live_your_ng_key_here
npx supabase secrets set --project-ref YOUR_PROJECT_REF PAYSTACK_SECRET_KEY_GH=sk_live_your_gh_key_here

# Verify secrets are set
npx supabase secrets list --project-ref YOUR_PROJECT_REF
```

## Paystack Dashboard Configuration

### Webhook URLs

You need to configure webhook URLs in **both** Paystack accounts (Nigerian and Ghanaian).

#### Nigerian Paystack Account
1. Log in to your Nigerian Paystack dashboard
2. Navigate to **Settings → Webhooks**
3. Add webhook URL: `https://your-supabase-project.supabase.co/functions/v1/payment-webhook-ng`
4. Save the configuration

#### Ghanaian Paystack Account
1. Log in to your Ghanaian Paystack dashboard
2. Navigate to **Settings → Webhooks**
3. Add webhook URL: `https://your-supabase-project.supabase.co/functions/v1/payment-webhook-gh`
4. Save the configuration

### Important Notes
- Each webhook URL uses the currency-specific secret key for signature verification
- The webhook processor is shared, so both webhooks handle all payment intent types
- Do not remove the old `payment-webhook` endpoint immediately - keep it active for 7 days after deployment for any in-flight transactions

## Deployment Steps

### 1. Deploy Edge Functions

Deploy all the updated functions:

```bash
# Deploy payment session functions
npx supabase functions deploy create-payment-session
npx supabase functions deploy create-invoice-payment-session
npx supabase functions deploy create-public-booking
npx supabase functions deploy process-salon-withdrawal

# Deploy new webhook functions
npx supabase functions deploy payment-webhook-ng
npx supabase functions deploy payment-webhook-gh

# Deploy bank/payout functions
npx supabase functions deploy get-banks-and-momo-providers
npx supabase functions deploy verify-bank-account
npx supabase functions deploy create-payout-destination

# Or deploy all at once
npx supabase functions deploy
```

### 2. Verify Deployment

Test each webhook endpoint:

```bash
# Test Nigerian webhook (NGN)
curl -X POST https://your-project.supabase.co/functions/v1/payment-webhook-ng \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: test" \
  -d '{"event":"charge.success","data":{"reference":"test"}}'

# Test Ghanaian webhook (GHS)
curl -X POST https://your-project.supabase.co/functions/v1/payment-webhook-gh \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: test" \
  -d '{"event":"charge.success","data":{"reference":"test"}}'
```

Expected response: `{"error": "Invalid signature"}` (this is correct - it means the webhook is running)

### 3. Test End-to-End Flow

#### Test NGN Payment Flow
1. Create a test salon with `currency='NGN'`
2. Initiate a payment session via `create-payment-session`
3. Complete the payment using Paystack's test cards
4. Verify the webhook is received at `payment-webhook-ng`
5. Check that the payment is processed correctly

#### Test GHS Payment Flow
1. Create a test salon with `currency='GHS'`
2. Initiate a payment session via `create-payment-session`
3. Complete the payment using Paystack's test cards
4. Verify the webhook is received at `payment-webhook-gh`
5. Check that the payment is processed correctly

## How Currency Routing Works

### Payment Initiation
1. When a payment session is created, the system:
   - Gets the transaction currency (or falls back to tenant's default currency)
   - Validates currency matches tenant's currency (blocks mismatches)
   - Selects the appropriate Paystack secret key based on currency:
     - `NGN` → Uses `PAYSTACK_SECRET_KEY_NG`
     - `GHS` → Uses `PAYSTACK_SECRET_KEY_GH`
   - Creates the Paystack transaction with the correct key

### Webhook Processing
1. When Paystack sends a webhook:
   - Nigerian account webhooks → `payment-webhook-ng` (uses `PAYSTACK_SECRET_KEY_NG` for verification)
   - Ghanaian account webhooks → `payment-webhook-gh` (uses `PAYSTACK_SECRET_KEY_GH` for verification)
   - Both webhooks use the shared `processWebhook()` function for business logic

### Withdrawals
1. When processing a salon withdrawal:
   - System fetches the salon's wallet currency
   - Selects the appropriate Paystack key based on wallet currency
   - Initiates the transfer with the correct Paystack account

## Updated Functions

### Payment Session Creation
- `create-payment-session` - Creates payment sessions with currency-specific keys
- `create-invoice-payment-session` - Creates invoice payment sessions
- `create-public-booking` - Handles public booking payments

### Webhook Processing
- `payment-webhook-ng` - Handles Nigerian Paystack webhooks (NGN)
- `payment-webhook-gh` - Handles Ghanaian Paystack webhooks (GHS)
- `_shared/payment-webhook-processor.ts` - Shared webhook processing logic

### Withdrawals & Payouts
- `process-salon-withdrawal` - Processes salon withdrawals with currency-specific keys
- `create-payout-destination` - Creates payout destinations
- `get-banks-and-momo-providers` - Gets banks/mobile money providers
- `verify-bank-account` - Verifies bank account details

### Shared Utilities
- `_shared/paystack-helpers.ts` - Currency-to-key mapping and validation

## Troubleshooting

### Issue: "Paystack not configured for currency X"
**Solution:** Verify that the environment variable is set:
```bash
npx supabase secrets list --project-ref YOUR_PROJECT_REF
```

### Issue: Webhook signature verification failing
**Solution:** 
1. Check that the correct webhook URL is configured in the Paystack dashboard
2. Verify the secret key matches the account
3. Check Supabase function logs: `npx supabase functions logs payment-webhook-ng`

### Issue: Currency mismatch errors
**Solution:** 
- Ensure the tenant's `currency` field matches their actual operating currency
- Check that payment requests use the same currency as the tenant

### Issue: Payments not processing
**Solution:**
1. Check Paystack dashboard for transaction status
2. Check Supabase function logs for errors
3. Verify webhook was received (check `payment_intents` table for status updates)

## Migration Notes

### Backward Compatibility
- The old `PAYSTACK_SECRET_KEY` environment variable is **no longer used**
- All references have been replaced with currency-specific keys
- The old `payment-webhook` function can be kept for 7 days then removed

### Database Schema
No database migrations are required. The system uses existing tables:
- `tenants.currency` - Determines which Paystack account to use
- `payment_intents` - Stores payment information
- `transactions` - Records completed transactions
- `salon_wallets` - Wallet balances and currency

## Support

For issues or questions:
1. Check function logs: `npx supabase functions logs <function-name>`
2. Review Paystack dashboard for transaction details
3. Check the codebase documentation in `/supabase/functions/_shared/paystack-helpers.ts`

## Rollback Plan

If you need to rollback:
1. Revert the function deployments
2. Keep the environment variables (they don't break anything)
3. Update webhook URLs back to the old `payment-webhook` endpoint
4. Deploy the previous version of functions
