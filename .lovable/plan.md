

# Complete Checkout Modal - Unified Cart + Wizard Experience

## Overview
This plan consolidates the separate CartDrawer (side sheet) and BookingWizard (dialog) into a single unified "Complete checkout" modal. The cart becomes the first step in the checkout flow, creating a more cohesive experience.

---

## New Flow Architecture

```text
+---------------------+     +------------------+     +-------------------+     +------------------+     +--------------+
|  STEP 0: CART       | --> |  STEP 1:         | --> |  STEP 2:          | --> |  STEP 3:         | --> |  STEP 4:     |
|  Review Items       |     |  Scheduling      |     |  Booker Details   |     |  Gift Recipients |     |  Review &    |
|  (Your Cart)        |     |                  |     |                   |     |  (if any gifts)  |     |  Payment     |
+---------------------+     +------------------+     +-------------------+     +------------------+     +--------------+
```

---

## Key Changes

### 1. Rename Modal Title
- Change "Book Appointment" to **"Complete Checkout"**

### 2. Add Cart as Step 0
The cart becomes the initial step inside the modal:
- Shows all cart items with quantity controls, gift toggle, fulfillment options
- "Continue" button proceeds to scheduling (or booker if products-only)
- Back button on this step closes the modal

### 3. Remove Separate CartDrawer
- The cart icon in the header will now directly open the checkout modal
- No more separate side sheet for cart

### 4. Time Slot Display Clarification
After selecting a date, time slots appear as a button grid:
- 4 columns of time buttons (e.g., 09:00, 09:30, 10:00...)
- Only available slots are shown
- Selected time is highlighted with primary color

---

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/booking/BookingPage.tsx` | Remove CartDrawer, open wizard directly from cart icon |
| `src/pages/booking/components/BookingWizard.tsx` | Add cart step, rename title, integrate cart UI |
| `src/pages/booking/components/CartDrawer.tsx` | Can be deleted (or kept for reference) |

### Updated Step Configuration

```typescript
type WizardStep = "cart" | "scheduling" | "booker" | "gifts" | "review" | "confirmation";

const getStepConfig = () => {
  const steps = [
    { key: "cart", label: "Your Cart", icon: <ShoppingCart className="h-4 w-4" /> }
  ];
  
  if (!shouldSkipScheduling) {
    steps.push({ key: "scheduling", label: "Schedule", icon: <Calendar className="h-4 w-4" /> });
  }
  
  steps.push({ key: "booker", label: "Your Info", icon: <User className="h-4 w-4" /> });
  
  if (giftItems.length > 0) {
    steps.push({ key: "gifts", label: "Recipients", icon: <Gift className="h-4 w-4" /> });
  }
  
  steps.push({ key: "review", label: "Review", icon: <CreditCard className="h-4 w-4" /> });
  steps.push({ key: "confirmation", label: "Done", icon: <CheckCircle className="h-4 w-4" /> });
  
  return steps;
};
```

### Cart Step Content (Inline in Wizard)
The cart step will include:
- Item list with images, type badges, prices
- Quantity controls (+/- buttons)
- "This is a gift" checkbox per item
- Fulfillment toggle (Pickup/Delivery) for products
- Total at bottom
- "Continue" button to proceed

### Back Button Behavior
```typescript
const handleBack = () => {
  if (step === "cart") {
    onOpenChange(false); // Close modal
  } else if (step === "scheduling") {
    setStep("cart");
  } else if (step === "booker") {
    setStep(shouldSkipScheduling ? "cart" : "scheduling");
  } else if (step === "gifts") {
    setStep("booker");
  } else if (step === "review") {
    setStep(giftItems.length > 0 ? "gifts" : "booker");
  }
};
```

---

## UI/UX Fixes (from previous feedback)

### Calendar Container Width
Make calendar fill its container:
```tsx
<div className="flex justify-center w-full">
  <CalendarComponent
    className="rounded-md border pointer-events-auto w-full max-w-[350px]"
    // ... rest of props
  />
</div>
```

### Scrollable Content
Fix modal scrolling:
```tsx
<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
  <ScrollArea className="flex-1 min-h-0">
    {/* Step content */}
  </ScrollArea>
</DialogContent>
```

### Hide Steps Scrollbar + Reduce Padding
```tsx
<div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
  <div className="flex items-center gap-2 px-4 py-2 min-w-max">
    {/* Steps */}
  </div>
</div>
```

---

## Empty Cart Handling
When cart is empty and modal is opened:
- Show friendly message: "Your cart is empty"
- Show "Browse Services" button to close modal and return to catalog

---

## Updated BookingPage Flow

```typescript
// In BookingPage.tsx
const [checkoutOpen, setCheckoutOpen] = useState(false);

// Cart icon click opens checkout modal directly
<BookingLayout
  onCartClick={() => setCheckoutOpen(true)}
>
  {/* ... */}
</BookingLayout>

// Only the unified checkout modal
<BookingWizard
  open={checkoutOpen}
  onOpenChange={setCheckoutOpen}
  salon={salon}
  locations={locations}
/>
```

---

## Testing Checklist
- [ ] Cart icon opens Complete Checkout modal
- [ ] Cart items display correctly in first step
- [ ] Quantity controls work in cart step
- [ ] Gift checkbox works in cart step
- [ ] Products show fulfillment toggle in cart step
- [ ] Continue from cart goes to scheduling (or booker for products-only)
- [ ] Back on cart step closes modal
- [ ] Modal content scrolls properly
- [ ] Steps progress bar has no visible scrollbar
- [ ] Calendar fills container width
- [ ] Time slots appear after date selection
- [ ] Complete checkout flow works end-to-end

