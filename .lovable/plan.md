
# PRD Gap Analysis & Paystack Integration Plan

## Executive Summary

You're correct - Paystack needs to be hooked up for the Nigeria/Ghana payment flow. After a thorough analysis of the PRD against the current implementation, I've identified **Paystack integration** as a critical gap along with several other missing features needed for v1 completion.

---

## Current State

### What's Implemented
- Database schema with multi-tenancy, RLS, and audit logging
- Authentication (email/password, staff invitations)
- Public booking flow (`/b/[salonSlug]`) with catalog, cart, and checkout wizard
- Client Portal with OTP login, booking management, purse/credits, and refunds
- BackOffice with 2FA, waitlist management, tenant oversight, feature flags, pricing, impersonation, and kill switch
- Salon admin dashboard, appointments, calendar, customers, services/products/packages, staff, settings, reports, journal, and messaging pages
- Stripe Billing integration for platform subscriptions
- Payment webhook with signature validation (Stripe + Paystack schemas defined but Paystack not connected)
- Email templates management UI

---

## Critical Gaps Identified

### 1. Paystack Integration (Payment Collection)
**PRD Section 14.1-14.2** - Paystack is required for Nigeria/Ghana customer payments (deposits, full payments)

**Current State:**
- `create-payment-session` Edge Function has region detection logic (`NG/GH` -> Paystack) but returns a **mock checkout URL**
- `payment-webhook` has Paystack signature verification code but no actual Paystack API calls

**What's Missing:**
- Actual Paystack Transaction initialization API call
- Paystack hosted checkout redirect
- PAYSTACK_SECRET_KEY secret configuration
- PAYSTACK_WEBHOOK_SECRET for webhook verification

---

### 2. OTP Verification for Service Start (Studio/Chain)
**PRD Section 87** - "OTP verification triggered for Studio and Chain plans"

**Current State:** Not implemented - service start is immediate

**What's Missing:**
- Customer OTP generation when service starts
- OTP verification modal in appointments flow
- Solo plan bypass logic

---

### 3. Tips System
**PRD Section 59** - Tips can be added during service or up to 48 hours after

**Current State:** Not implemented

**What's Missing:**
- `tips` table in database
- Tip entry UI after service completion
- 48-hour eligibility window logic
- Client portal tip submission

---

### 4. Customer Reviews
**PRD Section 6.2 (EPIC 6)** - Leave review after service with verification

**Current State:** Not implemented

**What's Missing:**
- `reviews` table in database
- Review submission in client portal
- Review display (first name + last initial)
- Review moderation in salon admin

---

### 5. Buffer Time Flow
**PRD Sections 90-92** - Salon-initiated buffers, customer "On My Way", "Running Late"

**Current State:** Partially implemented (database has columns, but UI flow incomplete)

**What's Missing:**
- "On My Way" button in client portal
- "Running Late" delay selector
- Buffer proposal modal in appointments
- Email notifications for buffer requests
- Accept/decline CTAs in customer emails

---

### 6. Invoice Generation & Email
**PRD Section 60** - Invoices generated on payment settlement, refund, service completion

**Current State:** Not implemented

**What's Missing:**
- Invoice PDF/HTML generation
- Invoice email sending
- Invoice history in client portal
- Invoice download in salon admin

---

### 7. Service Change During Appointment
**PRD Section 94** - Customer approval required via email

**Current State:** Not implemented

**What's Missing:**
- Service change proposal UI
- Customer approval email with CTAs
- Price difference handling (charge, credit, or refund)

---

### 8. Communication Credits Top-Up Purchase
**PRD Section 15.2** - Credits can be purchased from Settings -> Communication

**Current State:** UI exists but "Buy Credits" button is non-functional

**What's Missing:**
- Credit pricing per region
- Payment flow for credit purchase
- Credit balance top-up logic

---

### 9. Trial Expiration & Card Collection
**PRD Section 13.2** - 14-day trial, card required before trial ends

**Current State:** Subscription tables exist but trial enforcement not implemented

**What's Missing:**
- Trial countdown banner
- Card collection modal before trial expires
- Access restriction on trial expiry

---

### 10. Referral Program
**PRD Section 16** - 1 successful referral = 4% discount for 12 months

**Current State:** Not implemented

**What's Missing:**
- Referral tracking tables
- Referral code generation
- Discount application at checkout
- Referral status UI in Settings -> Billing

---

## Prioritized Implementation Plan

### Phase A: Critical Payment Flow (Paystack)
**Must-Have for Nigeria/Ghana Launch**

1. **Add PAYSTACK_SECRET_KEY Secret**
   - Request secret from user via Lovable secrets tool

2. **Update `create-payment-session` Edge Function**
   - Replace mock checkout with actual Paystack `POST /transaction/initialize` API call
   - Return Paystack authorization_url for redirect
   - Store transaction reference in payment_intents table

3. **Update `payment-webhook` Edge Function**
   - Ensure Paystack signature verification works
   - Handle `charge.success` event properly
   - Update appointment payment_status and amount_paid

4. **Update Booking Wizard**
   - Handle Paystack redirect flow
   - Add payment success/failure pages

---

### Phase B: Service Flow Enhancements
1. OTP verification for service start (Studio/Chain)
2. Tips system (database + UI)
3. Buffer time flow ("On My Way", "Running Late")
4. Invoice generation

---

### Phase C: Customer Engagement
1. Customer reviews system
2. Service change approval flow
3. Communication credits purchase

---

### Phase D: Business Operations
1. Trial enforcement
2. Referral program

---

## Technical Details: Paystack Integration

### Database Changes
None required - existing `payment_intents` and `transactions` tables are sufficient.

### Edge Function: `create-payment-session`

```text
Current flow (mock):
1. Detect region (NG/GH -> Paystack)
2. Insert payment_intent with status: "pending"
3. Return mock checkout URL

Updated flow:
1. Detect region (NG/GH -> Paystack)
2. Insert payment_intent with status: "pending"
3. Call Paystack API: POST /transaction/initialize
   - amount (in kobo/pesewas - minor units)
   - email
   - reference (unique, use payment_intent.id)
   - callback_url (success page)
   - metadata (appointment_id, payment_intent_id, tenant_id)
4. Return authorization_url from Paystack response
```

### Paystack API Reference

```text
POST https://api.paystack.co/transaction/initialize
Headers:
  Authorization: Bearer PAYSTACK_SECRET_KEY
  Content-Type: application/json

Body:
{
  "amount": 500000,  // 5000.00 NGN in kobo
  "email": "customer@example.com",
  "reference": "uuid-from-payment-intent",
  "callback_url": "https://salonmagik.lovable.app/b/salon-slug/payment-success",
  "metadata": {
    "appointment_id": "...",
    "payment_intent_id": "...",
    "tenant_id": "..."
  }
}

Response:
{
  "status": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "access_code": "...",
    "reference": "..."
  }
}
```

### Webhook Handler Updates
The existing `payment-webhook` already has Paystack signature verification and handles `charge.success`. Just need to ensure:
- Metadata extraction works correctly
- Amount conversion from minor units
- Transaction creation with gateway: "paystack"

---

## Recommended Next Steps

1. **Add Paystack Secret** - I'll request the PAYSTACK_SECRET_KEY and PAYSTACK_WEBHOOK_SECRET from you
2. **Implement Paystack in `create-payment-session`** - Replace mock with real API calls
3. **Add Payment Success/Callback Pages** - Handle redirect from Paystack
4. **Test End-to-End** - Verify Nigeria flow works

Would you like me to proceed with the Paystack integration first, or address a different gap?
