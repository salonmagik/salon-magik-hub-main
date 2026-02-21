# Technical PRD: Purse Implementation with Paystack

**Version:** 2.1  
**Last Updated:** 2026-02-21  
**Status:** Implementation Ready  
**Scope:** GH/NG markets only (Paystack)

---

## 1. Summary

Implement a dual-purse system (Customer + Salon) with Paystack integration for:

- Customer topups and booking payments
- Salon receipt of payments and withdrawals to bank/momo
- Invoice payments credited to salon purse
- Messaging credit purchases from salon purse or Paystack

### Key Features

| Feature | Description |
|---------|-------------|
| Customer Purse Topup | Customers can add funds via Paystack (GH/NG) |
| Booking Payments | Pay from purse, Paystack, or split (purse + Paystack) |
| Salon Purse Credits | Receive payments from bookings, invoices, customer purses, topup links |
| Invoice Payment Links | Generate Paystack links for invoices; funds go to salon purse |
| Withdrawals | Salon withdraws to bank account or mobile money via Paystack |
| Messaging Credits | Purchase from salon purse or directly via Paystack |

---

## 2. What Exists vs. What to Build

| Feature | Status | Action |
|---------|--------|--------|
| `customer_purses` table | ✅ Exists | Extend with ledger |
| Customer purse hooks | ✅ Exists | Enhance for topup flow |
| `salon_wallets` table | ❌ Missing | **Create** |
| `wallet_ledger_entries` table | ❌ Missing | **Create** |
| `salon_payout_destinations` table | ❌ Missing | **Create** |
| `salon_withdrawals` table | ❌ Missing | **Create** |
| Paystack payment init | ✅ Exists | Extend `intent_type` |
| Paystack webhook | ✅ Exists | Extend for purse flows |
| Paystack transfers | ❌ Missing | **Create** |
| Invoice payment link | ❌ Missing | **Create** |
| Credit purchase from purse | ❌ Missing | **Create** |

---

## 3. Database Migrations

### 3.1 New Tables

```sql
-- 1. Salon Wallets
CREATE TABLE salon_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'NGN',
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Unified Wallet Ledger
CREATE TYPE wallet_type AS ENUM ('customer', 'salon');
CREATE TYPE wallet_entry_type AS ENUM (
  'customer_purse_topup',
  'customer_purse_debit_booking',
  'customer_purse_debit_invoice',
  'customer_purse_reversal',
  'salon_purse_credit_booking',
  'salon_purse_credit_invoice',
  'salon_purse_topup',
  'salon_purse_withdrawal',
  'salon_purse_reversal',
  'salon_purse_debit_credit_purchase'
);

CREATE TABLE wallet_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_type wallet_type NOT NULL,
  wallet_id UUID NOT NULL,
  entry_type wallet_entry_type NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference_type TEXT, -- 'appointment', 'invoice', 'withdrawal', 'credit_purchase'
  reference_id UUID,
  gateway TEXT,
  gateway_reference TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wallet_ledger_idempotency_idx 
  ON wallet_ledger_entries(tenant_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX wallet_ledger_wallet_idx
  ON wallet_ledger_entries(wallet_type, wallet_id, created_at DESC);

-- 3. Payout Destinations
CREATE TYPE payout_destination_type AS ENUM ('bank', 'mobile_money');

CREATE TABLE salon_payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  destination_type payout_destination_type NOT NULL,
  country TEXT NOT NULL, -- 'NG' or 'GH'
  currency TEXT NOT NULL, -- 'NGN' or 'GHS'
  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  momo_provider TEXT, -- 'mtn', 'vodafone', 'airteltigo'
  momo_number TEXT,
  paystack_recipient_code TEXT, -- Created via Paystack API
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Withdrawals
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE salon_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  salon_wallet_id UUID NOT NULL REFERENCES salon_wallets(id),
  payout_destination_id UUID NOT NULL REFERENCES salon_payout_destinations(id),
  currency TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'pending',
  paystack_transfer_code TEXT,
  paystack_reference TEXT,
  failure_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Messaging Credit Purchases (audit)
CREATE TABLE messaging_credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  paid_via TEXT NOT NULL, -- 'salon_purse' | 'paystack'
  payment_intent_id UUID,
  gateway_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Extend Existing Tables

```sql
-- Extend payment_intents for intent classification
ALTER TABLE payment_intents 
  ADD COLUMN IF NOT EXISTS intent_type TEXT;
-- Values: 'appointment_payment' | 'invoice_payment' | 'customer_purse_topup' 
--         | 'salon_purse_topup' | 'messaging_credit_purchase'

-- Extend invoices for payment link
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID;

-- Add minimum withdrawal amounts to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS min_withdrawal_ngn NUMERIC(10,2) DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS min_withdrawal_ghs NUMERIC(10,2) DEFAULT 50;
```

### 3.3 Auto-create Salon Wallet Trigger

```sql
-- Create salon wallet when tenant is created
CREATE OR REPLACE FUNCTION create_salon_wallet_for_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO salon_wallets (tenant_id, currency)
  VALUES (NEW.id, COALESCE(NEW.currency, 'NGN'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_salon_wallet
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_salon_wallet_for_tenant();

-- Backfill existing tenants
INSERT INTO salon_wallets (tenant_id, currency)
SELECT id, COALESCE(currency, 'NGN')
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM salon_wallets);
```

---

## 4. Database Functions (RPCs)

### 4.1 Credit Customer Purse

```sql
CREATE OR REPLACE FUNCTION credit_customer_purse(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_idempotency_key TEXT,
  p_gateway_reference TEXT
) RETURNS UUID AS $$
DECLARE
  v_purse_id UUID;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_entry_id UUID;
BEGIN
  -- Check idempotency first
  SELECT id INTO v_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id; -- Already processed
  END IF;

  -- Lock and get purse
  SELECT id, balance INTO v_purse_id, v_balance_before
  FROM customer_purses
  WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
  FOR UPDATE;
  
  -- Create purse if not exists
  IF v_purse_id IS NULL THEN
    INSERT INTO customer_purses (tenant_id, customer_id, balance)
    VALUES (p_tenant_id, p_customer_id, 0)
    RETURNING id, balance INTO v_purse_id, v_balance_before;
  END IF;
  
  v_balance_after := v_balance_before + p_amount;
  
  -- Update balance
  UPDATE customer_purses SET balance = v_balance_after, updated_at = now()
  WHERE id = v_purse_id;
  
  -- Create ledger entry
  INSERT INTO wallet_ledger_entries (
    tenant_id, wallet_type, wallet_id, entry_type, currency,
    amount, balance_before, balance_after, gateway, gateway_reference, idempotency_key
  ) VALUES (
    p_tenant_id, 'customer', v_purse_id, 'customer_purse_topup', p_currency,
    p_amount, v_balance_before, v_balance_after, 'paystack', p_gateway_reference, p_idempotency_key
  ) RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;
```

### 4.2 Debit Customer Purse for Booking

```sql
CREATE OR REPLACE FUNCTION debit_customer_purse_for_booking(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_appointment_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_idempotency_key TEXT
) RETURNS UUID AS $$
DECLARE
  v_purse_id UUID;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_entry_id UUID;
BEGIN
  -- Check idempotency
  SELECT id INTO v_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- Lock and get purse
  SELECT id, balance INTO v_purse_id, v_balance_before
  FROM customer_purses
  WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
  FOR UPDATE;
  
  IF v_purse_id IS NULL OR v_balance_before < p_amount THEN
    RAISE EXCEPTION 'Insufficient purse balance';
  END IF;
  
  v_balance_after := v_balance_before - p_amount;
  
  -- Update balance
  UPDATE customer_purses SET balance = v_balance_after, updated_at = now()
  WHERE id = v_purse_id;
  
  -- Create ledger entry
  INSERT INTO wallet_ledger_entries (
    tenant_id, wallet_type, wallet_id, entry_type, currency,
    amount, balance_before, balance_after, reference_type, reference_id, idempotency_key
  ) VALUES (
    p_tenant_id, 'customer', v_purse_id, 'customer_purse_debit_booking', p_currency,
    -p_amount, v_balance_before, v_balance_after, 'appointment', p_appointment_id, p_idempotency_key
  ) RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 Credit Salon Purse

```sql
CREATE OR REPLACE FUNCTION credit_salon_purse(
  p_tenant_id UUID,
  p_entry_type wallet_entry_type,
  p_reference_type TEXT,
  p_reference_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_idempotency_key TEXT,
  p_gateway_reference TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_wallet_id UUID;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_entry_id UUID;
BEGIN
  -- Check idempotency
  SELECT id INTO v_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- Lock and get wallet
  SELECT id, balance INTO v_wallet_id, v_balance_before
  FROM salon_wallets
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;
  
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Salon wallet not found for tenant';
  END IF;
  
  v_balance_after := v_balance_before + p_amount;
  
  -- Update balance
  UPDATE salon_wallets SET balance = v_balance_after, updated_at = now()
  WHERE id = v_wallet_id;
  
  -- Create ledger entry
  INSERT INTO wallet_ledger_entries (
    tenant_id, wallet_type, wallet_id, entry_type, currency,
    amount, balance_before, balance_after, reference_type, reference_id,
    gateway, gateway_reference, idempotency_key
  ) VALUES (
    p_tenant_id, 'salon', v_wallet_id, p_entry_type, p_currency,
    p_amount, v_balance_before, v_balance_after, p_reference_type, p_reference_id,
    'paystack', p_gateway_reference, p_idempotency_key
  ) RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;
```

### 4.4 Debit Salon Purse for Withdrawal

```sql
CREATE OR REPLACE FUNCTION debit_salon_purse_for_withdrawal(
  p_tenant_id UUID,
  p_withdrawal_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_idempotency_key TEXT
) RETURNS UUID AS $$
DECLARE
  v_wallet_id UUID;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_entry_id UUID;
  v_min_amount NUMERIC;
BEGIN
  -- Check idempotency
  SELECT id INTO v_entry_id
  FROM wallet_ledger_entries
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- Get minimum withdrawal amount
  SELECT CASE 
    WHEN p_currency = 'NGN' THEN COALESCE(min_withdrawal_ngn, 1000)
    WHEN p_currency = 'GHS' THEN COALESCE(min_withdrawal_ghs, 50)
    ELSE 0
  END INTO v_min_amount
  FROM tenants WHERE id = p_tenant_id;

  IF p_amount < v_min_amount THEN
    RAISE EXCEPTION 'Amount below minimum withdrawal: %', v_min_amount;
  END IF;

  -- Lock and get wallet
  SELECT id, balance INTO v_wallet_id, v_balance_before
  FROM salon_wallets
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;
  
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Salon wallet not found';
  END IF;
  
  IF v_balance_before < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;
  
  v_balance_after := v_balance_before - p_amount;
  
  -- Update balance
  UPDATE salon_wallets SET balance = v_balance_after, updated_at = now()
  WHERE id = v_wallet_id;
  
  -- Create ledger entry
  INSERT INTO wallet_ledger_entries (
    tenant_id, wallet_type, wallet_id, entry_type, currency,
    amount, balance_before, balance_after, reference_type, reference_id, idempotency_key
  ) VALUES (
    p_tenant_id, 'salon', v_wallet_id, 'salon_purse_withdrawal', p_currency,
    -p_amount, v_balance_before, v_balance_after, 'withdrawal', p_withdrawal_id, p_idempotency_key
  ) RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;
```

### 4.5 Reversal Entry

```sql
CREATE OR REPLACE FUNCTION create_wallet_reversal(
  p_original_entry_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
) RETURNS UUID AS $$
DECLARE
  v_original wallet_ledger_entries%ROWTYPE;
  v_wallet_balance NUMERIC;
  v_new_balance NUMERIC;
  v_entry_id UUID;
  v_reversal_type wallet_entry_type;
BEGIN
  -- Check idempotency
  SELECT id INTO v_entry_id
  FROM wallet_ledger_entries
  WHERE idempotency_key = p_idempotency_key;
  
  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  -- Get original entry
  SELECT * INTO v_original FROM wallet_ledger_entries WHERE id = p_original_entry_id;
  
  IF v_original IS NULL THEN
    RAISE EXCEPTION 'Original entry not found';
  END IF;

  -- Determine reversal type
  v_reversal_type := CASE v_original.wallet_type
    WHEN 'customer' THEN 'customer_purse_reversal'::wallet_entry_type
    WHEN 'salon' THEN 'salon_purse_reversal'::wallet_entry_type
  END;

  -- Lock and update wallet
  IF v_original.wallet_type = 'customer' THEN
    SELECT balance INTO v_wallet_balance
    FROM customer_purses WHERE id = v_original.wallet_id FOR UPDATE;
    
    v_new_balance := v_wallet_balance - v_original.amount; -- Reverse the amount
    
    UPDATE customer_purses SET balance = v_new_balance, updated_at = now()
    WHERE id = v_original.wallet_id;
  ELSE
    SELECT balance INTO v_wallet_balance
    FROM salon_wallets WHERE id = v_original.wallet_id FOR UPDATE;
    
    v_new_balance := v_wallet_balance - v_original.amount;
    
    UPDATE salon_wallets SET balance = v_new_balance, updated_at = now()
    WHERE id = v_original.wallet_id;
  END IF;

  -- Create reversal entry
  INSERT INTO wallet_ledger_entries (
    tenant_id, wallet_type, wallet_id, entry_type, currency,
    amount, balance_before, balance_after, reference_type, reference_id,
    idempotency_key, metadata
  ) VALUES (
    v_original.tenant_id, v_original.wallet_type, v_original.wallet_id, v_reversal_type, v_original.currency,
    -v_original.amount, v_wallet_balance, v_new_balance, 'reversal', v_original.id,
    p_idempotency_key, jsonb_build_object('reason', p_reason, 'original_entry_id', p_original_entry_id)
  ) RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Edge Functions

### 5.1 Extend `create-payment-session`

**File:** `supabase/functions/create-payment-session/index.ts`

**Changes:**

1. Add `intent_type` to request body
2. Store `intent_type` in `payment_intents` table
3. Handle new intent types

```typescript
// Add to request interface
interface PaymentSessionRequest {
  // ... existing fields
  intentType?: 'appointment_payment' | 'customer_purse_topup' | 'salon_purse_topup' 
             | 'invoice_payment' | 'messaging_credit_purchase';
  customerId?: string;  // For customer purse topup
  invoiceId?: string;   // For invoice payment
  credits?: number;     // For credit purchase
}

// Store intent_type when creating payment_intent
const { data: paymentIntent } = await supabase
  .from("payment_intents")
  .insert({
    tenant_id: tenantId,
    appointment_id: appointmentId,
    amount: amount,
    currency: currency.toUpperCase(),
    gateway: usePaystack ? "paystack" : "stripe",
    is_deposit: isDeposit,
    status: "pending",
    intent_type: intentType || 'appointment_payment', // NEW
  })
  .select()
  .single();

// Include in Paystack metadata
metadata: {
  appointment_id: appointmentId,
  payment_intent_id: paymentIntent.id,
  tenant_id: tenantId,
  is_deposit: isDeposit,
  customer_name: customerName,
  intent_type: intentType, // NEW
  customer_id: customerId, // NEW - for purse topup
  invoice_id: invoiceId,   // NEW - for invoice payment
  credits: credits,        // NEW - for credit purchase
}
```

### 5.2 Extend `payment-webhook`

**File:** `supabase/functions/payment-webhook/index.ts`

**Changes:** Add handlers based on `payment_intents.intent_type`:

```typescript
// After resolving payment_intent, switch on intent_type:
const intentType = paymentIntent.intent_type || 'appointment_payment';

switch (intentType) {
  case 'appointment_payment':
    // Existing logic
    await handleAppointmentPayment(supabase, paymentIntent, paystackReference);
    // NEW: Credit salon purse
    await supabase.rpc('credit_salon_purse', {
      p_tenant_id: paymentIntent.tenant_id,
      p_entry_type: 'salon_purse_credit_booking',
      p_reference_type: 'appointment',
      p_reference_id: paymentIntent.appointment_id,
      p_amount: paymentIntent.amount,
      p_currency: paymentIntent.currency,
      p_idempotency_key: `booking_${paystackReference}`,
      p_gateway_reference: paystackReference
    });
    break;
    
  case 'customer_purse_topup':
    await supabase.rpc('credit_customer_purse', {
      p_tenant_id: metadata.tenant_id,
      p_customer_id: metadata.customer_id,
      p_amount: amount / 100, // Convert from kobo/pesewas
      p_currency: currency,
      p_idempotency_key: `topup_${paystackReference}`,
      p_gateway_reference: paystackReference
    });
    break;
    
  case 'salon_purse_topup':
    await supabase.rpc('credit_salon_purse', {
      p_tenant_id: metadata.tenant_id,
      p_entry_type: 'salon_purse_topup',
      p_reference_type: 'topup',
      p_reference_id: paymentIntent.id,
      p_amount: amount / 100,
      p_currency: currency,
      p_idempotency_key: `salon_topup_${paystackReference}`,
      p_gateway_reference: paystackReference
    });
    break;
    
  case 'invoice_payment':
    // Mark invoice as paid
    await supabase.from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', metadata.invoice_id);
    
    // Credit salon purse
    await supabase.rpc('credit_salon_purse', {
      p_tenant_id: metadata.tenant_id,
      p_entry_type: 'salon_purse_credit_invoice',
      p_reference_type: 'invoice',
      p_reference_id: metadata.invoice_id,
      p_amount: amount / 100,
      p_currency: currency,
      p_idempotency_key: `invoice_${paystackReference}`,
      p_gateway_reference: paystackReference
    });
    break;
    
  case 'messaging_credit_purchase':
    // Add credits
    await supabase.from('communication_credits')
      .upsert({
        tenant_id: metadata.tenant_id,
        balance: supabase.sql`balance + ${metadata.credits}`
      }, { onConflict: 'tenant_id' });
    
    // Create audit record
    await supabase.from('messaging_credit_purchases').insert({
      tenant_id: metadata.tenant_id,
      credits: metadata.credits,
      currency: currency,
      amount: amount / 100,
      paid_via: 'paystack',
      payment_intent_id: paymentIntent.id,
      gateway_reference: paystackReference
    });
    break;
}
```

### 5.3 New: `create-invoice-payment-session`

**File:** `supabase/functions/create-invoice-payment-session/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { invoiceId } = await req.json();

    // Get invoice with tenant
    const { data: invoice } = await supabase
      .from("invoices")
      .select("*, tenant:tenants(*)")
      .eq("id", invoiceId)
      .single();

    if (!invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invoice.status === "paid") {
      return new Response(JSON.stringify({ error: "Invoice already paid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    const amountInKobo = Math.round(invoice.total_amount * 100);

    // Create payment intent
    const { data: paymentIntent } = await supabase
      .from("payment_intents")
      .insert({
        tenant_id: invoice.tenant_id,
        amount: invoice.total_amount,
        currency: invoice.currency || invoice.tenant.currency || "NGN",
        gateway: "paystack",
        status: "pending",
        intent_type: "invoice_payment",
      })
      .select()
      .single();

    // Initialize Paystack transaction
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInKobo,
          email: invoice.customer_email,
          currency: invoice.currency || "NGN",
          reference: paymentIntent.id,
          callback_url: `${Deno.env.get("PUBLIC_URL")}/payment/callback`,
          metadata: {
            tenant_id: invoice.tenant_id,
            invoice_id: invoice.id,
            payment_intent_id: paymentIntent.id,
            intent_type: "invoice_payment",
          },
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      throw new Error(paystackData.message || "Paystack initialization failed");
    }

    // Update invoice with payment link
    await supabase
      .from("invoices")
      .update({
        payment_link: paystackData.data.authorization_url,
        payment_intent_id: paymentIntent.id,
      })
      .eq("id", invoiceId);

    // Update payment intent
    await supabase
      .from("payment_intents")
      .update({
        paystack_reference: paystackData.data.reference,
        paystack_access_code: paystackData.data.access_code,
      })
      .eq("id", paymentIntent.id);

    return new Response(
      JSON.stringify({
        paymentUrl: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating invoice payment session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

### 5.4 New: `create-payout-destination`

**File:** `supabase/functions/create-payout-destination/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    const { data: { user } } = await supabase.auth.getUser(
      authHeader?.replace("Bearer ", "")
    );

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const {
      tenantId,
      destinationType,
      country,
      currency,
      bankCode,
      bankName,
      accountNumber,
      accountName,
      momoProvider,
      momoNumber,
      isDefault,
    } = await req.json();

    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

    // Create Paystack transfer recipient
    let recipientPayload: Record<string, unknown>;

    if (destinationType === "bank") {
      recipientPayload = {
        type: country === "NG" ? "nuban" : "ghipss",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: currency,
      };
    } else {
      // Mobile money (Ghana)
      recipientPayload = {
        type: "mobile_money",
        name: accountName,
        account_number: momoNumber,
        bank_code: momoProvider.toUpperCase(), // MTN, VOD, ATL
        currency: "GHS",
      };
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transferrecipient",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recipientPayload),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return new Response(
        JSON.stringify({ error: paystackData.message || "Failed to create recipient" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // If setting as default, unset others first
    if (isDefault) {
      await supabase
        .from("salon_payout_destinations")
        .update({ is_default: false })
        .eq("tenant_id", tenantId);
    }

    // Save to database
    const { data: destination, error } = await supabase
      .from("salon_payout_destinations")
      .insert({
        tenant_id: tenantId,
        destination_type: destinationType,
        country,
        currency,
        bank_code: bankCode,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        momo_provider: momoProvider,
        momo_number: momoNumber,
        paystack_recipient_code: paystackData.data.recipient_code,
        is_default: isDefault || false,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ destination }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating payout destination:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

### 5.5 New: `process-salon-withdrawal`

**File:** `supabase/functions/process-salon-withdrawal/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    const { data: { user } } = await supabase.auth.getUser(
      authHeader?.replace("Bearer ", "")
    );

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { tenantId, payoutDestinationId, amount } = await req.json();

    // Get salon wallet
    const { data: wallet } = await supabase
      .from("salon_wallets")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Get payout destination
    const { data: destination } = await supabase
      .from("salon_payout_destinations")
      .select("*")
      .eq("id", payoutDestinationId)
      .eq("tenant_id", tenantId)
      .single();

    if (!destination) {
      return new Response(JSON.stringify({ error: "Payout destination not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Create withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("salon_withdrawals")
      .insert({
        tenant_id: tenantId,
        salon_wallet_id: wallet.id,
        payout_destination_id: payoutDestinationId,
        currency: wallet.currency,
        amount: amount,
        status: "pending",
      })
      .select()
      .single();

    if (withdrawalError) throw withdrawalError;

    // Debit salon purse (atomic)
    const { error: debitError } = await supabase.rpc("debit_salon_purse_for_withdrawal", {
      p_tenant_id: tenantId,
      p_withdrawal_id: withdrawal.id,
      p_amount: amount,
      p_currency: wallet.currency,
      p_idempotency_key: `withdrawal_${withdrawal.id}`,
    });

    if (debitError) {
      // Rollback withdrawal record
      await supabase.from("salon_withdrawals").delete().eq("id", withdrawal.id);
      throw debitError;
    }

    // Update withdrawal to processing
    await supabase
      .from("salon_withdrawals")
      .update({ status: "processing" })
      .eq("id", withdrawal.id);

    // Call Paystack Transfer API
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    const amountInKobo = Math.round(amount * 100);

    const transferResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: amountInKobo,
        recipient: destination.paystack_recipient_code,
        reason: `Withdrawal from salon wallet`,
        reference: withdrawal.id,
      }),
    });

    const transferData = await transferResponse.json();

    if (!transferData.status) {
      // Reverse the debit
      await supabase.rpc("create_wallet_reversal", {
        p_original_entry_id: withdrawal.id, // This needs to be the ledger entry ID
        p_reason: `Transfer failed: ${transferData.message}`,
        p_idempotency_key: `reversal_${withdrawal.id}`,
      });

      await supabase
        .from("salon_withdrawals")
        .update({ status: "failed", failure_reason: transferData.message })
        .eq("id", withdrawal.id);

      return new Response(
        JSON.stringify({ error: transferData.message || "Transfer failed" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Update with Paystack reference
    await supabase
      .from("salon_withdrawals")
      .update({
        paystack_transfer_code: transferData.data.transfer_code,
        paystack_reference: transferData.data.reference,
      })
      .eq("id", withdrawal.id);

    return new Response(
      JSON.stringify({
        withdrawal: { ...withdrawal, status: "processing" },
        transfer: transferData.data,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

### 5.6 New: `paystack-transfer-webhook`

**File:** `supabase/functions/paystack-transfer-webhook/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

async function verifyPaystackSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computedSig === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    const isValid = await verifyPaystackSignature(rawBody, signature, PAYSTACK_SECRET_KEY);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const event = JSON.parse(rawBody);
    const { event: eventType, data } = event;

    // Handle transfer events
    if (eventType === "transfer.success") {
      const withdrawalId = data.reference;

      await supabase
        .from("salon_withdrawals")
        .update({ status: "completed" })
        .eq("id", withdrawalId);

      console.log(`Withdrawal ${withdrawalId} completed successfully`);
    } else if (eventType === "transfer.failed" || eventType === "transfer.reversed") {
      const withdrawalId = data.reference;

      // Get the ledger entry for this withdrawal
      const { data: ledgerEntry } = await supabase
        .from("wallet_ledger_entries")
        .select("id")
        .eq("reference_type", "withdrawal")
        .eq("reference_id", withdrawalId)
        .single();

      if (ledgerEntry) {
        // Create reversal
        await supabase.rpc("create_wallet_reversal", {
          p_original_entry_id: ledgerEntry.id,
          p_reason: data.reason || `Transfer ${eventType}`,
          p_idempotency_key: `reversal_${withdrawalId}_${Date.now()}`,
        });
      }

      await supabase
        .from("salon_withdrawals")
        .update({
          status: "failed",
          failure_reason: data.reason || eventType,
        })
        .eq("id", withdrawalId);

      console.log(`Withdrawal ${withdrawalId} failed: ${data.reason}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error handling transfer webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

### 5.7 New: `purchase-credits-from-purse`

**File:** `supabase/functions/purchase-credits-from-purse/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREDIT_PACKAGES = [
  { id: "pack_50", credits: 50, priceNGN: 3500, priceGHS: 60 },
  { id: "pack_100", credits: 100, priceNGN: 6500, priceGHS: 108 },
  { id: "pack_250", credits: 250, priceNGN: 15000, priceGHS: 240 },
  { id: "pack_500", credits: 500, priceNGN: 27000, priceGHS: 420 },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    const { data: { user } } = await supabase.auth.getUser(
      authHeader?.replace("Bearer ", "")
    );

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { tenantId, packageId } = await req.json();

    // Get package
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return new Response(JSON.stringify({ error: "Invalid package" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get wallet
    const { data: wallet } = await supabase
      .from("salon_wallets")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const price = wallet.currency === "GHS" ? pkg.priceGHS : pkg.priceNGN;

    if (wallet.balance < price) {
      return new Response(JSON.stringify({ error: "Insufficient wallet balance" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Create purchase record first
    const { data: purchase, error: purchaseError } = await supabase
      .from("messaging_credit_purchases")
      .insert({
        tenant_id: tenantId,
        credits: pkg.credits,
        currency: wallet.currency,
        amount: price,
        paid_via: "salon_purse",
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    // Debit salon purse
    const { error: debitError } = await supabase.rpc("debit_salon_purse_for_withdrawal", {
      p_tenant_id: tenantId,
      p_withdrawal_id: purchase.id, // Using purchase ID as reference
      p_amount: price,
      p_currency: wallet.currency,
      p_idempotency_key: `credit_purchase_${purchase.id}`,
    });

    if (debitError) {
      await supabase.from("messaging_credit_purchases").delete().eq("id", purchase.id);
      throw debitError;
    }

    // Add credits
    const { error: creditError } = await supabase
      .from("communication_credits")
      .upsert(
        {
          tenant_id: tenantId,
          balance: pkg.credits,
        },
        {
          onConflict: "tenant_id",
          ignoreDuplicates: false,
        }
      );

    // If tenant already has credits, increment instead
    if (!creditError) {
      await supabase.rpc("increment_communication_credits", {
        p_tenant_id: tenantId,
        p_amount: pkg.credits,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        credits: pkg.credits,
        newBalance: wallet.balance - price,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error purchasing credits:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

### 5.8 New: `get-banks-and-momo-providers`

**File:** `supabase/functions/get-banks-and-momo-providers/index.ts`

This helper endpoint fetches and returns the list of banks (Nigeria) or mobile money providers (Ghana) from Paystack. Used to populate dropdown menus in the payout destination UI.

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Bank {
  id: number;
  name: string;
  slug: string;
  code: string;
  type: string;
  currency: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || "NG"; // 'NG' or 'GH'
    const type = url.searchParams.get("type") || ""; // 'mobile_money' for Ghana MoMo

    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!PAYSTACK_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Paystack URL with query params
    const paystackUrl = new URL("https://api.paystack.co/bank");
    paystackUrl.searchParams.set("country", country.toLowerCase());
    if (type) {
      paystackUrl.searchParams.set("type", type);
    }
    // For Ghana, also set pay_with_bank_transfer for certain use cases
    if (country === "GH" && !type) {
      paystackUrl.searchParams.set("pay_with_bank_transfer", "true");
    }

    const response = await fetch(paystackUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();

    if (!data.status) {
      return new Response(
        JSON.stringify({ error: data.message || "Failed to fetch banks" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform to simplified format
    const banks: Bank[] = data.data.map((bank: any) => ({
      id: bank.id,
      name: bank.name,
      slug: bank.slug,
      code: bank.code,
      type: bank.type,
      currency: bank.currency,
    }));

    return new Response(JSON.stringify({ banks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching banks:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

**Usage Examples:**

| Country | Type | Endpoint | Returns |
|---------|------|----------|---------|
| Nigeria | Banks | `?country=NG` | Nigerian banks (NUBAN) |
| Ghana | Banks | `?country=GH` | Ghanaian banks (GHIPSS) |
| Ghana | Mobile Money | `?country=GH&type=mobile_money` | MTN, Vodafone, AirtelTigo |

**Ghana Mobile Money Provider Codes:**

| Provider | Code |
|----------|------|
| MTN Mobile Money | `MTN` |
| Vodafone Cash | `VOD` |
| AirtelTigo Money | `ATL` |

### 5.9 New: `verify-bank-account`

**File:** `supabase/functions/verify-bank-account/index.ts`

Verifies a bank account number before saving as a payout destination. Returns the account holder's name from the bank for user confirmation.

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  accountNumber: string;
  bankCode: string;
}

interface VerifyResponse {
  accountName: string;
  accountNumber: string;
  bankId: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { accountNumber, bankCode }: VerifyRequest = await req.json();

    if (!accountNumber || !bankCode) {
      return new Response(
        JSON.stringify({ error: "accountNumber and bankCode are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!PAYSTACK_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Paystack resolve endpoint
    const paystackUrl = new URL("https://api.paystack.co/bank/resolve");
    paystackUrl.searchParams.set("account_number", accountNumber);
    paystackUrl.searchParams.set("bank_code", bankCode);

    const response = await fetch(paystackUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();

    if (!data.status) {
      return new Response(
        JSON.stringify({ 
          error: data.message || "Could not verify account",
          verified: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: VerifyResponse = {
      accountName: data.data.account_name,
      accountNumber: data.data.account_number,
      bankId: data.data.bank_id,
    };

    return new Response(
      JSON.stringify({ verified: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying account:", error);
    return new Response(
      JSON.stringify({ error: error.message, verified: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

**Request/Response:**

```typescript
// Request
POST /verify-bank-account
{
  "accountNumber": "0123456789",
  "bankCode": "058"  // GTBank code
}

// Response (success)
{
  "verified": true,
  "accountName": "JOHN DOE",
  "accountNumber": "0123456789",
  "bankId": 9
}

// Response (failure)
{
  "verified": false,
  "error": "Could not resolve account name"
}
```

**Note:** Mobile money verification in Ghana uses the same endpoint with the provider code (MTN, VOD, ATL) as the `bankCode`.

---

## 6. Frontend Components

### 6.1 Salon Admin - New Components

| Component | Path | Purpose |
|-----------|------|---------|
| `SalonWalletCard` | `src/components/billing/SalonWalletCard.tsx` | Display balance, topup button, withdrawal button |
| `PayoutDestinationsManager` | `src/components/billing/PayoutDestinationsManager.tsx` | CRUD for bank/momo destinations with verification |
| `WithdrawalDialog` | `src/components/billing/WithdrawalDialog.tsx` | Initiate withdrawal |
| `WithdrawalHistory` | `src/components/billing/WithdrawalHistory.tsx` | List withdrawals with status |
| `WalletLedger` | `src/components/billing/WalletLedger.tsx` | Transaction history |

#### Account Verification UI Flow (`PayoutDestinationsManager`)

The payout destination form includes real-time account verification before saving:

```
┌─────────────────────────────────────────────────────────────┐
│  Add Payout Destination                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Country:  ○ Nigeria  ○ Ghana                               │
│                                                             │
│  Type:     ○ Bank Account  ○ Mobile Money (Ghana only)      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Bank / Provider (dropdown)                          │    │
│  │ ▼ Select bank...                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Account Number                                      │    │
│  │ 0123456789                                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Verify Account]  ← Calls verify-bank-account endpoint     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ✓ Account Name (read-only, from Paystack)           │    │
│  │ JOHN DOE ENTERPRISES                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ☐ Set as default payout destination                        │
│                                                             │
│  [Cancel]                              [Save Destination]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**UI Flow Steps:**

| Step | User Action | System Response |
|------|-------------|-----------------|
| 1 | Select country | Load banks/providers via `get-banks-and-momo-providers` |
| 2 | Select destination type | Filter dropdown (banks vs mobile money) |
| 3 | Select bank/provider | Store `bankCode` |
| 4 | Enter account number | Enable "Verify Account" button |
| 5 | Click "Verify Account" | Call `verify-bank-account`, show loading spinner |
| 6a | Verification succeeds | Display account name, enable "Save Destination" |
| 6b | Verification fails | Show error message, keep "Save" disabled |
| 7 | Click "Save Destination" | Call `create-payout-destination` with verified details |

**State Management:**

```typescript
interface PayoutDestinationFormState {
  country: 'NG' | 'GH';
  destinationType: 'bank' | 'mobile_money';
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;        // From verification
  isVerifying: boolean;
  isVerified: boolean;
  verificationError: string | null;
  isDefault: boolean;
}
```

**Validation Rules:**

- Nigeria bank accounts: 10 digits (NUBAN)
- Ghana bank accounts: varies by bank
- Ghana mobile money: 10 digits (phone number format)
- "Save" button disabled until verification succeeds
- Re-verification required if account number or bank changes

### 6.2 Salon Admin - New Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useSalonWallet` | `src/hooks/useSalonWallet.tsx` | Fetch salon wallet + balance |
| `useWalletLedger` | `src/hooks/useWalletLedger.tsx` | Fetch wallet ledger entries |
| `usePayoutDestinations` | `src/hooks/usePayoutDestinations.tsx` | CRUD payout destinations |
| `useWithdrawals` | `src/hooks/useWithdrawals.tsx` | List + create withdrawals |
| `useBankList` | `src/hooks/useBankList.tsx` | Fetch banks/momo providers for dropdowns |
| `useAccountVerification` | `src/hooks/useAccountVerification.tsx` | Verify bank account before saving |

#### `useBankList` Hook

```typescript
interface UseBankListOptions {
  country: 'NG' | 'GH';
  type?: 'mobile_money';  // Only for Ghana
}

interface Bank {
  id: number;
  name: string;
  code: string;
  type: string;
}

function useBankList(options: UseBankListOptions) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBanks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ country: options.country });
      if (options.type) params.set('type', options.type);
      
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/get-banks-and-momo-providers?${params}`
      );
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error);
      setBanks(data.banks);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [options.country, options.type]);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  return { banks, isLoading, error, refetch: fetchBanks };
}
```

#### `useAccountVerification` Hook

```typescript
interface VerificationResult {
  verified: boolean;
  accountName?: string;
  error?: string;
}

function useAccountVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const verify = useCallback(async (accountNumber: string, bankCode: string) => {
    setIsVerifying(true);
    setResult(null);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-bank-account`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountNumber, bankCode }),
        }
      );
      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      const errorResult = { verified: false, error: (err as Error).message };
      setResult(errorResult);
      return errorResult;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  return { verify, reset, isVerifying, result };
}
```

### 6.3 Public Booking - Changes

| Component | Path | Changes |
|-----------|------|---------|
| `PaymentStep.tsx` | Existing | Add split payment UI (purse + Paystack) |
| `CustomerPurseToggle.tsx` | Existing | Connect to real purse balance (remove demo mode) |

### 6.4 Client Portal - New Components

| Component | Path | Purpose |
|-----------|------|---------|
| `PurseTopupDialog` | `src/components/PurseTopupDialog.tsx` | Customer self-topup |
| `PurseTransactionHistory` | `src/components/PurseTransactionHistory.tsx` | View ledger entries |

---

## 7. Implementation Order

### Phase 1: Core Infrastructure (Days 1-2)

1. Run database migrations (tables + enums)
2. Create database functions (RPCs)
3. Add trigger for auto-creating salon_wallets
4. Backfill existing tenants with salon_wallets
5. Extend `payment_intents` table with `intent_type`

### Phase 2: Salon Purse Receives Payments (Days 3-4)

6. Extend `create-payment-session` with `intent_type`
7. Extend `payment-webhook` to credit salon purse on booking payments
8. Implement `useSalonWallet` hook
9. Implement `SalonWalletCard` component
10. Add wallet section to Settings page

### Phase 3: Customer Purse Topup (Days 5-6)

11. Implement customer purse topup flow (session + webhook)
12. Implement `PurseTopupDialog` in client-portal
13. Connect `CustomerPurseToggle` to real balance
14. Implement split payment (purse + Paystack) in BookingWizard

### Phase 4: Withdrawals (Days 7-10)

15. Deploy `get-banks-and-momo-providers` edge function
16. Deploy `verify-bank-account` edge function
17. Implement `useBankList` and `useAccountVerification` hooks
18. Deploy `create-payout-destination` edge function
19. Implement `PayoutDestinationsManager` component with verification flow
20. Deploy `process-salon-withdrawal` edge function
21. Deploy `paystack-transfer-webhook` edge function
22. Implement `WithdrawalDialog` and `WithdrawalHistory` components

### Phase 5: Invoice Payments (Days 11-12)

23. Deploy `create-invoice-payment-session` edge function
24. Add "Generate Payment Link" button to invoice UI
25. Handle invoice payment in `payment-webhook`
26. Update invoice status display

### Phase 6: Messaging Credits from Purse (Days 13-14)

27. Deploy `purchase-credits-from-purse` edge function
28. Update `CreditPurchaseDialog` with dual payment option
29. Update `useCreditPurchase` hook

### Phase 7: Testing & Polish (Days 15-16)

30. End-to-end testing of all flows
31. Error handling and edge cases
32. UI polish and loading states

---

## 8. Key Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/create-payment-session/index.ts` | Add `intent_type` handling |
| `supabase/functions/payment-webhook/index.ts` | Add purse credit logic per intent type |
| `apps/public-booking/src/pages/components/BookingWizard.tsx` | Split payment flow |
| `apps/public-booking/src/components/CustomerPurseToggle.tsx` | Real balance integration |
| `apps/salon-admin/src/pages/salon/SettingsPage.tsx` | Add wallet/payout tabs |
| `apps/salon-admin/src/components/billing/CreditPurchaseDialog.tsx` | Dual payment source |
| `apps/salon-admin/src/hooks/useInvoices.tsx` | Add `generatePaymentLink()` |

---

## 9. Paystack API Reference

### Endpoints

| Endpoint | Method | Use |
|----------|--------|-----|
| `/transaction/initialize` | POST | Create payment session (existing) |
| `/transferrecipient` | POST | Create payout destination |
| `/bank` | GET | List banks for dropdown |
| `/bank/resolve` | GET | Verify account number |
| `/transfer` | POST | Initiate withdrawal |
| `/transfer/:id` | GET | Check transfer status |

### Bank List Endpoint Details

**Base URL:** `https://api.paystack.co/bank`

| Parameter | Type | Description |
|-----------|------|-------------|
| `country` | string | Country code: `ng` (Nigeria) or `ghana` |
| `type` | string | Optional: `mobile_money` for Ghana MoMo providers |
| `pay_with_bank_transfer` | boolean | Optional: filter banks supporting transfers |
| `use_cursor` | boolean | Optional: enable pagination |
| `perPage` | number | Optional: results per page (default 50) |

**Example Requests:**

```bash
# Nigeria banks
GET /bank?country=ng

# Ghana banks
GET /bank?country=ghana

# Ghana mobile money providers
GET /bank?country=ghana&type=mobile_money
```

**Response:**
```json
{
  "status": true,
  "message": "Banks retrieved",
  "data": [
    {
      "id": 1,
      "name": "Access Bank",
      "slug": "access-bank",
      "code": "044",
      "type": "nuban",
      "currency": "NGN"
    }
  ]
}
```

### Account Verification Endpoint Details

**Base URL:** `https://api.paystack.co/bank/resolve`

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_number` | string | Account number to verify |
| `bank_code` | string | Bank code from `/bank` endpoint |

**Example Request:**

```bash
GET /bank/resolve?account_number=0123456789&bank_code=058
```

**Response (Success):**
```json
{
  "status": true,
  "message": "Account number resolved",
  "data": {
    "account_number": "0123456789",
    "account_name": "JOHN DOE",
    "bank_id": 9
  }
}
```

**Response (Failure):**
```json
{
  "status": false,
  "message": "Could not resolve account name. Check parameters or try again."
}
```

### Ghana Mobile Money Provider Codes

| Provider | Code | Type |
|----------|------|------|
| MTN Mobile Money | `MTN` | mobile_money |
| Vodafone Cash | `VOD` | mobile_money |
| AirtelTigo Money | `ATL` | mobile_money |

**Note:** For mobile money verification, use the provider code as the `bank_code` parameter.

### Webhook Events

| Event | Handler |
|-------|---------|
| `charge.success` | Payment confirmed (existing + extended) |
| `transfer.success` | Withdrawal completed |
| `transfer.failed` | Withdrawal failed - trigger reversal |
| `transfer.reversed` | Withdrawal reversed - trigger reversal |

---

## 10. Configuration

### Environment Variables

```env
# Existing
PAYSTACK_SECRET_KEY=sk_live_xxx

# Webhook endpoints to configure in Paystack dashboard:
# - Payment webhook: https://<project>.supabase.co/functions/v1/payment-webhook
# - Transfer webhook: https://<project>.supabase.co/functions/v1/paystack-transfer-webhook
```

### Withdrawal Limits (stored in tenants table)

| Country | Currency | Minimum |
|---------|----------|---------|
| Nigeria | NGN | 1,000 |
| Ghana | GHS | 50 |

---

## 11. Acceptance Criteria

### Customer Purse

- [ ] Customer can topup purse via Paystack (GH/NG)
- [ ] Topup credits purse exactly once per gateway reference (idempotent)
- [ ] Customer can view purse balance and transaction history
- [ ] Customer can pay for booking using purse balance

### Booking Payments

- [ ] Booking payment page supports purse-only payment
- [ ] Booking payment page supports Paystack-only payment
- [ ] Booking payment page supports split (purse + Paystack)
- [ ] Salon purse receives credit on successful booking payment

### Salon Purse

- [ ] Salon can view purse balance and ledger
- [ ] Salon receives credits from bookings
- [ ] Salon receives credits from invoice payments
- [ ] Salon receives credits from customer purse payments
- [ ] Salon can topup purse directly via Paystack link

### Withdrawals

- [ ] Salon can add bank account (Nigeria) or mobile money (Ghana)
- [ ] Account details verified via Paystack
- [ ] Salon can initiate withdrawal to saved destination
- [ ] Minimum withdrawal amount enforced
- [ ] Withdrawal status tracked (pending → processing → completed/failed)
- [ ] Failed withdrawals restore funds to salon purse

### Invoice Payments

- [ ] Invoice can have payment link generated
- [ ] Customer can pay invoice via Paystack
- [ ] Invoice marked as paid on successful payment
- [ ] Salon purse credited on invoice payment

### Messaging Credits

- [ ] Salon can purchase credits from salon purse
- [ ] Salon can purchase credits via Paystack
- [ ] Purchase creates audit record
- [ ] Credits immediately available after purchase
