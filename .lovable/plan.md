
# Comprehensive Implementation Plan: Booking Platform + Salon Platform Fixes

This plan combines the full public booking flow with all identified salon platform issues, properly prioritized.

---

## Issues Summary

| Priority | Issue | Location | Effort |
|----------|-------|----------|--------|
| 1 | Currency display - enforce salon currency globally | Multiple files | Medium |
| 2 | Service categories - empty dropdown, no CRUD | AddServiceDialog + DB | High |
| 3 | View Customer Profile action not triggering | AppointmentsPage.tsx line 540-543 | Low |
| 4 | Logo upload not working | SettingsPage.tsx line 322-335 | Medium |
| 5 | Banner upload for booking page | SettingsPage.tsx (Booking tab) | Medium |
| 6 | Notifications settings not saving | Already wired - verify | Low |
| 7 | Remove Integrations tab from Settings | SettingsPage.tsx line 57 | Low |
| 8 | Booking URL visibility with Copy button | Already exists - verify | Low |
| 9 | Salons Overview for Chain plans | New page | High |
| 10 | Full Booking Flow | New pages + hooks | High |

---

## Phase 1: Critical Settings Fixes

### 1A: Logo Upload (Currently Non-Functional)

**Current State:** Lines 322-335 show an upload button with no functionality - just static UI.

**Solution:**
- Create new storage bucket `salon-branding` (or reuse `catalog-images`)
- Add upload logic similar to `ImageUploadZone` component
- Save `logo_url` to tenants table on upload
- Display current logo if exists

**Changes:**
```tsx
// Add state for logo upload
const [logoUrl, setLogoUrl] = useState<string | null>(null);
const [isUploadingLogo, setIsUploadingLogo] = useState(false);

// Load from tenant
useEffect(() => {
  if (currentTenant?.logo_url) {
    setLogoUrl(currentTenant.logo_url);
  }
}, [currentTenant]);

// Upload handler
const handleLogoUpload = async (file: File) => {
  // Validate, upload to storage, get public URL
  // Update tenants table with logo_url
  // Refresh tenant context
};
```

### 1B: Banner Upload (New Feature for Booking Page)

**Current State:** `banner_urls` field exists in tenants table (text array, max 2) but no UI to manage it.

**Solution:** Add banner upload section to Booking Settings tab (renderBookingTab):
- Reuse `ImageUploadZone` component pattern
- Allow up to 2 banner images
- Store in `salon-branding` bucket
- Save URLs to `banner_urls` array in tenants

**UI Location:** After "Booking URL" section in Booking Settings tab:
```
+----------------------------------------+
|  Booking Page Banners                  |
|  Add up to 2 images to personalize     |
|  your booking page                     |
|  +--------+  +--------+  +--------+    |
|  |  img1  |  |  img2  |  | [Add]  |    |
|  +--------+  +--------+  +--------+    |
+----------------------------------------+
```

### 1C: Notifications Settings Verification

**Current State:** The wiring exists (lines 79-84, 176-196) - `useNotificationSettings` hook is imported and used. Save handler `handleNotificationsSave` is properly connected.

**Action:** Test to verify it's working. If there's an issue, it may be:
- Initial load timing
- Missing tenant ID on first render
- RLS policy issue

The code looks correct - adding a console.log during testing will confirm.

---

## Phase 2: Service Categories CRUD

### 2A: Database Migration (RLS Policies)

The `service_categories` table has SELECT-only RLS. Need to add:

```sql
-- INSERT policy
CREATE POLICY "Users can create service_categories for their tenants"
ON public.service_categories FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- UPDATE policy
CREATE POLICY "Users can update tenant service_categories"
ON public.service_categories FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- DELETE policy
CREATE POLICY "Users can delete tenant service_categories"
ON public.service_categories FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

### 2B: Hook Updates

**File:** `src/hooks/useServices.tsx`

Add methods:
- `createCategory(name: string, description?: string)`
- `updateCategory(id: string, updates: {...})`
- `deleteCategory(id: string)`
- `categories` state with fetch

### 2C: Dialog Components

**New Files:**
- `src/components/dialogs/AddCategoryDialog.tsx` - Simple name + description form
- `src/components/dialogs/ManageCategoriesDialog.tsx` - List/Edit/Delete/Reorder categories

### 2D: AddServiceDialog Enhancement

Add "Add new category" option at the bottom of category dropdown that opens AddCategoryDialog inline.

---

## Phase 3: View Customer Profile Fix

**Current Issue:** Line 540-543 - DropdownMenuItem has no onClick handler.

**File:** `src/pages/salon/AppointmentsPage.tsx`

**Changes:**

1. Import CustomerDetailDialog
2. Add state for dialog and selected customer:
```tsx
const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
const [selectedCustomerForDialog, setSelectedCustomerForDialog] = useState<Customer | null>(null);
```

3. Add onClick to DropdownMenuItem:
```tsx
<DropdownMenuItem
  onClick={() => {
    setSelectedCustomerForDialog(apt.customer);
    setCustomerDialogOpen(true);
  }}
>
  <User className="w-4 h-4 mr-2" />
  View Customer Profile
</DropdownMenuItem>
```

4. Add dialog at end of component:
```tsx
<CustomerDetailDialog
  open={customerDialogOpen}
  onOpenChange={setCustomerDialogOpen}
  customer={selectedCustomerForDialog}
/>
```

---

## Phase 4: Currency Consistency

### 4A: Create Currency Utility

**New File:** `src/lib/currency.ts`

```typescript
const currencySymbols: Record<string, string> = {
  NGN: "₦",
  GHS: "₵",
  USD: "$",
  EUR: "€",
  GBP: "£",
  ZAR: "R",
  KES: "KSh",
};

export function formatCurrency(amount: number, currencyCode: string): string {
  const symbol = currencySymbols[currencyCode] || currencyCode + " ";
  return `${symbol}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getCurrencySymbol(currencyCode: string): string {
  return currencySymbols[currencyCode] || currencyCode;
}
```

### 4B: Update All Currency Displays

**Files to audit and fix:**
- `src/components/dialogs/AddServiceDialog.tsx` - Hardcoded "GHS" suffix
- `src/pages/salon/PaymentsPage.tsx` - Check all amount displays
- `src/pages/salon/SalonDashboard.tsx` - Revenue display
- `src/pages/salon/ReportsPage.tsx` - All financial figures
- `src/components/dialogs/RecordPaymentDialog.tsx` - Amount input
- `src/components/dialogs/AddProductDialog.tsx` - Price field
- `src/components/dialogs/AddPackageDialog.tsx` - Price field

---

## Phase 5: Settings Cleanup

### 5A: Remove Integrations Tab

**File:** `src/pages/salon/SettingsPage.tsx`

**Line 57:** Remove from settingsTabs array:
```tsx
// Remove this line:
{ id: "integrations", label: "Integrations", icon: Link },
```

**Line 1092:** Remove the conditional render (will automatically not render).

### 5B: Booking URL Enhancement (Verification)

The booking URL display with copy functionality already exists at lines 619-633. Verify:
1. URL shows when `currentTenant?.slug` exists
2. Copy button works and shows "Copied!" feedback
3. URL visibility tied to `online_booking_enabled` toggle

If slug is missing, the URL won't display. May need to ensure slug is set during onboarding.

---

## Phase 6: Salons Overview (Chain Plans)

### 6A: Access Control

Only visible when:
- `currentTenant?.plan === 'chain'`
- User role is `owner` or `manager` with specific permission

### 6B: Navigation Update

**File:** `src/components/layout/SalonSidebar.tsx`

Add conditional nav item after Dashboard:
```tsx
{currentTenant?.plan === 'chain' && (
  <NavItem 
    label="Salons Overview" 
    icon={Building2} 
    path="/salon/overview"
  />
)}
```

### 6C: New Page

**File:** `src/pages/salon/SalonsOverviewPage.tsx`

Features:
- Performance cards per location (revenue, bookings, utilization)
- Comparative charts
- Best/worst performing locations
- Quick location switching

### 6D: Route Addition

**File:** `src/App.tsx`
```tsx
<Route path="/salon/overview" element={<SalonsOverviewPage />} />
```

---

## Phase 7: Full Booking Flow

### 7A: Database - Public Access Policies

```sql
-- Allow anonymous users to read booking-enabled tenants
CREATE POLICY "Anon can read booking-enabled tenants by slug"
ON public.tenants FOR SELECT
TO anon
USING (online_booking_enabled = true AND slug IS NOT NULL);

-- Allow anonymous users to read active services
CREATE POLICY "Anon can read active services"
ON public.services FOR SELECT
TO anon
USING (
  status = 'active' 
  AND tenant_id IN (
    SELECT id FROM tenants WHERE online_booking_enabled = true
  )
);

-- Similar for packages, products, locations, service_categories
```

### 7B: Storage Bucket

Create `salon-branding` bucket for logos and banners (public read).

### 7C: New Files Structure

```
src/pages/booking/
  BookingPage.tsx              # Main container
  components/
    BookingLayout.tsx          # Header + cart
    SalonHeader.tsx            # Branding (logo, banners)
    CatalogView.tsx            # Services/Packages/Products
    ServiceCard.tsx
    PackageCard.tsx
    ProductCard.tsx
    CartDrawer.tsx             # Shopping cart
    BookingWizard.tsx          # Multi-step flow
    DateTimeSelector.tsx
    CustomerForm.tsx
    BookingSummary.tsx
    PaymentStep.tsx
    ConfirmationView.tsx

src/hooks/booking/
  usePublicSalon.tsx           # Fetch tenant by slug
  usePublicServices.tsx
  usePublicPackages.tsx
  usePublicProducts.tsx
  usePublicLocations.tsx
  useAvailableSlots.tsx
  useBookingCart.tsx
  useCreateBooking.tsx

supabase/functions/
  create-public-booking/index.ts
```

### 7D: Routing

**File:** `src/App.tsx`
```tsx
<Route path="/b/:slug" element={<BookingPage />} />
<Route path="/b/:slug/*" element={<BookingPage />} />
```

### 7E: Booking Flow Steps

1. **Catalog** - Browse services/packages/products
2. **Cart** - Right drawer showing selected items
3. **Date/Time** - Calendar + available slots
4. **Customer Info** - Name, email, phone
5. **Summary** - Review + deposit calculation
6. **Payment** - Stripe/Paystack or pay-at-salon
7. **Confirmation** - Success screen

### 7F: Currency in Booking

The booking page MUST use the salon's currency from `tenant.currency`, displayed using the shared `formatCurrency` utility.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/currency.ts` | Create | Currency formatting utility |
| `src/pages/salon/SettingsPage.tsx` | Modify | Logo/banner upload, remove Integrations |
| `src/pages/salon/AppointmentsPage.tsx` | Modify | Fix View Customer Profile |
| `src/hooks/useServices.tsx` | Modify | Add category CRUD methods |
| `src/components/dialogs/AddCategoryDialog.tsx` | Create | Category creation |
| `src/components/dialogs/ManageCategoriesDialog.tsx` | Create | Category management |
| `src/components/dialogs/AddServiceDialog.tsx` | Modify | Category dropdown + add option |
| `src/components/dialogs/AddProductDialog.tsx` | Modify | Fix currency display |
| `src/components/dialogs/AddPackageDialog.tsx` | Modify | Fix currency display |
| `src/pages/salon/SalonsOverviewPage.tsx` | Create | Chain plan dashboard |
| `src/components/layout/SalonSidebar.tsx` | Modify | Add Salons Overview nav |
| `src/pages/booking/BookingPage.tsx` | Create | Main booking container |
| `src/pages/booking/components/*` | Create | All booking components |
| `src/hooks/booking/*` | Create | All booking hooks |
| `supabase/functions/create-public-booking` | Create | Booking edge function |
| Database migrations | Create | RLS policies + storage bucket |

---

## Implementation Order

| Step | Task | Priority |
|------|------|----------|
| 1 | Create currency utility | High |
| 2 | Fix currency displays across app | High |
| 3 | Add service_categories RLS policies | High |
| 4 | Implement category CRUD in useServices | High |
| 5 | Create category dialogs | High |
| 6 | Update AddServiceDialog with categories | High |
| 7 | Fix View Customer Profile action | High |
| 8 | Create salon-branding storage bucket | High |
| 9 | Implement logo upload in Settings | High |
| 10 | Add banner upload to Booking Settings | High |
| 11 | Verify notifications settings work | Medium |
| 12 | Remove Integrations tab | Low |
| 13 | Create Salons Overview page | Medium |
| 14 | Add public RLS policies for booking | High |
| 15 | Create booking hooks | High |
| 16 | Build booking page components | High |
| 17 | Create booking edge function | High |
| 18 | Wire complete booking flow | High |
| 19 | Mobile responsiveness pass | Medium |

---

## Technical Notes

### Storage Bucket for Branding

Need to create `salon-branding` bucket:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('salon-branding', 'salon-branding', true);

-- RLS for authenticated users to upload
CREATE POLICY "Users can upload branding images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'salon-branding');

-- Public read
CREATE POLICY "Public can view branding images"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'salon-branding');
```

### Logo/Banner Constraints
- Logo: Single image, max 2MB, stored in `logo_url`
- Banners: Up to 2 images, stored in `banner_urls[]`
- Format: JPG, PNG, WebP

### Booking Flow Status
```
auto_confirm_bookings = true:
  [created] -> status: "scheduled"

auto_confirm_bookings = false:
  [created] -> status: "pending" (needs manual confirmation)
```
