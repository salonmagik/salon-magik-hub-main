

# Comprehensive Implementation Plan

This plan consolidates all pending features and new requirements into a structured, implementation-ready format.

---

## Summary of All Changes

| Category | Items |
|----------|-------|
| **Customer Management** | Dropdown actions (View, Flag, VIP, Delete), role-based permissions, page header structure |
| **Permissions System** | Owner-editable role permissions, individual overrides, module-based access control |
| **Auth & Onboarding** | Split first/last name, Ghana default country, disabled buttons until form valid, correct pricing, step reordering |
| **Staff Invitations** | Email sending for owner invite, staff accept-invite flow, auto-generated password with forced reset |
| **Booking Platform** | Full public catalog, cart with gifts/scheduling, slot capacity, checkout edge function |
| **Settings Fixes** | Logo upload RLS fix, booking URL generation, slot capacity setting |
| **Platform-Wide** | Form validation pattern, Ghana-first country priority, dynamic currency |

---

## Part 1: Customer Card Actions with Permissions

### 1.1 Update CustomersPage.tsx

Add dropdown menu to customer cards with role-based actions:

| Action | Permission Required | Description |
|--------|---------------------|-------------|
| View Details | All roles | Opens CustomerDetailDialog |
| Make VIP | Manager, Owner | Sets status to "vip" |
| Flag Customer | Manager, Owner | Opens dialog for reason, sets "blocked" |
| Delete | Owner (or Manager with specific permission) | Confirmation required, soft delete |

**Implementation:**
- Import DropdownMenu components
- Compute userRole from auth context
- Add permission checks: `canMakeVIP`, `canFlag`, `canDelete`
- Replace "More" button with DropdownMenu
- Add state for FlagCustomerDialog

### 1.2 Database Migration

```sql
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS flag_reason text DEFAULT NULL;
```

### 1.3 New Dialog Component

Create `src/components/dialogs/FlagCustomerDialog.tsx`:
- Text input for reason (required)
- Confirmation button
- On submit: Update customer status to "blocked", save flag_reason

### 1.4 Update useCustomers Hook

Add methods:
- `updateCustomerStatus(id, status)` - For VIP/active/blocked
- `flagCustomer(id, reason)` - Set blocked + save reason
- `deleteCustomer(id)` - Soft delete (set status to "deleted")

---

## Part 2: Permissions System (RBAC)

### 2.1 Database Schema

**Table: `role_permissions`**
```sql
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  module text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, module)
);
```

**Table: `user_permission_overrides`**
```sql
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  module text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, module)
);
```

**RLS Policies:**
- Only owners can INSERT/UPDATE/DELETE on these tables
- All tenant members can SELECT

### 2.2 Module Identifiers

| Module Key | Description |
|------------|-------------|
| `dashboard` | Dashboard page |
| `appointments` | All appointments |
| `appointments:own` | Own appointments only |
| `calendar` | Calendar view |
| `customers` | Customer management |
| `customers:flag` | Flag customers |
| `customers:vip` | Mark VIP |
| `customers:delete` | Delete customers |
| `services` | Products & Services |
| `payments` | Payments page |
| `reports` | Reports & analytics |
| `messaging` | Messaging center |
| `journal` | Journal entries |
| `staff` | Staff management |
| `settings` | Settings page |

### 2.3 Default Permissions

| Module | Owner | Manager | Supervisor | Receptionist | Staff |
|--------|-------|---------|------------|--------------|-------|
| dashboard | Yes | Yes | Yes | Yes | No |
| appointments | Yes | Yes | Yes | Yes | No |
| appointments:own | Yes | Yes | Yes | Yes | Yes |
| calendar | Yes | Yes | Yes | Yes | No |
| customers | Yes | Yes | Yes | Yes | No |
| customers:flag | Yes | Yes | No | No | No |
| customers:vip | Yes | Yes | No | No | No |
| customers:delete | Yes | No | No | No | No |
| services | Yes | Yes | Yes | No | No |
| payments | Yes | Yes | No | No | No |
| reports | Yes | Yes | No | No | No |
| messaging | Yes | Yes | Yes | Yes | No |
| journal | Yes | Yes | No | No | No |
| staff | Yes | Yes | No | No | No |
| settings | Yes | No | No | No | No |

### 2.4 Seed Defaults on Tenant Creation

When a tenant is created during onboarding, seed default permissions for all roles.

### 2.5 New Hook: usePermissions

Create `src/hooks/usePermissions.tsx`:
- Fetch role_permissions for current user's role
- Fetch user_permission_overrides for current user
- Merge: overrides take precedence over role defaults
- Export: `hasPermission(module)`, `permissions`, `isLoading`

### 2.6 Sidebar Navigation Filtering

Update `src/components/layout/SalonSidebar.tsx`:
- Add `module` property to each nav item
- Filter items based on `hasPermission(item.module)`
- Staff only sees modules they have access to

### 2.7 Route-Level Protection

Create `src/components/auth/ModuleProtectedRoute.tsx`:
- Wraps protected pages
- Checks `hasPermission(module)`
- Redirects to dashboard or shows "Access Denied" if denied

### 2.8 Staff Page - Permissions Tab (Owner Only)

Add third tab to StaffPage: "Roles & Permissions"
- Only visible when current user is Owner
- Role defaults editor: Checkbox matrix (role vs module)
- Individual overrides: Table of users with custom permissions
- Edit user permissions dialog

---

## Part 3: Sign-up Flow Improvements

### 3.1 Split Full Name into First/Last Name

**File: `src/pages/auth/SignupPage.tsx`**

Change form state:
```typescript
const [formData, setFormData] = useState({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
});
```

Update `signUp` call:
```typescript
data: {
  first_name: formData.firstName,
  last_name: formData.lastName,
  phone: formData.phone,
}
```

Update form UI with two input fields side by side.

### 3.2 Change Default Country to Ghana

```tsx
<AuthPhoneInput defaultCountry="GH" />
```

### 3.3 Disable Button Until Form Valid + Terms Accepted

```typescript
const isFormValid = useMemo(() => (
  formData.firstName.trim() !== "" &&
  formData.lastName.trim() !== "" &&
  formData.email.trim() !== "" &&
  formData.phone.trim() !== "" &&
  formData.password.length >= 8 &&
  formData.password === formData.confirmPassword &&
  acceptTerms
), [formData, acceptTerms]);
```

```tsx
<AuthButton type="submit" isLoading={isLoading} disabled={!isFormValid || isLoading}>
  Create account
</AuthButton>
```

---

## Part 4: Country Priority Update

### 4.1 Update PRIORITY_COUNTRIES

**File: `src/lib/countries.ts`**

Reorder to put Ghana first:
```typescript
export const PRIORITY_COUNTRIES: Country[] = [
  { code: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" },      // First
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },   // Second
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
];

export const DEFAULT_COUNTRY = PRIORITY_COUNTRIES[0]; // Ghana
```

---

## Part 5: Onboarding Flow Updates

### 5.1 Remove Duplicate Profile Step

Since signup now collects firstName, lastName, email, and phone, remove the ProfileStep from the onboarding flow.

### 5.2 Reorder Steps

**New Flow:**
```
role -> (owner-invite) -> business -> plan -> locations (if chain) -> review
```

This ensures currency is known before displaying plan pricing.

### 5.3 Use Auth Data in Onboarding

```typescript
const { user } = useAuth();

const firstName = user?.user_metadata?.first_name || "";
const lastName = user?.user_metadata?.last_name || "";
const email = user?.email || "";
const phone = user?.user_metadata?.phone || "";
```

---

## Part 6: Fix Pricing in PlanStep

### 6.1 Create Pricing Data

**File: `src/lib/pricing.ts`**

```typescript
export type Currency = "USD" | "NGN" | "GHS";
export type PlanId = "solo" | "studio" | "chain";

export interface PriceTier {
  monthly: number;
  annual: number;
  effectiveMonthly: number;
}

export const PRICING: Record<PlanId, Record<Currency, PriceTier>> = {
  solo: {
    USD: { monthly: 15, annual: 158.40, effectiveMonthly: 13.20 },
    NGN: { monthly: 12000, annual: 126720, effectiveMonthly: 10560 },
    GHS: { monthly: 180, annual: 1900.80, effectiveMonthly: 158.40 },
  },
  studio: {
    USD: { monthly: 30, annual: 316.80, effectiveMonthly: 26.40 },
    NGN: { monthly: 15000, annual: 158400, effectiveMonthly: 13200 },
    GHS: { monthly: 360, annual: 3801.60, effectiveMonthly: 316.80 },
  },
  chain: {
    USD: { monthly: 45, annual: 0, effectiveMonthly: 45 },
    NGN: { monthly: 35000, annual: 0, effectiveMonthly: 35000 },
    GHS: { monthly: 540, annual: 0, effectiveMonthly: 540 },
  },
};

export const CHAIN_ADDITIONAL_LOCATIONS = {
  "2-3": { USD: 30, NGN: 25000, GHS: 360 },
  "4-10": { USD: 20, NGN: 18000, GHS: 240 },
  "11+": "custom" as const,
};

export const TRIAL_DAYS = 14;
```

### 6.2 Update PlanStep Component

Accept currency prop and display dynamic pricing:

```typescript
interface PlanStepProps {
  selectedPlan: SubscriptionPlan | null;
  onPlanSelect: (plan: SubscriptionPlan) => void;
  currency: Currency;
}
```

- Remove hardcoded "Free" for Solo - all plans are paid
- Show correct prices based on selected country's currency
- Add billing cycle toggle (monthly/annual) to show savings
- Display "14-day free trial" badge on all plans

---

## Part 7: Owner Invitation Email

### 7.1 Update send-staff-invitation Edge Function

The existing `send-staff-invitation` function can be reused for owner invitations by passing `role: 'owner'`.

Alternatively, create a separate `send-owner-invitation` function for clarity.

### 7.2 Integrate in Onboarding

When non-owner completes onboarding and provides owner details:

```typescript
if (!isOwner && ownerInvite.email) {
  await supabase.functions.invoke("send-staff-invitation", {
    body: {
      firstName: ownerInvite.firstName,
      lastName: ownerInvite.lastName,
      email: ownerInvite.email,
      phone: ownerInvite.phone,
      role: "owner",
      tenantId: tenantId,
      invitedByName: `${firstName} ${lastName}`,
    },
  });
}
```

---

## Part 8: Staff Invitation Flow

### 8.1 Accept Invite Page

Create `src/pages/auth/AcceptInvitePage.tsx`:

1. Read `?token=xxx` from URL
2. Validate token against `staff_invitations` table
3. If valid and not expired:
   - Show invitation details (salon name, role)
   - User creates password
   - Account created via Supabase Auth
4. On success:
   - Update invitation status to 'accepted'
   - Create user_roles entry
   - Redirect to salon dashboard

### 8.2 Auto-Generated Password Option

When manager creates staff via "Generate temporary password":
1. Generate secure random password
2. Display password to manager (copy button)
3. Create user with `requires_password_reset: true` in metadata
4. Staff logs in with temp password, forced to reset on first login

### 8.3 First Login Password Reset

**File: `src/components/auth/ProtectedRoute.tsx`**

```typescript
const requiresPasswordReset = user?.user_metadata?.requires_password_reset === true;

if (requiresPasswordReset) {
  return <Navigate to="/reset-password?first_login=true" />;
}
```

### 8.4 Route Addition

```tsx
<Route path="/accept-invite" element={<AcceptInvitePage />} />
```

---

## Part 9: Settings Fixes

### 9.1 Logo Upload RLS Fix

The logo upload code exists but may fail due to storage RLS policies. Add/verify:

```sql
CREATE POLICY "Authenticated users can upload branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'salon-branding');

CREATE POLICY "Authenticated users can update branding"  
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'salon-branding');

CREATE POLICY "Public can view branding"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'salon-branding');
```

### 9.2 Booking URL Generation

If `tenants.slug` is null, show button to generate:

```tsx
{!bookingUrl && (
  <div className="space-y-2">
    <Label>Booking URL</Label>
    <div className="p-4 rounded-lg bg-muted">
      <p className="text-sm text-muted-foreground mb-2">
        Generate a booking URL to enable online bookings
      </p>
      <Button onClick={handleGenerateSlug}>
        Generate Booking URL
      </Button>
    </div>
  </div>
)}
```

Slug generation logic:
1. Convert salon name to URL-friendly slug
2. Check uniqueness in database
3. If duplicate, append random suffix
4. Update tenant record

### 9.3 Slot Capacity Setting

Add to tenants table:
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS 
  slot_capacity_default integer NOT NULL DEFAULT 1;
```

Add UI in Booking Settings tab:
```tsx
<div className="space-y-2">
  <Label>Default bookings per time slot</Label>
  <Input
    type="number"
    min={1}
    max={100}
    value={bookingSettings.slotCapacityDefault}
    onChange={(e) => setBookingSettings(prev => ({
      ...prev,
      slotCapacityDefault: parseInt(e.target.value) || 1
    }))}
  />
  <p className="text-xs text-muted-foreground">
    Maximum number of bookings allowed for the same time slot
  </p>
</div>
```

---

## Part 10: Public Booking Platform

### 10.1 Route Structure

```
/b/:slug - Main booking page with catalog, cart, and checkout
```

### 10.2 Database - Public RLS Policies

```sql
-- Anon can read booking-enabled tenants
CREATE POLICY "Anon can read booking-enabled tenants by slug"
ON public.tenants FOR SELECT TO anon
USING (online_booking_enabled = true AND slug IS NOT NULL);

-- Anon can read active services
CREATE POLICY "Anon can read active services for booking"
ON public.services FOR SELECT TO anon
USING (status = 'active' AND tenant_id IN (
  SELECT id FROM tenants WHERE online_booking_enabled = true
));

-- Similar for packages, products, service_categories, locations
```

### 10.3 New Files Structure

```text
src/pages/booking/
  BookingPage.tsx              # Main container
  components/
    BookingLayout.tsx          # Header with logo + cart icon
    SalonHeader.tsx            # Banners, logo, salon name, location tags
    CatalogView.tsx            # Services/Packages/Products grid
    ItemCard.tsx               # Unified card component
    CartDrawer.tsx             # Right-side drawer
    CartItem.tsx               # Individual cart item
    SchedulePicker.tsx         # Date + time slot picker
    GiftForm.tsx               # Recipient details form
    CheckoutForm.tsx           # Customer info + confirmation

src/hooks/booking/
  usePublicSalon.tsx           # Fetch tenant by slug
  usePublicCatalog.tsx         # Fetch services/packages/products
  useAvailableSlots.tsx        # Fetch available time slots
  useBookingCart.tsx           # Cart state (React Context)
```

### 10.4 Cart Features

**Cart Item Structure:**
```typescript
interface CartItem {
  id: string;
  type: "service" | "package" | "product";
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  locationId?: string;
  
  // Scheduling
  schedulingOption: "schedule_now" | "leave_unscheduled" | "scheduled";
  scheduledDate?: string;
  scheduledTime?: string;
  
  // For products
  fulfillmentType?: "pickup" | "delivery";
  
  // Gift options
  isGift: boolean;
  giftRecipient?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    message?: string; // Only visible to recipient + salon owner
    hideSender: boolean;
  };
}
```

### 10.5 Gift Booking Flow

When user marks item as gift:
1. Expand gift form with fields:
   - Recipient first name (required)
   - Recipient last name (required)
   - Recipient email (required)
   - Recipient phone (optional)
   - Special message (optional) - only visible to recipient + owner
   - "Stay anonymous" checkbox

2. If scheduling a gift:
   - Show date/time picker
   - Check slot availability

### 10.6 Slot Availability Logic

**Hook: `useAvailableSlots.tsx`**

```typescript
function useAvailableSlots(tenantId, date, locationId) {
  // 1. Fetch location hours
  // 2. Fetch existing appointments for date
  // 3. Get slot_capacity_default from tenant
  // 4. Generate slots based on:
  //    - Business hours
  //    - Existing bookings count < capacity
  // Return available slots
}
```

### 10.7 Checkout Edge Function

**Create: `supabase/functions/create-public-booking/index.ts`**

This function:
1. Validates cart items and prices
2. Checks slot availability (prevents overbooking)
3. Creates or identifies customer by email/phone
4. Creates appointment(s) with services/products
5. Handles gift flag and recipient info
6. Stores gift message in metadata (owner-only visibility)
7. Returns booking confirmation with reference number

---

## Part 11: Form Validation Platform-Wide

### 11.1 Pattern for All Forms

Every form with a submit button should:
1. Compute form validity state
2. Disable button until valid
3. Include terms checkbox where applicable

### 11.2 Create Reusable Utility

**File: `src/lib/form-utils.ts`**

```typescript
export function isFormValid(
  requiredFields: Record<string, string | boolean | number>,
  termsRequired: boolean = false,
  termsAccepted: boolean = false
): boolean {
  const allFieldsValid = Object.values(requiredFields).every(
    (v) => v !== "" && v !== false && v !== undefined && v !== null
  );
  
  if (termsRequired) {
    return allFieldsValid && termsAccepted;
  }
  
  return allFieldsValid;
}
```

### 11.3 Files to Update

| File | Form | Validation |
|------|------|------------|
| `SignupPage.tsx` | Signup | All fields + terms |
| `LoginPage.tsx` | Login | Email + password |
| `ForgotPasswordPage.tsx` | Forgot | Email |
| `ResetPasswordPage.tsx` | Reset | Password + confirm |
| `AddCustomerDialog.tsx` | Add customer | Name + (email or phone) |
| `ScheduleAppointmentDialog.tsx` | Appointment | Customer + service + date/time |
| `WalkInDialog.tsx` | Walk-in | Customer + service |
| `InviteStaffDialog.tsx` | Invite | Name + email |
| `AddServiceDialog.tsx` | Service | Name + price + duration |
| `AddProductDialog.tsx` | Product | Name + price |
| `AddPackageDialog.tsx` | Package | Name + price + items |

---

## Implementation Sequence

| Order | Task | Priority |
|-------|------|----------|
| 1 | Update `countries.ts` - Ghana first | High |
| 2 | Create `src/lib/pricing.ts` | High |
| 3 | Update `SignupPage.tsx` - first/last name, GH default, disabled button | High |
| 4 | Remove ProfileStep from onboarding, reorder steps | High |
| 5 | Update `PlanStep.tsx` with dynamic currency pricing | High |
| 6 | Database migration: role_permissions, user_permission_overrides | High |
| 7 | Seed default role permissions on tenant creation | High |
| 8 | Create `usePermissions` hook | High |
| 9 | Create `ModuleProtectedRoute` component | High |
| 10 | Update `SalonSidebar.tsx` with permission filtering | High |
| 11 | Add Roles & Permissions tab to Staff page (Owner only) | High |
| 12 | Database migration: customer flag_reason column | Medium |
| 13 | Customer card dropdown with actions | Medium |
| 14 | Create `FlagCustomerDialog.tsx` | Medium |
| 15 | Update `useCustomers.tsx` with CRUD methods | Medium |
| 16 | Create `AcceptInvitePage.tsx` for staff invite flow | High |
| 17 | Update `ProtectedRoute.tsx` for forced password reset | High |
| 18 | Integrate owner invitation in onboarding | High |
| 19 | Storage RLS policies for branding bucket | Medium |
| 20 | Booking URL generation in Settings | Medium |
| 21 | Database migration: slot_capacity_default | Medium |
| 22 | Add slot capacity setting in Settings | Medium |
| 23 | Database migration: anon RLS policies for booking | High |
| 24 | Create public booking hooks | High |
| 25 | Build BookingPage and components | High |
| 26 | Create `create-public-booking` edge function | High |
| 27 | Update `App.tsx` routes | Medium |
| 28 | Apply form validation pattern platform-wide | Medium |

---

## Files Summary

| File | Action |
|------|--------|
| `src/lib/countries.ts` | Modify - reorder, GH first |
| `src/lib/pricing.ts` | Create - pricing data |
| `src/lib/form-utils.ts` | Create - validation helper |
| `src/pages/auth/SignupPage.tsx` | Modify - first/last name, validation |
| `src/pages/auth/AcceptInvitePage.tsx` | Create - staff invite flow |
| `src/pages/onboarding/OnboardingPage.tsx` | Modify - remove ProfileStep, reorder |
| `src/components/onboarding/PlanStep.tsx` | Modify - dynamic pricing |
| `src/components/auth/ProtectedRoute.tsx` | Modify - password reset check |
| `src/components/auth/ModuleProtectedRoute.tsx` | Create - permission check |
| `src/hooks/usePermissions.tsx` | Create - permissions hook |
| `src/components/layout/SalonSidebar.tsx` | Modify - filter nav by permissions |
| `src/pages/salon/StaffPage.tsx` | Modify - add Permissions tab |
| `src/pages/salon/CustomersPage.tsx` | Modify - add dropdown actions |
| `src/hooks/useCustomers.tsx` | Modify - add CRUD methods |
| `src/components/dialogs/FlagCustomerDialog.tsx` | Create |
| `src/pages/salon/SettingsPage.tsx` | Modify - booking URL, slot capacity |
| `src/pages/booking/BookingPage.tsx` | Create |
| `src/pages/booking/components/*` | Create - 8 component files |
| `src/hooks/booking/*` | Create - 4 hook files |
| `supabase/functions/create-public-booking/index.ts` | Create |
| `src/App.tsx` | Modify - add routes |
| Database migrations | Create - permissions tables, RLS policies, flag_reason, slot_capacity |

---

## Technical Notes

### Currency Display
All prices use `formatCurrency(amount, currency)` from `src/lib/currency.ts`.

### Gift Message Privacy
The gift message is stored in appointment metadata and only visible to:
- The gift recipient
- The salon owner (not other staff)

This is enforced via app-level filtering when displaying messages.

### Permission Caching
`usePermissions` caches results and only refetches on tenant/user change.

### Staff Appointments Filter
When user has `appointments:own` but not `appointments`:
```sql
WHERE assigned_staff_id = auth.uid()
```

### Trial Information
- 14 days, no card required
- Card must be added before trial ends
- Access restricted after trial expires without payment

### Referral Discount
- 4% off single charge
- Cannot stack with annual billing or other discounts
- Managed in BackOffice

