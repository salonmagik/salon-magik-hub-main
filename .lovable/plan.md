

# Comprehensive Booking & Catalog Enhancement Plan

## Summary

This plan consolidates all requested enhancements into a single implementation roadmap covering:

1. **Payment Flow Fixes** - Fix skipped payments, add provider selection (Stripe/Paystack), implement escrow logic
2. **Calendar Improvements** - Fix "No available times" bug, improve UI with availability indicators
3. **Booking Page Visuals** - Item card images with hover slider, banner carousel, contact info display
4. **Catalog Multi-Select & Bulk Actions** - Checkbox selection, floating action bar, package creation from selected items
5. **Promotions & Referrals** - Salon-side promo code and referral management

---

## Part 1: Payment Flow Fixes

### Problem
In `BookingWizard.tsx`, after receiving `checkoutUrl` from the payment session, the code shows a toast and skips to confirmation instead of redirecting to the payment gateway.

### Solution

#### A. Fix Payment Redirect
```typescript
// Current broken code (lines 251-256):
if (paymentResponse.data?.checkoutUrl) {
  toast({ title: "Payment would be required", ... }); // Shows toast
}
setStep("confirmation"); // Skips payment!

// Fixed code:
if (paymentResponse.data?.checkoutUrl) {
  window.location.href = paymentResponse.data.checkoutUrl;
  return; // Stop here - don't go to confirmation yet
}
```

#### B. Add Payment Provider Selection Step

New step between "review" and "confirmation":

```
Review Step → Payment Step (NEW) → Confirmation Step
```

**New Component: `PaymentStep.tsx`**
- Tabs for Stripe (International) and Paystack (Africa)
- Display available payment methods per provider:
  - **Stripe:** Card, Apple Pay, Google Pay, Bank transfers
  - **Paystack:** Card, Bank Transfer, USSD, Mobile Money
- Recommend provider based on currency/region (user can override)
- Amount summary with currency

```
+--------------------------------------------------+
|  Select Payment Method                           |
|                                                  |
|  [Stripe ✓ Recommended] [Paystack]              |
|                                                  |
|  Payment Methods:                                |
|  [Card] [Apple Pay] [Google Pay]                |
|                                                  |
|  Amount Due: $150.00                            |
|                                                  |
|  [Pay Now]                                      |
+--------------------------------------------------+
```

#### C. Escrow Logic for Manual Confirmation

**Database Changes:**
```sql
ALTER TABLE payment_intents
ADD COLUMN funds_status TEXT DEFAULT 'pending' 
  CHECK (funds_status IN ('pending', 'held', 'released', 'refunded')),
ADD COLUMN released_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN refunded_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE appointments
ADD COLUMN confirmation_status TEXT DEFAULT 'auto' 
  CHECK (confirmation_status IN ('auto', 'pending', 'confirmed', 'rejected'));

CREATE TABLE reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time TIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  requested_by TEXT NOT NULL CHECK (requested_by IN ('salon', 'customer')),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Payment Webhook Logic:**
```
Payment Success
      │
      ▼
┌─────────────────┐
│ Check tenant's  │
│ auto_confirm    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
   ON        OFF
    │         │
    ▼         ▼
┌────────┐  ┌──────────────┐
│Release │  │Hold funds    │
│funds   │  │(escrow)      │
│Invoice │  │Notify salon  │
│Confirm │  │with actions: │
└────────┘  │• Confirm     │
            │• Reject      │
            │• Reschedule  │
            │• Contact     │
            └──────────────┘
```

**Salon Action Handlers:**
- **Confirm:** Release funds, generate invoice, send confirmation email
- **Reject:** Process automatic refund, notify booker
- **Reschedule:** Create proposal, send to customer for acceptance
- **Contact:** Copy customer phone with country code

#### D. Update Edge Functions

**`create-payment-session/index.ts`:**
- Add `preferredGateway` parameter to allow user selection
- Update CORS headers to include all required headers

**`payment-webhook/index.ts`:**
- Add escrow logic based on `auto_confirm_bookings` setting
- Generate and send invoices on confirmation
- Send gift notifications if applicable

**New: `process-booking-decision/index.ts`:**
- Handle confirm/reject/reschedule/contact actions from salon

---

## Part 2: Calendar Improvements

### Problem
"No available times for this date" error caused by:
1. Weekend dates selected when salon is Mon-Fri
2. Timezone bug: `date.toISOString()` causing day shifts

### Solution

#### A. Fix Date Query Keys
```typescript
// In useAvailableSlots.tsx and useAvailableDays.tsx
// Change from:
queryKey: ["available-slots", tenantId, location?.id, date?.toISOString(), ...]

// To:
queryKey: ["available-slots", tenantId, location?.id, date ? format(date, "yyyy-MM-dd") : undefined, ...]
```

#### B. Improve Calendar UI

**Visual Day States:**
- **Unavailable (closed/past):** Grayed out, unclickable
- **Has Bookings:** Shows brand-colored dot, still clickable
- **Fully Available:** Normal styling, clickable
- **Selected:** Highlighted with brand color

```typescript
const getDayModifiers = () => ({
  disabled: (date: Date) => {
    if (date < today) return true;
    const dayName = format(date, "EEEE").toLowerCase();
    return !selectedLocation?.opening_days?.includes(dayName);
  },
  hasAvailability: (date: Date) => isDateAvailable(date),
  hasBookings: (date: Date) => {
    const dayInfo = availableDays?.find(d => 
      format(d.date, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
    return dayInfo?.hasSlots && dayInfo?.bookedCount > 0;
  },
});
```

**CSS for availability dot:**
```css
.day-available::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--brand-color);
}
```

---

## Part 3: Booking Page Visuals

### A. Item Card Images with Hover Slider

**Problem:** `ItemCard` receives `imageUrl` prop but never renders it.

**Solution:** Add `ImageSlider` component to item cards:

```
+-------------------------------------------+
| Service                           $50.00  |
| +----------------+                        |
| |                |  Swedish Massage       |
| |   [IMAGE]      |  Relaxing full body    |
| |   ← →  • •     |  massage treatment     |
| +----------------+                        |
| [60 min]                     [Add]        |
+-------------------------------------------+
```

**Features:**
- Shows first image by default
- Navigation arrows appear on hover (when multiple images)
- Dot indicators show current position
- Placeholder icon when no images

```typescript
function ImageSlider({ images, alt }: { images: string[]; alt: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  
  return (
    <div 
      className="relative aspect-square rounded-lg overflow-hidden"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <img src={images[activeIndex]} alt={alt} className="w-full h-full object-cover" />
      
      {images.length > 1 && isHovering && (
        <>
          <button onClick={goPrev} className="absolute left-1 top-1/2 ...">
            <ChevronLeft />
          </button>
          <button onClick={goNext} className="absolute right-1 top-1/2 ...">
            <ChevronRight />
          </button>
        </>
      )}
      
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {images.map((_, i) => (
            <div className={cn("w-1.5 h-1.5 rounded-full", 
              i === activeIndex ? "bg-white" : "bg-white/50"
            )} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### B. Banner Carousel with Auto-Rotate

**Features:**
- Auto-advances every 30 seconds
- Manual navigation arrows (visible on hover)
- Dot indicators for position
- Smooth crossfade transitions
- Pauses auto-advance on hover

```typescript
function BannerCarousel({ bannerUrls, salonName, autoPlayInterval = 30000 }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  
  // Auto-advance timer
  useEffect(() => {
    if (bannerUrls.length <= 1 || isHovering) return;
    const timer = setInterval(goNext, autoPlayInterval);
    return () => clearInterval(timer);
  }, [bannerUrls.length, isHovering, autoPlayInterval]);
  
  return (
    <div className="relative h-48 md:h-64 rounded-xl overflow-hidden"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}>
      
      {/* Images with crossfade */}
      {bannerUrls.map((url, i) => (
        <img
          key={url}
          src={url}
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
            i === activeIndex ? "opacity-100" : "opacity-0"
          )}
        />
      ))}
      
      {/* Navigation & indicators */}
      {bannerUrls.length > 1 && isHovering && (
        <> <PrevButton /> <NextButton /> </>
      )}
      <DotIndicators />
    </div>
  );
}
```

### C. Salon Contact Info Display

**Database Changes:**
```sql
ALTER TABLE tenants
ADD COLUMN contact_phone TEXT,
ADD COLUMN show_contact_on_booking BOOLEAN DEFAULT false;

ALTER TABLE locations
ADD COLUMN phone TEXT;
```

**Settings Page Toggle:**
```tsx
<div className="flex items-center justify-between">
  <div>
    <Label>Show Contact Info on Booking Page</Label>
    <p className="text-sm text-muted-foreground">
      Display your phone number and address to customers
    </p>
  </div>
  <Switch checked={showContactOnBooking} onCheckedChange={setShowContactOnBooking} />
</div>
```

**Booking Page Display:**
```tsx
{salon.show_contact_on_booking && (
  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
    {salon.contact_phone && (
      <a href={`tel:${salon.contact_phone}`} className="flex items-center gap-1.5">
        <Phone className="h-4 w-4" />
        {salon.contact_phone}
      </a>
    )}
    {location?.address && (
      <div className="flex items-center gap-1.5">
        <MapPin className="h-4 w-4" />
        {location.address}, {location.city}
      </div>
    )}
  </div>
)}
```

---

## Part 4: Catalog Multi-Select & Bulk Actions

### Tab Reorder & Rename
- Module: "Services & Products"
- Tab order: All, Services, Products, Packages, Vouchers

### Multi-Select Implementation

Replace `ItemCard` with `SelectableItemCard` across all tabs:

```tsx
<SelectableItemCard
  item={...}
  isSelected={selectedItems.has(item.id)}
  onSelect={(id) => handleSelectItem(id, "service")}
/>
```

### Floating Bulk Actions Bar

```
+--------------------------------------------------+
| [3 items selected]  [Package] [Flag] [Archive] [Delete]  [Clear] |
+--------------------------------------------------+
```

**Actions by Item Type:**

| Action | Services | Products | Packages | Vouchers | Permission |
|--------|----------|----------|----------|----------|------------|
| Create Package | ✓ | ✓ | ✗ | ✗ | Any staff |
| Flag | ✓ | ✓ | ✓ | ✓ | Any staff |
| Archive | ✓ | ✓ | ✓ | ✗ | Owner/Manager |
| Discontinue | ✗ | ✗ | ✗ | ✓ | Owner/Manager |
| Delete | ✓ | ✓ | ✓ | ✓ | Owner only |

### Item Usage Check (Before Delete/Archive)

```typescript
export async function checkItemUsage(itemIds: string[], itemType: string) {
  // Check if services are in packages
  // Check if products are in pending deliveries
  // Check if items have active appointments
  
  return {
    hasUsage: boolean,
    packageNames: string[],
    appointmentCount: number,
    deliveryCount: number,
  };
}
```

If item is in use, show `ItemInUseDialog` explaining where it's used and suggesting Archive instead.

### Database Changes for Flagging
```sql
ALTER TABLE services ADD COLUMN is_flagged BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN is_flagged BOOLEAN DEFAULT false;
ALTER TABLE packages ADD COLUMN is_flagged BOOLEAN DEFAULT false;
ALTER TABLE vouchers ADD COLUMN is_flagged BOOLEAN DEFAULT false;
```

---

## Part 5: Promotions & Referrals

### New Settings Tab: "Promotions"

**Sections:**
1. **Referral Program**
   - Display salon's unique referral code
   - Generate new codes
   - List of codes with status (consumed/available)
   - Show referral discounts earned

2. **Available Discounts**
   - Waitlist discount (months 1-6, 12% off)
   - Referral discounts with expiry dates
   - Invoice discount history

3. **Customer Promo Codes** (stretch)
   - Create codes for booking checkout
   - Set percentage or fixed discounts
   - Validity periods and usage limits

---

## Part 6: Brand Theming Fix

### Problem
"Continue" button white-on-white for light brand colors.

### Solution

**New utility: `src/lib/color.ts`**
```typescript
export function hexToRgb(hex: string): { r: number; g: number; b: number };
export function isLightColor(hex: string): boolean;
export function getContrastTextColor(hex: string): string; // "white" or "black"
```

**Apply at document root:**
```typescript
useEffect(() => {
  if (!salon?.brand_color) return;
  
  const root = document.documentElement;
  const textColor = isLightColor(salon.brand_color) ? '#1a1a1a' : '#ffffff';
  
  root.style.setProperty('--brand-color', salon.brand_color);
  root.style.setProperty('--brand-foreground', textColor);
  
  return () => {
    root.style.removeProperty('--brand-color');
    root.style.removeProperty('--brand-foreground');
  };
}, [salon?.brand_color]);
```

**Update button styling:**
```tsx
<Button
  style={{ 
    backgroundColor: "var(--brand-color)",
    color: "var(--brand-foreground)" 
  }}
>
  Continue
</Button>
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| **Payment Flow** | | |
| `src/pages/booking/components/PaymentStep.tsx` | CREATE | Payment provider selection |
| `src/pages/booking/components/BookingWizard.tsx` | EDIT | Add payment step, fix redirect |
| `supabase/functions/create-payment-session/index.ts` | EDIT | Add preferred gateway, CORS |
| `supabase/functions/payment-webhook/index.ts` | EDIT | Escrow logic, auto-confirm |
| `supabase/functions/process-booking-decision/index.ts` | CREATE | Confirm/reject/reschedule |
| **Calendar** | | |
| `src/hooks/booking/useAvailableSlots.tsx` | EDIT | Fix date query key |
| `src/hooks/booking/useAvailableDays.tsx` | EDIT | Fix date query key |
| `src/pages/booking/components/SchedulingStep.tsx` | EDIT | Improved calendar UI |
| **Visuals** | | |
| `src/pages/booking/components/ItemCard.tsx` | EDIT | Add image slider |
| `src/pages/booking/components/SalonHeader.tsx` | EDIT | Banner carousel + contact |
| `src/pages/booking/components/CatalogView.tsx` | EDIT | Pass full imageUrls array |
| **Catalog** | | |
| `src/pages/salon/ServicesPage.tsx` | EDIT | Multi-select, bulk actions |
| `src/components/catalog/SelectablePackageCard.tsx` | CREATE | Selectable package card |
| `src/components/catalog/SelectableVoucherCard.tsx` | CREATE | Selectable voucher card |
| `src/lib/catalog-utils.ts` | CREATE | Item usage checking |
| **Promotions** | | |
| `src/pages/salon/SettingsPage.tsx` | EDIT | Add Promotions tab |
| **Theming** | | |
| `src/lib/color.ts` | CREATE | Color contrast utilities |
| `src/pages/booking/BookingPage.tsx` | EDIT | Global brand theme |

---

## Database Migrations

```sql
-- Payment escrow
ALTER TABLE payment_intents
ADD COLUMN funds_status TEXT DEFAULT 'pending',
ADD COLUMN released_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN refunded_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE appointments
ADD COLUMN confirmation_status TEXT DEFAULT 'auto';

-- Reschedule requests
CREATE TABLE reschedule_requests (...);

-- Contact info
ALTER TABLE tenants
ADD COLUMN contact_phone TEXT,
ADD COLUMN show_contact_on_booking BOOLEAN DEFAULT false;

ALTER TABLE locations ADD COLUMN phone TEXT;

-- Flagging support
ALTER TABLE services ADD COLUMN is_flagged BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN is_flagged BOOLEAN DEFAULT false;
ALTER TABLE packages ADD COLUMN is_flagged BOOLEAN DEFAULT false;
ALTER TABLE vouchers ADD COLUMN is_flagged BOOLEAN DEFAULT false;
```

---

## Testing Checklist

### Payment Flow
- [ ] User can select Stripe or Paystack
- [ ] Payment redirects to correct gateway
- [ ] Successful payment with auto-confirm releases funds
- [ ] Successful payment without auto-confirm holds funds
- [ ] Salon can confirm/reject/reschedule/contact
- [ ] Rejection triggers automatic refund
- [ ] Failed payment shows clear error message

### Calendar
- [ ] Closed days are grayed out and unclickable
- [ ] Available days show brand-colored dot
- [ ] Selecting valid date shows available times
- [ ] No timezone-related date shift issues

### Visuals
- [ ] Item cards show images with hover slider
- [ ] Banner auto-rotates every 30 seconds
- [ ] Banner navigation appears on hover
- [ ] Contact info shows when toggle enabled
- [ ] Phone number is clickable (tel: link)

### Catalog
- [ ] Checkboxes appear on all item cards
- [ ] Selecting items shows floating action bar
- [ ] "Create Package" pre-fills package dialog
- [ ] In-use items show warning dialog
- [ ] Only owners can delete
- [ ] Only owners/managers can archive

### Theming
- [ ] Continue button visible for light brand colors
- [ ] Continue button visible for dark brand colors
- [ ] All primary elements use brand color

