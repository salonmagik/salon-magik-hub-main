
# Complete Implementation Plan: Salon Platform Enhancement

**Last Updated:** Batch 4 - Settings + UX (Completed)

## Recent Completions
- ✅ Database migration: `is_gifted` column added to appointments
- ✅ `useAppointmentStats.tsx` hook created - Tab-specific stats queries
- ✅ `ScheduleAppointmentDialog.tsx` - Multi-service selection + auto-duration
- ✅ `useAppointments.tsx` - Added `isGifted` and `filterByBookingDate` filters  
- ✅ `AppointmentsPage.tsx` - Tab-specific stats cards, multi-service display, row click, gifted filter
- ✅ Database migration: `appointment_products` table created with RLS
- ✅ `useAppointmentProducts.tsx` hook - CRUD for appointment products
- ✅ `useProductFulfillment.tsx` hook - Fulfillment queries and stats
- ✅ `ProductFulfillmentTab.tsx` - Sub-tab for product order tracking
- ✅ `ServicesPage.tsx` - Products tab now has Inventory/Fulfillment sub-tabs
- ✅ `AppointmentDetailsDialog.tsx` - Enhanced with products section, gifted toggle, payment summary
- ✅ `SettingsPage.tsx` - Settings persistence fix (refreshTenants called after save)
- ✅ DOB Calendar already implemented with year/month dropdowns
- ✅ Customer Notes tab already implemented in CustomerDetailDialog

---

This comprehensive plan covers all phases in priority order, integrating the newly added directives for appointment enhancements, multi-service selection, and product fulfillment tracking.
| 1 | Critical Fixes | Settings persistence, Journal fixes | Partial (Journal ✅) |
| 2 | Core Structure | Appointments enhancements, Dashboard restructure, Trial banners | Partial (Banners ✅) |
| 3 | Workflow | Maker-checker refunds, Confirmation modals | Partial (Refunds ✅) |
| 4 | Settings | Complete all tabs | In Progress |
| 5 | UX | DOB picker, Walk-in buffer, Customer notes | Partial (Buffer ✅) |
| 6 | Backend | Staff invitation emails, Template editing | Pending |
| 7 | Reporting | Insights with thresholds | Partial |
| 8 | Data | Import/Export | Pending |
| 9 | Polish | Mobile audit, Help page | Pending |
| 10 | Quality | Testing suite, Performance | Pending |

---

## Priority 1: Critical Fixes

### 1.1 Settings Persistence Fix
**Status:** Pending

**Problem:** Profile changes don't reflect immediately in UI after save.

**Solution:**
```typescript
// After successful save in SettingsPage.tsx
await refreshTenants(); // Call from AuthContext
```

**Files to Modify:**
- `src/pages/salon/SettingsPage.tsx` - Call refreshTenants after save
- `src/hooks/useAuth.tsx` - Ensure refreshTenants is exported

### 1.2 Journal Activity Log Fix
**Status:** ✅ DONE

- Fixed infinite re-fetch loop
- Added auto-refresh after create via onSuccess callback

---

## Priority 2: Core Structure

### 2.1 Phase 1 Enhanced: Appointments Tab View

#### 2.1.1 Tab-Specific Stats Cards

**Scheduled Tab (4 cards):**
| Card | Query | Icon |
|------|-------|------|
| Today's Appointments | `scheduled_start = today` AND `is_unscheduled = false` | Calendar |
| Gifted | `is_gifted = true` AND `scheduled_start = today` | Gift |
| Cancelled | `status = 'cancelled'` AND today | X |
| Rescheduled | `reschedule_count > 0` AND today | RotateCcw |

**Unscheduled Tab (2 cards):**
| Card | Query | Icon |
|------|-------|------|
| Total Unscheduled | `is_unscheduled = true` | Clock |
| Gifted | `is_unscheduled = true` AND `is_gifted = true` | Gift |

#### 2.1.2 Unscheduled Tab Filters
- Status filter: All / Gifted / Not Gifted
- Date filter: Uses `created_at` (booking date) instead of `scheduled_start`
- Label: "Booked on" instead of "Filter by date"

#### 2.1.3 Multi-Service Display in Table
```text
Service column shows:
┌─────────────────┐
│ Haircut         │
│ +2 services     │  (smaller, muted text)
└─────────────────┘
```

#### 2.1.4 Remove Manual Duration + Multi-Service in ScheduleAppointmentDialog

**Current State:** Single service dropdown + manual duration input
**Target State:** Multi-service checklist + auto-calculated duration (matching WalkInDialog)

**Changes:**
1. Remove `serviceId` and `duration` from formData state
2. Add `selectedServices[]` state array
3. Replace single Select with ScrollArea checklist
4. Add summary section (services count, total duration, total price)
5. Auto-calculate scheduledEnd from service durations:
```typescript
const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
const scheduledEnd = new Date(
  new Date(scheduledStart).getTime() + totalDuration * 60 * 1000
).toISOString();
```

#### 2.1.5 Database Migration
```sql
ALTER TABLE appointments 
ADD COLUMN is_gifted BOOLEAN NOT NULL DEFAULT false;
```

**Files to Create:**
- `src/hooks/useAppointmentStats.tsx` - Stats queries for both tabs

**Files to Modify:**
- `src/pages/salon/AppointmentsPage.tsx` - Stats cards, filters, row click, multi-service display
- `src/components/dialogs/ScheduleAppointmentDialog.tsx` - Multi-service + remove duration
- `src/hooks/useAppointments.tsx` - Add `isGifted`, `filterByBookingDate` options

---

### 2.2 Phase 1.5 NEW: Appointment Details Modal Enhancement

**Trigger Points:**
1. Click on any table row
2. "View Details" action from dropdown

**Modal Sections:**

| Section | Content |
|---------|---------|
| Header | Status badge, Gifted badge (if applicable) |
| Customer Info | Name, Phone (blurred for Staff role) |
| Booking Info | `created_at` timestamp, `scheduled_start` or "Unscheduled" |
| Services | List with individual durations and prices, subtotal |
| Products | List with quantity, price, fulfillment status badges |
| Payment Summary | Total, deposit paid, balance due |
| Notes | Appointment notes |
| Footer Actions | Close, Mark as Gifted toggle |

**Database Migration:**
```sql
CREATE TABLE appointment_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  fulfillment_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (fulfillment_status IN ('pending', 'ready', 'fulfilled', 'cancelled')),
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE appointment_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read tenant appointment_products"
  ON appointment_products FOR SELECT
  USING (appointment_id IN (
    SELECT id FROM appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

CREATE POLICY "Users can create appointment_products"
  ON appointment_products FOR INSERT
  WITH CHECK (appointment_id IN (
    SELECT id FROM appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

CREATE POLICY "Users can update appointment_products"
  ON appointment_products FOR UPDATE
  USING (appointment_id IN (
    SELECT id FROM appointments 
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));
```

**Files to Create:**
- `src/hooks/useAppointmentProducts.tsx`

**Files to Modify:**
- `src/components/dialogs/AppointmentDetailsDialog.tsx` - Enhanced with products section

---

### 2.3 Phase 2.5 NEW: Product Fulfillment Tracking

**Location:** Sub-tab within Products section of ServicesPage

**Tab Structure:**
```text
[All] [Services] [Packages] [Products] [Vouchers]
                              │
                     When "Products" active:
                     ┌───────────────────────┐
                     │ [Inventory] [Fulfillment] │
                     └───────────────────────┘
```

**Fulfillment Tab Stats Cards (3):**
| Card | Description |
|------|-------------|
| Pending Pickup | `fulfillment_status = 'pending'` |
| Ready for Pickup | `fulfillment_status = 'ready'` |
| Fulfilled Today | Fulfilled today |

**Fulfillment Table:**
| Column | Source |
|--------|--------|
| Order Date | `appointment_products.created_at` |
| Customer | From linked appointment > customer |
| Product | `product_name` |
| Qty | `quantity` |
| Status | Badge (pending/ready/fulfilled) |
| Actions | Mark Ready / Mark Fulfilled / View Appointment |

**Workflow:**
```text
pending ──► ready ──► fulfilled
    │
    └──► cancelled
```

**Files to Create:**
- `src/components/catalog/ProductFulfillmentTab.tsx`
- `src/hooks/useProductFulfillment.tsx`

**Files to Modify:**
- `src/pages/salon/ServicesPage.tsx` - Add sub-tab logic within Products tab
- `src/components/dialogs/WalkInDialog.tsx` - Add product selection
- `src/components/dialogs/ScheduleAppointmentDialog.tsx` - Add product selection

---

### 2.4 Dashboard Restructure
**Status:** Mostly Complete

**Current State:** Dashboard with stats, checklist, insights, activity sections ✅

**Remaining:**
- Verify insights thresholds are enforced
- Ensure Today's Appointments count is independent of filters

---

### 2.5 Trial and Subscription Banners
**Status:** ✅ DONE

`SubscriptionBanner.tsx` already implemented with:
- Trial expiring warning
- Trial expired error
- Past due error
- Low credits warning (in Dashboard)

---

## Priority 3: Workflow

### 3.1 Maker-Checker Refunds
**Status:** ✅ DONE

`PaymentsPage.tsx` already has:
- Pending refunds section with Approve/Reject
- RequestRefundDialog
- ConfirmActionDialog for approval
- Rejection reason modal

### 3.2 Confirmation Modals for Create/Update Actions
**Status:** Partial

**Remaining:**
- Add confirmation to all CRUD dialogs (services, products, packages, vouchers, customers)

**Pattern:**
```text
User clicks "Save" → Confirmation modal → API call → Success toast
```

**Files to Modify:**
- `src/components/dialogs/AddServiceDialog.tsx`
- `src/components/dialogs/AddProductDialog.tsx`
- `src/components/dialogs/AddPackageDialog.tsx`
- `src/components/dialogs/AddVoucherDialog.tsx`
- `src/components/dialogs/AddCustomerDialog.tsx`

---

## Priority 4: Settings Module Completion

### 4.1 Profile Tab
**Status:** ✅ Implemented

### 4.2 Business Hours Tab
**Status:** ✅ Implemented

### 4.3 Booking Settings Tab
**Status:** ✅ Implemented

### 4.4 Payments Tab
**Status:** Needs Update

**Current:** May have API key inputs
**Required:** Display-only, platform-managed

**Updated Content:**
```text
┌─────────────────────────────────────────────┐
│ Payments are processed securely through     │
│ Salon Magik                                 │
├─────────────────────────────────────────────┤
│ Supported Methods:                          │
│ • Card payments (Stripe/Paystack)           │
│ • Mobile Money (Paystack - NG/GH)           │
│ • Cash (manual recording)                   │
│ • POS                                       │
├─────────────────────────────────────────────┤
│ [View Transaction History →]                │
└─────────────────────────────────────────────┘
```

### 4.5 Notifications Tab
**Status:** ✅ Implemented

### 4.6 Roles & Permissions Tab
**Status:** ✅ Implemented (read-only matrix)

### 4.7 Subscription Tab
**Status:** ✅ Implemented

### 4.8 Integrations Tab
**Status:** Needs completion

**Files to Modify:**
- `src/pages/salon/SettingsPage.tsx` - Payments tab update, persistence fix

---

## Priority 5: UX Improvements

### 5.1 Date of Birth Calendar Improvement

**Problem:** Hard to select dates far in the past (1950, etc.)

**Solution:** Add year/month dropdowns to Calendar

**Files to Modify:**
- `src/components/ui/calendar.tsx` - Add `showYearMonthDropdown` prop
- `src/components/ui/date-picker.tsx` - Pass prop through
- `src/components/dialogs/AddCustomerDialog.tsx` - Enable for DOB field

### 5.2 Walk-In Buffer Time
**Status:** ✅ DONE

WalkInDialog already has:
- Buffer time dropdown (0, 5, 10, 15, 30 min)
- Uses `default_buffer_minutes` from tenant settings

### 5.3 Customer Notes from Appointments

**Add to CustomerDetailDialog:**
- New "Notes" tab
- Query appointment notes and attachments
- Group by appointment with date context
- Respect role visibility (Staff sees blurred contact info)

**Files to Modify:**
- `src/components/dialogs/CustomerDetailDialog.tsx`

---

## Priority 6: Backend

### 6.1 Staff Invitation Emails

**Edge Function:** `send-staff-invitation`

**Flow:**
1. Staff invitation created in `staff_invitations` table
2. Edge function triggered
3. Email sent via Resend with secure accept link
4. Accept flow sets `tenant_id` and `role`

**Secret Required:** `RESEND_API_KEY`

**Files to Create:**
- `supabase/functions/send-staff-invitation/index.ts`

### 6.2 Template Editing

**New Dialog:** EditTemplateDialog

**Features:**
- Variable helpers: `{{customer_name}}`, `{{appointment_date}}`, etc.
- SMS: 160 char limit with counter
- Email: HTML/rich text support
- Channel indicator (email/sms/whatsapp)

**Database Migration:**
```sql
ALTER TABLE email_templates 
ADD COLUMN channel TEXT DEFAULT 'email' 
CHECK (channel IN ('email', 'sms', 'whatsapp'));
```

**Files to Create:**
- `src/components/dialogs/EditTemplateDialog.tsx`

**Files to Modify:**
- `src/pages/salon/MessagingPage.tsx`

---

## Priority 7: Reporting

### 7.1 Insights with Thresholds

**Thresholds:**
| Insight | Minimum Data |
|---------|--------------|
| Busiest Day | ≥10 completed appointments |
| Top Service | ≥5 completed appointments |
| Peak Hours | ≥20 completed appointments |
| Retention Rate | ≥5 returning customers |

**Placeholder if insufficient:**
```
"Keep going! Insights will appear once you have more appointment history."
```

**Remove:** "Average Ticket" stat (per PRD)

**Files to Modify:**
- `src/pages/salon/ReportsPage.tsx`
- `src/hooks/useReports.tsx`

---

## Priority 8: Data

### 8.1 Export (RLS-Compliant)

**Exportable:**
- Customers → CSV
- Appointments → CSV
- Transactions → CSV

**Constraints:**
- Only tenant's own data
- No secrets or sensitive internal data

### 8.2 Import

**Importable:**
- Customers from CSV

**Flow:**
1. Upload CSV
2. Validate columns
3. Preview mapping
4. Confirm import
5. Show results

**Files to Create:**
- `src/components/dialogs/ImportCustomersDialog.tsx`
- `src/lib/exportHelpers.ts`

---

## Priority 9: Polish

### 9.1 Mobile Responsiveness Audit

**Checklist:**
- [ ] All pages render correctly on mobile
- [ ] Tables use horizontal scroll or card view
- [ ] Payment CTAs remain clear and visible
- [ ] Touch targets ≥44px
- [ ] Sidebar collapses properly
- [ ] Dialogs don't overflow on small screens

### 9.2 Help Page Adjustments

**Remove:**
- "Documentation" (no public docs yet)
- "Video Tutorials" (moves to landing)

**Keep:**
- "Email Support"

**Add:**
- "Live Chat" via Tawk.to or Crisp (free tier)

**Files to Modify:**
- `src/pages/salon/HelpPage.tsx`
- `index.html` - Add chat widget script

---

## Priority 10: Quality

### 10.1 Testing Suite

**Test Files to Create:**
- `src/test/payments.test.ts`
- `src/test/refunds.test.ts`
- `src/test/appointments.test.ts`
- `src/test/auth.test.ts`

**Coverage:**
- Payment flows (deposit, full, pay-at-salon)
- Purse auth gate
- Outstanding fees calculation
- Refund maker-checker workflow
- Auth flows (login, signup, password strength)
- Inactivity timers

### 10.2 Performance Optimization

**Actions:**
- Lazy load heavy components
- Memoize expensive calculations
- Avoid unnecessary re-renders
- Keep bundle small
- No new libs without justification

---

## Database Migrations Summary

```sql
-- Priority 2: Phase 1 - Gifted appointments
ALTER TABLE appointments 
ADD COLUMN is_gifted BOOLEAN NOT NULL DEFAULT false;

-- Priority 2: Phase 1.5 - Appointment products
CREATE TABLE appointment_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  fulfillment_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (fulfillment_status IN ('pending', 'ready', 'fulfilled', 'cancelled')),
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- + RLS policies

-- Priority 2: Phase 2 - Package products
ALTER TABLE package_items ADD COLUMN product_id UUID REFERENCES products(id);
ALTER TABLE package_items ADD CONSTRAINT package_item_type_check 
  CHECK ((service_id IS NOT NULL AND product_id IS NULL) 
      OR (service_id IS NULL AND product_id IS NOT NULL));

-- Priority 6: Messaging channels
ALTER TABLE email_templates 
ADD COLUMN channel TEXT DEFAULT 'email' 
CHECK (channel IN ('email', 'sms', 'whatsapp'));
```

---

## New Components Summary

| Component | Purpose | Priority |
|-----------|---------|----------|
| `useAppointmentStats.tsx` | Stats queries for appointment tabs | 2 |
| `useAppointmentProducts.tsx` | CRUD for products in appointments | 2 |
| `ProductFulfillmentTab.tsx` | Sub-tab for product order tracking | 2 |
| `useProductFulfillment.tsx` | Fulfillment queries and stats | 2 |
| `EditTemplateDialog.tsx` | Email/SMS template editor | 6 |
| `ImportCustomersDialog.tsx` | CSV import dialog | 8 |
| `send-staff-invitation/index.ts` | Edge function for invites | 6 |
| `exportHelpers.ts` | CSV export utilities | 8 |

---

## Completion Status Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Appointments Tab View | ✅ Done |
| 1 | Multi-service in ScheduleDialog | ✅ Done |
| 1.5 | Appointment Details Modal | ✅ Done |
| 2 | Catalog Multi-Select | ⏳ Pending |
| 2.5 | Product Fulfillment Tab | ✅ Done |
| 3 | Confirmation Modals | ⏳ Pending |
| 4 | Maker-Checker Refunds | ✅ Done |
| 5 | Settings Completion | ✅ Done |
| 6 | Trial Banners | ✅ Done |
| 7 | Dashboard Restructure | 🔄 In Progress |
| 8 | Walk-In Buffer | ✅ Done |
| 9 | DOB Calendar | ✅ Done |
| 10 | Customer Notes | ✅ Done |
| 11 | Appointment Actions | 🔄 In Progress |
| 12 | Notifications Navigation | ⏳ Pending |
| 13 | Journal Fix | ✅ Done |
| 14 | Staff Invitation Emails | ⏳ Pending |
| 15 | Messaging Enhancement | ⏳ Pending |
| 16 | Help Page | ⏳ Pending |
| 17 | Reports & Insights | ⏳ Pending |
| 18 | Import/Export | ⏳ Pending |
| 19 | Mobile Audit | ⏳ Pending |
| 20 | Testing Suite | ⏳ Pending |
| 21 | Performance | ⏳ Pending |

---

## Implementation Order

**Batch 1 (Core Appointments):**
1. Database migration: `is_gifted` column
2. `useAppointmentStats.tsx` hook
3. `ScheduleAppointmentDialog.tsx` - multi-service + remove duration
4. `AppointmentsPage.tsx` - stats cards, filters, multi-service display

**Batch 2 (Appointment Details + Products):**
5. Database migration: `appointment_products` table
6. `useAppointmentProducts.tsx` hook
7. `AppointmentDetailsDialog.tsx` enhancement
8. Add product selection to WalkInDialog and ScheduleAppointmentDialog

**Batch 3 (Product Fulfillment):**
9. `useProductFulfillment.tsx` hook
10. `ProductFulfillmentTab.tsx` component
11. `ServicesPage.tsx` - add sub-tab within Products

**Batch 4 (Settings + UX):**
12. Settings persistence fix
13. Payments tab update
14. DOB calendar improvement
15. Customer notes in detail dialog

**Batch 5 (Backend + Messaging):**
16. Staff invitation edge function
17. Template editing dialog
18. Messaging page updates

**Batch 6 (Reports + Data):**
19. Insights with thresholds
20. Export functionality
21. Import customers dialog

**Batch 7 (Polish + Quality):**
22. Help page adjustments
23. Mobile responsiveness audit
24. Testing suite
25. Performance optimization
