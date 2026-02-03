

# Updated Comprehensive Salon Platform Completion Plan
## With Payments Clarification, Trial Banners, and Dashboard Specifications

---

## Critical Clarifications Applied

### 1. Payments Module Clarification
**Key Understanding:** Salons do NOT integrate their own Stripe(link)/Paystack accounts. Salon Magik's platform Stripe/Paystack accounts serve as the payment rails.

**What the Payments Module Actually Does:**
- Track transactions (incoming payments, refunds, purse transactions)
- Manage customer wallet/purse balances
- Handle maker-checker refund workflows
- Record offline/pay-at-salon payments as manual markers
- NO payment provider configuration in salon settings (remove this)

**Settings Payments Tab Change:**
- Remove Stripe/Paystack API key inputs
- Display: "Payments are processed securely through Paystack/Stripe - Salon Magik"
- Show supported payment methods based on salon's country (Paystack for NG/GH, Stripe elsewhere)

### 2. Trial Period Banners
**Banner Use Cases to Implement:**
- **Active Trial Banner:** "Your trial ends in X days. Upgrade to continue."
- **Trial Expired Banner:** "Your trial has expired. Upgrade to restore access."
- **Past Due Banner:** "Payment failed. Please update your billing to avoid service interruption."
- **Approaching Limit Banner:** "You're approaching your plan limit for [resource]."

**Banner Display Logic:**
- Render at top of SalonSidebar (persistent, dismissible per session)
- Pull from `currentTenant.subscription_status` and `currentTenant.trial_ends_at`
- Color coding: Warning (yellow), Error (red), Info (blue)

---

## Phase 1: Appointments Tab View (Scheduled vs Unscheduled)

### What Will Change
```text
+------------------------------------------+
| Appointments                             |
| Manage upcoming bookings...              |
|                    [Walk-in] [Schedule]  |
+------------------------------------------+
| [Scheduled] [Unscheduled]  <- NEW TABS   |
+------------------------------------------+
| Today's Appointments: 5  (ONLY TODAY)    |
| 12 rows                  <- Row count    |
+------------------------------------------+
| [Date Picker] [Status Filter]            |
+------------------------------------------+
| TABLE or CARD VIEW (per PRD card specs)  |
+------------------------------------------+
```

**Key Behaviors:**
- "Today's Appointments" count shows ONLY today (not affected by date picker or other filters)
- "X rows" indicator shows count of currently displayed filtered items
- Scheduled tab: `is_unscheduled = false` (calendar-visible)
- Unscheduled tab: `is_unscheduled = true` (off-calendar, awaiting confirmation)
- Cards for each view follow PRD-specified layouts

**Files to Modify:**
- `src/pages/salon/AppointmentsPage.tsx`
- `src/hooks/useAppointments.tsx` - Add `isUnscheduled` filter

---

## Phase 2: Catalog Multi-Select and Bulk Actions

### 2.1 Multi-Select Implementation

**Bulk Actions:**

| Item Type | Actions | Role Restriction |
|-----------|---------|------------------|
| Services | Delete, Create Package, Archive | Owner, Manager only |
| Products | Delete, Create Package, Archive | Owner, Manager only |
| Packages | Delete, Archive | Owner, Manager only |
| Vouchers | Delete, Archive | Owner, Manager only |

**Blocking Validation (Per PRD):**
- Before delete/archive: Check if item exists in an active package
- If found, show blocking modal listing affected packages
- Archived items display badge and are excluded from booking/purchase

### 2.2 Package Modal Enhancement

**Mixed Package Support:**
- Tabs: "Services Only", "Products Only", "Both"
- Calculate original value from both service and product prices

**Database Migration:**
```sql
ALTER TABLE package_items ADD COLUMN product_id UUID REFERENCES products(id);
ALTER TABLE package_items ADD CONSTRAINT package_item_type_check 
  CHECK ((service_id IS NOT NULL AND product_id IS NULL) 
      OR (service_id IS NULL AND product_id IS NOT NULL));
```

**Files to Create/Modify:**
- `src/components/catalog/BulkActionBar.tsx` (new)
- `src/pages/salon/ServicesPage.tsx`
- `src/components/dialogs/AddPackageDialog.tsx`
- Hooks: `useServices`, `useProducts`, `usePackages`, `useVouchers`

---

## Phase 3: Confirmation Modals for Create/Update Actions

**Pattern:**
1. User fills form and clicks "Create" or "Save"
2. Show confirmation: "Are you sure you want to [action] this [item]?"
3. "Cancel" and "Confirm" buttons
4. Only proceed with API call after confirmation
5. All mutations logged to `audit_logs` (no silent changes)

**Files to Create:**
- `src/components/dialogs/ConfirmActionDialog.tsx` (reusable)
- Integrate into all CRUD dialogs

---

## Phase 4: Maker-Checker Workflow for Refunds

### Refund Types (Per PRD)
1. **Cash/Card Refund**: Return via original payment method (recorded, not processed - Salon Magik processes)
2. **Purse Credit**: Add to customer's wallet balance
3. **Offline Refund**: Mark as refunded outside system (manual tracking)

### Workflow
1. Staff creates refund request (status: "pending")
2. Manager/Owner reviews in Payments tab
3. Approve (with confirmation) or Reject (mandatory reason)
4. Audit trail: who requested, who approved/rejected, timestamps

**UI Components:**
- Pending refunds section with Approve/Reject buttons (Owner/Manager only)
- `RequestRefundDialog.tsx` (new)
- Refund approval confirmation modal

**Files to Modify:**
- `src/pages/salon/PaymentsPage.tsx`
- `src/hooks/useRefunds.tsx` - Add `requestRefund`, `approveRefund`, `rejectRefund`
- Database RLS policies for approval

---

## Phase 5: Settings Module Completion

### 5.1 Profile Settings Persistence Fix
**Fix:** Call `refreshTenants()` from AuthContext after successful save

### 5.2 Logo and Banner Upload
- Upload to `catalog-images` bucket
- Store URLs in `tenants.logo_url` and `tenants.banner_urls`

**Database Migration:**
```sql
ALTER TABLE tenants ADD COLUMN logo_url TEXT;
ALTER TABLE tenants ADD COLUMN banner_urls TEXT[] DEFAULT '{}';
```

### 5.3 Booking Settings Tab

| Field | Type | Description |
|-------|------|-------------|
| Booking URL | Display + Copy | Canonical `/b/<salonSlug>` only |
| Enable Online Booking | Toggle | `online_booking_enabled` |
| Auto-Confirm Bookings | Toggle | `auto_confirm_bookings` (new) |
| Default Buffer Time | Dropdown | 0, 5, 10, 15, 30 min |
| Cancellation Grace | Number | Hours before appointment |
| Default Deposit % | Number | Used in booking/walk-in |
| Status Message | Textarea | Shown on booking page |

**Database Migration:**
```sql
ALTER TABLE tenants 
ADD COLUMN auto_confirm_bookings BOOLEAN DEFAULT false,
ADD COLUMN default_buffer_minutes INTEGER DEFAULT 0,
ADD COLUMN cancellation_grace_hours INTEGER DEFAULT 24,
ADD COLUMN default_deposit_percentage NUMERIC DEFAULT 0,
ADD COLUMN booking_status_message TEXT;
```

### 5.4 Payments Tab (UPDATED)

**NO API Key Inputs - Payments are Platform-Managed**

Display Only:
- "Payments are processed securely through Salon Magik"
- Supported methods based on country (auto-detected)
- Pay-at-salon remains manual marker
- Link to Payments page for transaction history

### 5.5 Other Tabs (Unchanged)
- Roles & Permissions: Read-only matrix
- Subscription (renamed from Billing): Plan info, trial status, usage
- Integrations: Communication credits, WhatsApp (coming soon)

**Files to Modify:**
- `src/pages/salon/SettingsPage.tsx` - Complete all tabs
- `src/hooks/useAuth.tsx` - Ensure `refreshTenants` called after save

---

## Phase 6: Trial and Subscription Banners

### Banner Component
Create `SubscriptionBanner.tsx` displayed at top of `SalonSidebar`

**Banner States:**

| Condition | Style | Message |
|-----------|-------|---------|
| `subscription_status = 'trialing'` AND `trial_ends_at` within 7 days | Warning (yellow) | "Your trial ends in X days. Upgrade to continue using Salon Magik." |
| `subscription_status = 'trialing'` AND `trial_ends_at` passed | Error (red) | "Your trial has expired. Upgrade now to restore full access." |
| `subscription_status = 'past_due'` | Error (red) | "Payment failed. Update your billing to avoid service interruption." |
| Communication credits < 5 | Warning (yellow) | "Low messaging credits. Top up to continue sending SMS/WhatsApp." |

**Banner Features:**
- Dismissible per session (store in state, reappears on refresh)
- CTA button linking to Settings > Subscription
- Upgrade CTA opens external Stripe billing portal (managed by platform)

**Files to Create:**
- `src/components/layout/SubscriptionBanner.tsx` (new)
- Integrate into `SalonSidebar.tsx`

---

## Phase 7: Dashboard Complete Restructure

### Updated Layout (Per PRD Specifications)

```text
+--------------------------------------------------+
| Dashboard                                         |
| Welcome back, [Name]! Here's what's happening... |
+--------------------------------------------------+
| [SUBSCRIPTION BANNER - if applicable]             |
+--------------------------------------------------+
| ONBOARDING CHECKLIST CARD (if incomplete)         |
| - Progress bar: X% complete                       |
| - Clickable items: Add services, Add products,   |
|   Configure payments, Enable booking             |
+--------------------------------------------------+
| KEY STAT CARDS (4 cards)                         |
| - Today's Appointments (TODAY ONLY, not filtered)|
| - Outstanding Fees (from customers)              |
| - Purse Usage (total customer purse balance)     |
| - Refunds Pending (count awaiting approval)      |
+--------------------------------------------------+
| INSIGHTS PREVIEW (1-2 cards)                     |
| IF data threshold met:                           |
|   - "Your busiest day is Saturday"               |
|   - "Top service this month: Haircut"            |
| ELSE:                                            |
|   - Placeholder: "Insights will appear once      |
|     you have more appointment data"              |
+--------------------------------------------------+
| COMMUNICATION CREDITS WARNING (if low)           |
| "5 credits remaining. Top up to continue..."     |
+--------------------------------------------------+
| TODAY'S APPOINTMENTS LIST                        |
| - Today's scheduled appointments                 |
| - Time, Customer, Service, Status                |
+--------------------------------------------------+
| RECENT ACTIVITY / NOTIFICATIONS                  |
| - System notices (flags, maintenance)            |
| - Payment events                                 |
| - Refund requests                                |
+--------------------------------------------------+
```

### Onboarding Checklist Clickable Navigation

| Checklist Item | Completed Condition | Navigation Target |
|----------------|---------------------|-------------------|
| Add services | `services.count > 0` | `/salon/services?tab=services` |
| Add products | `products.count > 0` | `/salon/services?tab=products` |
| Configure payments | (always show as complete - platform managed) | N/A |
| Enable booking | `online_booking_enabled = true` | `/salon/settings?tab=booking` |
| Add first customer | `customers.count > 0` | `/salon/customers` |
| Book first appointment | `appointments.count > 0` | `/salon/appointments` |

### Insights Logic

**Data Thresholds:**
- Busiest Day: Requires ≥10 completed appointments
- Top Service: Requires ≥5 completed appointments
- Peak Hours: Requires ≥20 completed appointments
- Retention Rate: Requires ≥5 returning customers

**Placeholder if insufficient data:**
```
"Keep going! Insights will appear once you have more appointment history."
```

**Files to Modify:**
- `src/pages/salon/SalonDashboard.tsx` - Complete restructure
- `src/hooks/useDashboardStats.tsx` - Add new stats:
  - `outstandingFees` (sum of `customers.outstanding_balance`)
  - `purseUsage` (sum of `customer_purses.balance`)
  - `refundsPendingApproval` (count of pending refunds)
  - `lowCommunicationCredits` (boolean, credits < 5)
  - `checklistStatus` (dynamic completion checks)
  - `insights` (busiest day, top service, etc.)

---

## Phase 8: Walk-In Buffer Time

**What Will Add:**
- Buffer time dropdown in Walk-In dialog (0, 5, 10, 15, 30 min)
- Uses `default_buffer_minutes` from tenant settings as default
- If buffer selected: `scheduled_start = now + buffer`, `actual_start = null`
- Pay-at-salon: manual marker only, no provider calls

**Files to Modify:**
- `src/components/dialogs/WalkInDialog.tsx`
- `src/hooks/useAppointments.tsx`

---

## Phase 9: Date of Birth Calendar Improvement

**What Will Change:**
- Add `showYearMonthDropdown` prop to Calendar/DatePicker
- Year dropdown: 1920 to current year
- Month dropdown alongside

**Files to Modify:**
- `src/components/ui/calendar.tsx`
- `src/components/ui/date-picker.tsx`
- `src/components/dialogs/AddCustomerDialog.tsx`

---

## Phase 10: Customer Notes from Appointments

**What Will Add:**
- "Notes" tab in CustomerDetailDialog
- Query `appointment_attachments` and appointment notes
- Display grouped by appointment with date context
- Role visibility enforced: staff contact blur persists

**Files to Modify:**
- `src/components/dialogs/CustomerDetailDialog.tsx`

---

## Phase 11: Appointment Actions Per PRD

**Actions (Per PRD):**
- Start, Pause, Resume, Complete, Cancel, Reschedule, View Customer Profile

**Role Visibility:**

| Action | Owner | Manager | Supervisor | Receptionist | Staff |
|--------|-------|---------|------------|--------------|-------|
| Start/Pause/Resume/Complete | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cancel/Reschedule | ✓ | ✓ | ✓ | ✓ | ✗ |
| View Customer Profile | ✓ | ✓ | ✓ | ✓ | ✗ |

**Files to Modify:**
- `src/pages/salon/AppointmentsPage.tsx`
- `src/hooks/useAuth.tsx` - Add `getUserRole` helper

---

## Phase 12: Notifications Navigation

**What Will Add:**
- "View Settings" button navigates to `/salon/settings?tab=notifications`
- SettingsPage reads `?tab=` query param

**Files to Modify:**
- `src/components/notifications/NotificationsPanel.tsx`
- `src/pages/salon/SettingsPage.tsx`

---

## Phase 13: Journal Activity Log Fix

**Investigation/Fix Areas:**
- Collapsible component state
- JSON diff rendering performance
- Pagination issues
- Journal is read-only; no wallet/purse mutations

**Files to Review:**
- `src/pages/salon/JournalPage.tsx`
- `src/hooks/useAuditLogs.tsx`

---

## Phase 14: Staff Invitation Emails

**Edge Function via Resend Only:**
- Send invitation email with secure accept link
- Accept flow sets `tenant_id` and `role` for RLS/JWT

**Files to Create:**
- `supabase/functions/send-staff-invitation/index.ts`

**Secret Required:** `RESEND_API_KEY`

---

## Phase 15: Messaging Module Enhancement

### Template Editing
- Edit dialog with variable helpers
- SMS: 160 char limit, character counter
- Email: HTML/rich text support

### Credit Consumption (Per PRD)
- WhatsApp/SMS: Consume credits
- Email: FREE (no credit deduction)

### WhatsApp
- "Coming Soon" placeholder

**Database Migration:**
```sql
ALTER TABLE email_templates 
ADD COLUMN channel TEXT DEFAULT 'email' 
CHECK (channel IN ('email', 'sms', 'whatsapp'));
```

**Files to Create/Modify:**
- `src/components/dialogs/EditTemplateDialog.tsx` (new)
- `src/pages/salon/MessagingPage.tsx`

---

## Phase 16: Help Page Adjustments

**Changes:**
- Remove "Documentation" (no public docs yet)
- Remove "Video Tutorials" (moves to landing)
- Keep "Email Support"
- Add "Live Chat" via Tawk.to or Crisp (free tier)

**Files to Modify:**
- `src/pages/salon/HelpPage.tsx`
- `index.html` - Add chat widget script

---

## Phase 17: Reports and Insights

**Add Insights Section:**
- Busiest day of the week
- Top performing service
- Peak hours
- Customer retention rate

**Remove:**
- "Average Ticket" stat (per PRD)

**Insights are read-only; no mutations**

**Files to Modify:**
- `src/pages/salon/ReportsPage.tsx`
- `src/hooks/useReports.tsx`

---

## Phase 18: Functional Upload/Import/Export

### Export (RLS-Compliant)
- Customers, Appointments, Transactions to CSV
- Only tenant's own data; no secrets

### Import
- Customers from CSV
- Validation + preview before import

**Files to Create:**
- `src/components/dialogs/ImportCustomersDialog.tsx`
- `src/lib/exportHelpers.ts`

---

## Phase 19: Mobile Responsiveness Audit

**Checklist:**
- All pages render correctly on mobile
- Tables use horizontal scroll or card view
- Payment CTAs remain clear and visible
- Touch targets ≥44px
- Sidebar collapses properly

---

## Phase 20: Testing Suite

**Payment Flow Coverage (Per PRD):**
- Deposit/full/pay-at-salon recording
- Purse auth gate (requires auth to use purse)
- Outstanding fees added to totals
- Refund maker-checker workflow

**Auth Flow Coverage:**
- Single identifier input
- Password strength guard
- Inactivity timers (Salon: 55/60 min)

**Files to Create:**
- `src/test/payments.test.ts`
- `src/test/refunds.test.ts`
- `src/test/appointments.test.ts`
- `src/test/auth.test.ts`

---

## Phase 21: Performance Optimization

- Lazy load heavy components
- No new libs without justification
- Keep bundle small
- Memoize expensive calculations

---

## Database Migrations Summary

```sql
-- Phase 2: Package products
ALTER TABLE package_items ADD COLUMN product_id UUID REFERENCES products(id);
ALTER TABLE package_items ADD CONSTRAINT package_item_type_check 
  CHECK ((service_id IS NOT NULL AND product_id IS NULL) 
      OR (service_id IS NULL AND product_id IS NOT NULL));

-- Phase 5 & 6: Settings and banners
ALTER TABLE tenants 
ADD COLUMN logo_url TEXT,
ADD COLUMN banner_urls TEXT[] DEFAULT '{}',
ADD COLUMN auto_confirm_bookings BOOLEAN DEFAULT false,
ADD COLUMN default_buffer_minutes INTEGER DEFAULT 0,
ADD COLUMN cancellation_grace_hours INTEGER DEFAULT 24,
ADD COLUMN default_deposit_percentage NUMERIC DEFAULT 0,
ADD COLUMN booking_status_message TEXT;

-- Phase 15: Messaging
ALTER TABLE email_templates 
ADD COLUMN channel TEXT DEFAULT 'email' 
CHECK (channel IN ('email', 'sms', 'whatsapp'));
```

---

## New Components Summary

| Component | Purpose |
|-----------|---------|
| `BulkActionBar.tsx` | Floating action bar for multi-select |
| `ConfirmActionDialog.tsx` | Reusable confirmation modal |
| `SubscriptionBanner.tsx` | Trial/billing status banner |
| `EditTemplateDialog.tsx` | Email/SMS template editor |
| `ImportCustomersDialog.tsx` | CSV import dialog |
| `RequestRefundDialog.tsx` | Staff refund request form |

---

## Implementation Priority

1. **Critical Fixes:** Settings persistence, Journal glitches
2. **Core Structure:** Appointments tabs, Dashboard restructure, Trial banners
3. **Workflow:** Maker-checker refunds, Confirmation modals
4. **Settings:** Complete all tabs (with payments clarification)
5. **UX:** DOB picker, Walk-in buffer, Customer notes
6. **Backend:** Staff invitation emails, Template editing
7. **Reporting:** Insights with thresholds
8. **Data:** Import/Export
9. **Polish:** Mobile audit, Help page
10. **Quality:** Testing suite, Performance

