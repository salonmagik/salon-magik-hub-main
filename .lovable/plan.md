

# Multi-Step Booking Checkout Flow - Complete Implementation Plan

## Overview
This plan implements a streamlined booking checkout experience that separates concerns across logical steps, properly positions the "Keep my identity anonymous" toggle in Step 3 (Gift Recipients), and enhances the Customer Purse payment option with split-payment functionality.

---

## Flow Architecture

```text
+------------------+     +------------------+     +-------------------+     +------------------+     +--------------+
|   CART DRAWER    | --> |  STEP 1:         | --> |  STEP 2:          | --> |  STEP 3:         | --> |  STEP 4:     |
|   Item Mgmt      |     |  Scheduling      |     |  Booker Details   |     |  Gift Recipients |     |  Review &    |
|                  |     |                  |     |                   |     |  (if any gifts)  |     |  Payment     |
+------------------+     +------------------+     +-------------------+     +------------------+     +--------------+
```

---

## Cart Drawer (Simplified)

The cart drawer focuses purely on item management:

| Element | Behavior |
|---------|----------|
| Item Image | Display if available, fallback to type label |
| Item Type Badge | SERVICE / PRODUCT / PACKAGE in uppercase |
| Item Name + Price | Standard display |
| Quantity Counter | -/+/number controls, removes item at 0 |
| Location Selector | For multi-location salons (dropdown per item) |
| Delete Button | "Remove" link in destructive color |
| Gift Checkbox | Simple "This is a gift" checkbox per item |
| Fulfillment Toggle | **Products only**: Pickup / Delivery radio buttons |
| Proceed Button | Always enabled (scheduling handled in next step) |

**What Moves OUT of Cart:**
- Schedule now / Leave unscheduled radio buttons (moves to Step 1)
- Date picker and time selection (moves to Step 1)
- Anonymous booking toggle (moves to Step 3)

---

## Step 1: Scheduling

- Groups schedulable items (services, packages with services) together
- Products and product-only packages skip scheduling
- Single date/time selection for the entire booking (shared appointment)
- Uses existing `useAvailableDays` and `useAvailableSlots` hooks
- "Leave unscheduled" option at bottom for users who want to schedule later
- **Skip Condition**: If cart contains ONLY products, auto-skip to Step 2

---

## Step 2: Booker Details (Your Information)

Collect sender/booker information - required regardless of gift status.

| Field | Required | Notes |
|-------|----------|-------|
| First Name | Yes | |
| Last Name | Yes | |
| Email | Yes | For confirmation |
| Phone | No | Optional for non-gift bookings |
| Notes for salon | No | Special requests |

---

## Step 3: Gift Recipients (Conditional)

**Display Condition:** Only shown when one or more cart items have `isGift: true`

### Smart Consolidation Logic
```
if (giftItems.length > 1) {
  Show question: "Are all gifts for the same person?"
  
  if (sameRecipient === true) {
    Show single form, apply recipient to all gift items
  } else {
    Show tabbed/accordion forms for each gift item
  }
} else if (giftItems.length === 1) {
  Show single form directly (no "same person" question)
}
```

### Gift Recipient Form Fields
| Field | Required | Notes |
|-------|----------|-------|
| Recipient Full Name | Yes | First + Last |
| Recipient Email | Yes | Gift notification sent here |
| Recipient Phone | Yes | Per your requirement |
| Message | No | Personal note from sender |
| **Hide sender identity** | No | **Checkbox placed HERE** |

### Anonymity Clarification (UI Copy)
- **Label**: "Keep my identity anonymous"
- **Description**: "The recipient won't see your name or contact details. The salon will still have your information for booking purposes."

**Skip Condition:** If no items marked as gifts, auto-skip to Step 4

---

## Step 4: Review and Payment (Enhanced with Purse Split-Payment)

### Sections

1. **Appointment Summary** (if scheduled)
   - Date, Time, Location, Duration estimate

2. **Your Information**
   - Booker name, email, phone

3. **Gift Recipients** (if any)
   - Summary per gift item with recipient name

4. **Order Summary**
   - List of items with quantities and prices
   - Gift badges on gift items

5. **Voucher/Promo Code Input**
   - Reuse existing `VoucherInput` component

6. **Customer Purse (Enhanced)**
   - Requires OTP verification (existing auth flow)
   - Shows current balance
   - **New behaviors:**
     - **Balance = 0**: Show "Insufficient balance" message, disable toggle
     - **Balance < total**: Allow split payment - show "Use N12,000 from store credit" with remainder calculation
     - **Balance >= total**: Apply full purse amount

7. **Payment Options**
   - Pay at Salon (if enabled)
   - Pay Deposit (if deposits enabled)
   - Pay Full Amount
   - **Purse + Remainder**: When purse covers partial amount

8. **Totals (Enhanced)**
   - Subtotal
   - Voucher discount (if applied)
   - Store Credit applied (if applicable)
   - **Remainder to pay** (if purse is partial)
   - Amount due now
   - Amount due at salon

9. **Confirm Button**

---

## Customer Purse Enhancement Details

### Current Behavior (to be preserved)
- Toggle to enable/disable purse usage
- OTP verification via dialog before applying
- Applies minimum of (purse balance, total amount)

### Enhanced Behavior (new)

**Scenario 1: Zero Balance**
```
+-----------------------------------------------+
| [Wallet Icon] Store Credit                    |
| Balance: N0.00                               |
| "Insufficient balance"              [Disabled]|
+-----------------------------------------------+
```

**Scenario 2: Partial Balance (purse < total)**
```
+-----------------------------------------------+
| [Wallet Icon] Use Store Credit               |
| Balance: N5,000 available        [Toggle ON] |
|                                              |
| N5,000 will be applied.                      |
| Remaining N7,000 due via other payment.      |
|                           [Verified ✓]       |
+-----------------------------------------------+
```

**Scenario 3: Full Coverage (purse >= total)**
```
+-----------------------------------------------+
| [Wallet Icon] Use Store Credit               |
| Balance: N20,000 available       [Toggle ON] |
|                                              |
| N12,000 will be applied.                     |
| No additional payment required.              |
|                           [Verified ✓]       |
+-----------------------------------------------+
```

### Payment Calculation Logic
```typescript
const subtotal = getTotal();
const afterVoucher = Math.max(0, subtotal - voucherDiscount);
const purseApplied = Math.min(purseBalance, afterVoucher);
const remainderAfterPurse = afterVoucher - purseApplied;

// If purse covers everything
if (remainderAfterPurse === 0) {
  // No additional payment needed, can submit directly
  amountDueNow = 0;
  amountDueAtSalon = 0;
} else {
  // User must select payment option for remainder
  if (paymentOption === "pay_now") {
    amountDueNow = remainderAfterPurse;
    amountDueAtSalon = 0;
  } else if (paymentOption === "pay_deposit") {
    amountDueNow = Math.min(depositAmount, remainderAfterPurse);
    amountDueAtSalon = remainderAfterPurse - amountDueNow;
  } else {
    amountDueNow = 0;
    amountDueAtSalon = remainderAfterPurse;
  }
}
```

### Authentication Flow for Purse
When user enables purse toggle:
1. If not authenticated → Show OTP login dialog
2. Send OTP to booker's email
3. On verification → Fetch purse balance for this salon
4. Apply purse amount automatically

---

## ItemCard: Add vs Quantity Counter

Transform the "Add" button to a quantity counter once item is in cart:

```
State: Not in cart
+---------------------------+
|  [Add] button             |
+---------------------------+

State: In cart (qty = 2)
+---------------------------+
|  [-]  2  [+]              |
+---------------------------+

State: Reduced to 0
+---------------------------+
|  [Add] button (returns)   |
+---------------------------+
```

---

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/booking/useBookingCart.tsx` | Add `fulfillmentType` field, helper to get first gift recipient |
| `src/pages/booking/components/CartDrawer.tsx` | Simplify to item management only, add fulfillment toggle for products |
| `src/pages/booking/components/ItemCard.tsx` | Add quantity counter mode when item in cart |
| `src/pages/booking/components/BookingWizard.tsx` | Restructure steps, add gift consolidation logic, enhance purse display |
| `src/components/booking/CustomerPurseToggle.tsx` | Add zero balance handling, split-payment messaging |

### New Components to Create

| Component | Purpose |
|-----------|---------|
| `src/pages/booking/components/QuantityControl.tsx` | Reusable +/- counter component |
| `src/pages/booking/components/GiftRecipientsStep.tsx` | Step 3 with consolidation logic + anonymity toggle |
| `src/pages/booking/components/SchedulingStep.tsx` | Step 1 extracted for clarity |
| `src/pages/booking/components/BookerInfoStep.tsx` | Step 2 extracted for clarity |
| `src/pages/booking/components/ReviewStep.tsx` | Step 4 with enhanced purse + payment options |
| `src/pages/booking/components/FulfillmentToggle.tsx` | Pickup/Delivery radio for products |

### Data Model Updates

**CartItem additions** (in `useBookingCart.tsx`):
```typescript
interface CartItem {
  // ... existing fields
  fulfillmentType?: "pickup" | "delivery"; // For products
}
```

**Helper function** (in `useBookingCart.tsx`):
```typescript
const getFirstGiftRecipient = (): GiftRecipient | undefined => {
  const firstGift = items.find(item => item.isGift && item.giftRecipient);
  return firstGift?.giftRecipient;
};
```

### Enhanced CustomerPurseToggle Props
```typescript
interface CustomerPurseToggleProps {
  tenantId: string;
  customerEmail: string;
  currency: string;
  maxAmount: number; // Total after voucher
  onPurseApplied: (amount: number) => void;
  showInsufficientMessage?: boolean; // New: show message even at 0
}
```

### Wizard Step Flow Logic
```typescript
type WizardStep = "scheduling" | "booker" | "gifts" | "review" | "confirmation";

const getNextStep = (current: WizardStep): WizardStep => {
  switch (current) {
    case "scheduling":
      return "booker";
    case "booker":
      return giftItems.length > 0 ? "gifts" : "review";
    case "gifts":
      return "review";
    case "review":
      return "confirmation";
    default:
      return "scheduling";
  }
};

const shouldSkipScheduling = (): boolean => {
  return items.every(item => item.type === "product");
};
```

---

## Validation Rules

### Cart Drawer
- Proceed button always enabled (validation happens in wizard steps)
- Products must have fulfillment type selected before checkout

### Step 1 (Scheduling)
- If user chooses "Schedule now": date AND time required
- If user chooses "Leave unscheduled": can proceed

### Step 2 (Booker Details)
- First name required
- Last name required
- Email required (valid format)

### Step 3 (Gift Recipients)
- For each gift item:
  - Recipient name required
  - Recipient email required (valid format)
  - Recipient phone required

### Step 4 (Review)
- Payment option must be selected (unless purse covers 100%)
- If online payment: redirect to payment processor

---

## Testing Scenarios

1. **Add service** - Verify quantity counter appears on card
2. **Increase/decrease quantity** - Counter works, remove at 0
3. **Add product** - Fulfillment toggle (Pickup/Delivery) appears in cart
4. **Mark item as gift** - Checkbox toggles gift badge
5. **Single gift item** - Direct recipient form in Step 3 with anonymity toggle
6. **Multiple gifts, same recipient** - Consolidation question, single form
7. **Multiple gifts, different recipients** - Individual forms per item
8. **Anonymity toggle** - Only visible in Step 3 gift form
9. **Products only cart** - Skip scheduling step entirely
10. **Purse with zero balance** - Show "Insufficient balance", toggle disabled
11. **Purse partial coverage** - Show split payment: purse + remainder
12. **Purse full coverage** - No additional payment needed
13. **Purse + deposit** - Apply purse first, then deposit from remainder
14. **Complete flow** - Full booking with all features

