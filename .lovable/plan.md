

# Complete Implementation Roadmap
## Salon, Bookings, Client, Landing & BackOffice Modules

This roadmap covers ALL remaining gaps across all modules, structured into **5-phase implementation attempts** that flow logically and build upon each other.

---

## Current State Summary

| Platform | Completion | Key Gaps |
|----------|------------|----------|
| **Salon Module** | ~85% | Staff actions (Change Role, Remove), Payment gateway integration, Plan limit enforcement |
| **Public Booking** | ~60% | Deposit calculation, Payment checkout (Stripe/Paystack), Voucher/purse at checkout |
| **Client Portal** | ~40% | Booking Detail page, Booking Actions (On My Way, etc.), PurseAuthGate, Approval flows, Tips/Reviews |
| **Landing & Waitlist** | 0% | All pages, waitlist table, feature flag toggle |
| **BackOffice** | 0% | All modules, 2FA auth, domain restriction, audit logs |

---

## Implementation Structure

Each **Implementation Attempt** contains **5 phases** that can be executed sequentially. The attempts are ordered by dependency and priority.

---

# IMPLEMENTATION ATTEMPT 1: Foundation & Database Infrastructure
**Priority: Highest | Effort: 3-4 days**

This attempt establishes the database foundations required by all subsequent attempts.

## Phase 1.1: Dynamic Pricing Tables
**Goal:** Replace hardcoded `src/lib/pricing.ts` with database-driven tiers

**Database Changes:**
- Create `plans` table (id, slug, name, description, display_order, is_active, is_recommended, trial_days)
- Create `plan_pricing` table (plan_id, currency, monthly_price, annual_price, effective_monthly, valid_from, valid_until)
- Create `plan_limits` table (plan_id, max_locations, max_staff, max_services, max_products, monthly_messages, features_enabled JSONB)
- Create `plan_features` table (plan_id, feature_text, sort_order)
- Seed existing tiers (Solo, Studio, Chain) - no Starter yet

**Files to Create:**
- `src/hooks/usePlans.tsx` - Fetch plans from database
- `src/hooks/usePlanPricing.tsx` - Fetch pricing by currency

**Files to Modify:**
- `src/pages/onboarding/PlanStep.tsx` - Use database plans instead of hardcoded constants

---

## Phase 1.2: Waitlist Infrastructure
**Goal:** Enable lead capture and approval workflow

**Database Changes:**
- Create `waitlist_leads` table (name, email, phone, country, plan_interest, team_size, notes, status, position, invitation_token, invitation_expires_at, approved_by_id, converted_tenant_id)
- Create position auto-assignment trigger
- Add RLS: anon can INSERT, authenticated BackOffice users can SELECT/UPDATE

**Edge Functions:**
- `supabase/functions/submit-waitlist/index.ts` - Handle form submission, return position

---

## Phase 1.3: Feature Flags Table
**Goal:** Enable platform-wide feature toggles including waitlist mode

**Database Changes:**
- Create `feature_flags` table (name, description, scope, is_enabled, target_tenant_ids[], schedule_start, schedule_end, reason, created_by_id)
- Seed `waitlist_enabled` flag (default: true)

**Files to Create:**
- `src/hooks/useFeatureFlags.tsx` - Fetch and check platform flags

---

## Phase 1.4: BackOffice Core Tables
**Goal:** Database structure for internal ops platform

**Database Changes:**
- Create `backoffice_role` enum (super_admin, admin, support_agent)
- Create `backoffice_users` table (user_id, role, email_domain, totp_secret, totp_enabled)
- Create `backoffice_allowed_domains` table (domain)
- Create `audit_logs` table (id, actor_id, action, entity_type, entity_id, before_state, after_state, reason, ip_address, created_at)
- Create `maintenance_events` table (type, scope, severity, title, description, start_at, end_at, is_active)
- Create `platform_settings` table (key, value JSONB)
- Seed allowed domain: 'salonmagik.com'
- Seed platform settings: kill_switch, domain_allowlist

---

## Phase 1.5: RLS Policies for New Tables
**Goal:** Secure all new tables with appropriate access rules

**RLS Policies:**
- `waitlist_leads`: anon INSERT, service role SELECT/UPDATE
- `plans`, `plan_pricing`, `plan_limits`, `plan_features`: public SELECT, BackOffice UPDATE
- `feature_flags`: public SELECT (active only), BackOffice full access
- `backoffice_users`: only service role / BackOffice users
- `audit_logs`: BackOffice SELECT only (immutable - no UPDATE/DELETE)
- `maintenance_events`: public SELECT (active), BackOffice full access
- `platform_settings`: BackOffice only

---

# IMPLEMENTATION ATTEMPT 2: Landing Page & Waitlist Experience
**Priority: High | Effort: 3-4 days**

This attempt creates the marketing pages and lead capture system.

## Phase 2.1: Landing Page with Waitlist Integration
**Goal:** Create the main landing page at `/` with conditional CTAs

**Files to Create:**
- `src/pages/marketing/LandingPage.tsx`
  - Hero: "Bookings, payments, and customers. In one calm place."
  - Subtext about Salon Magik
  - Feature sections (bookings, payments, deposits, purse, offline journal)
  - Pricing preview section
  - Waitlist form (inline or modal based on `waitlist_enabled` flag)
  - When waitlist mode: CTAs show "Secure your spot" / "Join the waitlist"
  - When open mode: CTAs show "Get started free" / "Login"

**Files to Modify:**
- `src/App.tsx` - Add route `/` → `LandingPage`

---

## Phase 2.2: Waitlist Form Component
**Goal:** Capture leads with minimal friction

**Files to Create:**
- `src/components/marketing/WaitlistForm.tsx`
  - Fields: name, email, phone (optional), country (required), plan interest (Solo/Studio/Chain), team size (optional), notes (optional)
  - Inline validation
  - Submit to `waitlist_leads` via edge function
  - Success state: "You're on the list! Position #X. We'll reach out shortly."
  - Link to "See pricing" → `/pricing`

**Edge Functions:**
- Update `supabase/functions/submit-waitlist/index.ts` - Validate, insert, return position

---

## Phase 2.3: Pricing Page
**Goal:** Dynamic plan cards with region-aware pricing

**Files to Create:**
- `src/pages/marketing/PricingPage.tsx`
  - Fetch plans from `plans` table
  - Display plan cards with features from `plan_features`
  - Show pricing from `plan_pricing` based on detected region or selector
  - Trial info: "14 days free, no card required"
  - CTA respects waitlist mode
  - FAQ section (billing, trial, communication credits)

- `src/components/marketing/PlanCard.tsx` - Reusable pricing card component

**Files to Modify:**
- `src/App.tsx` - Add route `/pricing` → `PricingPage`

---

## Phase 2.4: Static Marketing Pages
**Goal:** Legal and support pages

**Files to Create:**
- `src/pages/marketing/SupportPage.tsx`
  - Contact email, live chat link (if enabled)
  - SLA expectations
  - Links to terms/privacy
  
- `src/pages/marketing/TermsPage.tsx`
  - Static legal terms text
  
- `src/pages/marketing/PrivacyPage.tsx`
  - Static privacy policy text

**Files to Modify:**
- `src/App.tsx` - Add routes `/support`, `/terms`, `/privacy`

---

## Phase 2.5: Signup with Invitation Token
**Goal:** Handle approved waitlist leads converting to users

**Files to Modify:**
- `src/pages/auth/SignupPage.tsx`
  - Check for `?invitation=<token>` parameter
  - Validate token exists in `waitlist_leads` and not expired (7 days)
  - Prefill email from waitlist lead record
  - On successful signup, update lead status to 'converted', set converted_tenant_id
  - Show "Link expired" message if token invalid

**Files to Create:**
- `src/pages/auth/InvitationExpiredPage.tsx` - Simple expired link page with link back to waitlist

---

# IMPLEMENTATION ATTEMPT 3: Client Portal Completion
**Priority: High | Effort: 4-5 days**

This attempt completes the customer self-service experience.

## Phase 3.1: Booking Detail Page
**Goal:** Dedicated page for viewing a single booking with all details

**Files to Create:**
- `src/pages/client/ClientBookingDetailPage.tsx`
  - Full booking details: date, time, location, services, products
  - Status badge with timeline
  - Payment status and amount breakdown
  - Staff assigned (if any)
  - Notes/special requests
  - Action buttons (conditional based on status)
  - Approval action cards (if pending approvals)

**Files to Modify:**
- `src/App.tsx` - Add route `/client/bookings/:id` → `ClientBookingDetailPage`
- `src/pages/client/ClientBookingsPage.tsx` - Make BookingCard clickable, link to detail page

---

## Phase 3.2: Booking Actions
**Goal:** Customer can take actions on their bookings

**Files to Create:**
- `src/components/client/BookingActions.tsx`
  - "On My Way" button (once per booking, before scheduled start)
    - Updates appointment with `customer_on_way_at` timestamp
    - Creates notification for salon
  - "Running Late" button (before start)
    - Shows delay selector (5, 10, 15, 20, 30+ minutes)
    - If 30+ min: suggest reschedule
    - Updates appointment with `customer_late_minutes`
  - "Reschedule" button (before start, subject to deposit rules)
    - Opens reschedule dialog
    - Shows cancellation fee if applicable
  - "Cancel" button (before start)
    - Shows cancellation policy and any fees
    - Requires confirmation with reason

**Files to Modify:**
- `src/hooks/client/useClientBookings.tsx` - Add actions: markOnMyWay, markRunningLate, requestReschedule
- `src/pages/client/ClientBookingDetailPage.tsx` - Integrate BookingActions component

---

## Phase 3.3: PurseAuthGate Component
**Goal:** OTP/password re-verification before applying purse funds

**Files to Create:**
- `src/components/client/PurseAuthGate.tsx`
  - When customer toggles "Use purse balance" for payment
  - Check if user has password set
    - If yes: prompt for password
    - If no: send OTP to email/phone, prompt for code
  - On successful verification, allow purse application
  - Session flag to avoid repeated verification within timeframe

**Edge Functions:**
- `supabase/functions/verify-purse-access/index.ts` - Validate OTP or password for purse usage

---

## Phase 3.4: Approval Flows
**Goal:** Customer can accept/reject proposals from salon

**Files to Create:**
- `src/components/client/ApprovalActionCard.tsx`
  - Buffer request: Accept / Suggest reschedule
  - Service change: Approve / Reject (with price difference shown)
  - Refund proposal: Accept refund / Accept store credit / Reject

**Database Changes:**
- Add `customer_response` column to relevant tables or create `approval_requests` table

**Files to Modify:**
- `src/pages/client/ClientBookingDetailPage.tsx` - Show ApprovalActionCard when pending approvals exist

---

## Phase 3.5: Post-Service Features
**Goal:** Tips and reviews after service completion

**Files to Create:**
- `src/components/client/TipReviewDialog.tsx`
  - Tip amount input (percentage or fixed)
  - Star rating
  - Text review
  - 48-hour window after service completion
  
- `src/hooks/client/useClientTipReview.tsx` - Submit tip and review

**Database Changes:**
- Create `reviews` table (appointment_id, customer_id, rating, review_text, tip_amount, created_at)

**Files to Modify:**
- `src/pages/client/ClientBookingDetailPage.tsx` - Show tip/review prompt for completed bookings within 48h window

---

# IMPLEMENTATION ATTEMPT 4: Public Booking Completion
**Priority: High | Effort: 4-5 days**

This attempt completes the booking-to-payment flow for public customers.

## Phase 4.1: Deposit Calculation Logic
**Goal:** Calculate required deposits based on service rules

**Database Changes:**
- Add columns to `services` table: `deposit_type` (percentage/fixed), `deposit_value`, `cancellation_fee_type`, `cancellation_fee_value`

**Files to Create:**
- `src/hooks/booking/useDepositCalculation.tsx`
  - Calculate total deposit required from cart items
  - Calculate cancellation fees
  - Return breakdown: { depositRequired, depositAmount, cancellationFee }

**Files to Modify:**
- `src/pages/booking/components/BookingWizard.tsx` - Show deposit breakdown in review step

---

## Phase 4.2: Payment Gateway Integration
**Goal:** Process payments via Stripe (default) or Paystack (NG/GH)

**Edge Functions:**
- `supabase/functions/create-payment-session/index.ts`
  - Detect region to choose gateway (Paystack for NG/GH, Stripe otherwise)
  - Create checkout session
  - Return checkout URL
  
- `supabase/functions/payment-webhook/index.ts`
  - Handle Stripe/Paystack webhooks
  - Update appointment payment_status
  - Record transaction

**Files to Modify:**
- `src/pages/booking/components/BookingWizard.tsx`
  - Add payment step after review
  - "Pay deposit" / "Pay full" / "Pay at salon" options
  - Redirect to payment gateway
  - Handle success/failure callbacks

---

## Phase 4.3: Voucher Code Input
**Goal:** Allow customers to apply voucher codes at checkout

**Files to Create:**
- `src/components/booking/VoucherInput.tsx`
  - Text input for voucher code
  - Validate against `vouchers` table
  - Show discount applied
  - Handle single-use and expiration

**Files to Modify:**
- `src/hooks/booking/useBookingCart.tsx` - Add voucher state and discount calculation
- `src/pages/booking/components/BookingWizard.tsx` - Include VoucherInput in review step

---

## Phase 4.4: Purse Application for Logged-in Customers
**Goal:** Allow returning customers to use store credit

**Files to Create:**
- `src/components/booking/CustomerPurseToggle.tsx`
  - For logged-in customers only
  - Show available balance
  - Toggle to apply purse first
  - Integrate with PurseAuthGate for verification

**Files to Modify:**
- `src/pages/booking/components/BookingWizard.tsx`
  - Detect if customer is logged in (via email match)
  - Show purse balance if available
  - Calculate: total - purse - voucher = amount due

---

## Phase 4.5: Enhanced Slot Availability
**Goal:** Improve time slot calculation accuracy

**Files to Modify:**
- `src/hooks/booking/useAvailableSlots.tsx`
  - Account for service duration in slot calculation
  - Consider staff availability (if assigned)
  - Handle buffer time between appointments
  - Block slots that would exceed closing time
  - Show "limited availability" indicator when near capacity

---

# IMPLEMENTATION ATTEMPT 5: BackOffice Module - Core
**Priority: Medium-High | Effort: 6-7 days**

This attempt builds the internal ops platform foundation.

## Phase 5.1: BackOffice Authentication
**Goal:** Domain-restricted login with mandatory 2FA

**Files to Create:**
- `src/hooks/backoffice/useBackOfficeAuth.tsx`
  - Check email domain against `backoffice_allowed_domains`
  - Block login if domain not allowed
  - After password auth, require TOTP verification
  - Store 2FA state in context
  
- `src/pages/backoffice/BackOfficeLoginPage.tsx`
  - Email + password form
  - Domain validation before submit
  - TOTP entry after password success
  - Error messages for blocked domains

- `src/components/backoffice/TOTPSetupDialog.tsx`
  - Generate TOTP secret
  - Display QR code for authenticator app
  - Verify code before enabling
  - Store secret in `backoffice_users.totp_secret`

**Files to Modify:**
- `src/App.tsx` - Add `/backoffice/login` route

---

## Phase 5.2: BackOffice Layout & Navigation
**Goal:** Sidebar navigation and protected routes

**Files to Create:**
- `src/components/backoffice/BackOfficeSidebar.tsx`
  - Navigation items: Dashboard, Waitlist, Tenants, Pricing & Plans, Feature Flags, Maintenance, Notifications, Audit Logs, Settings, Logout
  - Role-based visibility (some items hidden for Support Agent)
  - User info display with role badge

- `src/components/backoffice/BackOfficeProtectedRoute.tsx`
  - Check BackOffice auth state
  - Verify 2FA completed
  - Redirect to login if not authenticated

- `src/components/backoffice/BackOfficeInactivityGuard.tsx`
  - 22 minute warning modal
  - 30 minute forced logout with 60s countdown
  - Block all actions during countdown

**Files to Modify:**
- `src/App.tsx` - Add `/backoffice/*` routes with protection

---

## Phase 5.3: BackOffice Dashboard
**Goal:** High-level overview of platform status

**Files to Create:**
- `src/pages/backoffice/BackOfficeDashboard.tsx`
  - Tenant stats: total, by plan, by region
  - Waitlist queue count
  - Active incidents/maintenance
  - Communication credit alarms
  - Trial distribution chart
  - Recent activity feed

- `src/hooks/backoffice/usePlatformStats.tsx`
  - Aggregate tenant data
  - Count waitlist pending
  - Check for low credit tenants

---

## Phase 5.4: Waitlist Administration
**Goal:** Approve/deny leads and send invitations

**Files to Create:**
- `src/pages/backoffice/WaitlistAdminPage.tsx`
  - Table of waitlist leads with status filter
  - Lead details panel
  - Approve button: generates 7-day token, sends email
  - Reject button: marks rejected, logs reason (no email sent)
  - Export to CSV

- `src/hooks/backoffice/useWaitlistAdmin.tsx`
  - CRUD operations on waitlist_leads
  - Generate invitation token
  - Track approval/rejection

**Edge Functions:**
- `supabase/functions/send-waitlist-approval/index.ts`
  - Generate unique token
  - Set 7-day expiration
  - Send approval email: "You're in! Complete your setup"
  - Link: `/signup?invitation=<token>`
  - Update lead status to 'invited'

---

## Phase 5.5: Audit Logging
**Goal:** Immutable log of all sensitive actions

**Files to Create:**
- `src/pages/backoffice/AuditLogsPage.tsx`
  - Filterable table: actor, action, date range, entity type
  - Detail view showing before/after state
  - Export to CSV
  - No edit/delete capabilities

- `src/hooks/backoffice/useAuditLogs.tsx`
  - Fetch with pagination and filters
  - Log helper function for other hooks

**Database Changes:**
- Create trigger function to auto-log on INSERT/UPDATE/DELETE for sensitive tables
- Ensure audit_logs has no UPDATE/DELETE policies

---

# IMPLEMENTATION ATTEMPT 6: BackOffice Module - Operations
**Priority: Medium | Effort: 5-6 days**

This attempt completes the BackOffice operational modules.

## Phase 6.1: Tenant Management
**Goal:** View and manage tenant profiles

**Files to Create:**
- `src/pages/backoffice/TenantsPage.tsx`
  - Searchable/filterable tenant list
  - View tenant profile: plan, region, locations, staff count, billing state, KYC status, credits
  - Flag tenant (internal note)
  - Pause tenant access (with reason)
  - Trigger new invitation (for owner changes)
  - NO operational edits (appointments, customers, services)

- `src/hooks/backoffice/useTenantAdmin.tsx`
  - Fetch tenant with aggregated stats
  - Flag/unflag tenant
  - Pause/unpause access

---

## Phase 6.2: Pricing & Plans Administration
**Goal:** Manage plans, pricing, and promotions

**Files to Create:**
- `src/pages/backoffice/PricingAdminPage.tsx`
  - Plan list with current pricing
  - Add new plan (Starter tier can be added here)
  - Edit plan details, limits, features
  - Set pricing per region
  - Create promotions/overrides
  - All changes require confirmation modal with reason
  - Changes logged to audit

- `src/hooks/backoffice/usePricingAdmin.tsx`
  - CRUD on plans, plan_pricing, plan_limits, plan_features
  - Create pricing overrides

- `src/components/backoffice/ConfirmWithReasonDialog.tsx`
  - Modal requiring reason text before confirming action
  - Used for all sensitive changes

---

## Phase 6.3: Feature Flags
**Goal:** Toggle platform features with scheduling

**Files to Create:**
- `src/pages/backoffice/FeatureFlagsPage.tsx`
  - List all flags with current state
  - Toggle enabled/disabled
  - Set scope: platform, app, tenant, feature
  - Set severity: low, medium, high
  - Schedule activation/deactivation
  - Target specific tenants
  - High severity shows user-facing banner

- `src/hooks/backoffice/useFeatureFlagsAdmin.tsx`
  - CRUD on feature_flags
  - Check scheduled flags

---

## Phase 6.4: Maintenance & Incidents
**Goal:** Schedule maintenance and log incidents

**Files to Create:**
- `src/pages/backoffice/MaintenancePage.tsx`
  - Planned maintenance scheduler
  - Emergency maintenance toggle
  - Incident log: severity, impact, description, resolution
  - Active maintenance shows banner on platforms

- `src/hooks/backoffice/useMaintenanceEvents.tsx`
  - CRUD on maintenance_events
  - Create/update incidents

---

## Phase 6.5: System Notifications & Settings
**Goal:** Send announcements and manage platform settings

**Files to Create:**
- `src/pages/backoffice/NotificationsAdminPage.tsx`
  - Create system announcements
  - Target by plan, region, or specific tenants
  - Channels: in-app, email
  - Template editing for system categories only

- `src/pages/backoffice/BackOfficeSettingsPage.tsx`
  - Domain allowlist management
  - 2FA enforcement settings
  - Kill switch (Super Admin only): platform-wide read-only mode
  - Kill switch shows emergency banner, blocks new actions

- `src/hooks/backoffice/useSystemNotifications.tsx`
- `src/hooks/backoffice/usePlatformSettings.tsx`

---

# IMPLEMENTATION ATTEMPT 7: Salon Module Polish
**Priority: Medium | Effort: 2-3 days**

This attempt completes remaining Salon module gaps.

## Phase 7.1: Staff Role Changes
**Goal:** Implement Change Role and Remove from Team actions

**Files to Modify:**
- `src/pages/salon/StaffPage.tsx`
  - Wire "Change Role" dropdown item
  - Open role selection dialog
  - Call mutation to update user_roles
  - Wire "Remove from Team" dropdown item
  - Show confirmation dialog with impact warning
  - Delete user_roles record for tenant

**Files to Create:**
- `src/components/dialogs/ChangeStaffRoleDialog.tsx`
- `src/components/dialogs/RemoveStaffDialog.tsx`

---

## Phase 7.2: Permission Overrides per User
**Goal:** Individual-level permission adjustments

**Database Changes:**
- Ensure `user_permission_overrides` table exists (user_id, tenant_id, module, allowed)

**Files to Modify:**
- `src/components/staff/PermissionsTab.tsx`
  - Add secondary view for individual overrides
  - Allow owner to grant/revoke specific modules per user
  - Show override indicator in main grid

---

## Phase 7.3: Plan Limit Enforcement
**Goal:** Check limits before creating resources

**Files to Create:**
- `src/hooks/usePlanLimits.tsx`
  - Fetch current tenant's plan limits
  - Check: canAddLocation, canAddStaff, canAddService, canAddProduct
  - Return remaining counts

**Files to Modify:**
- `src/components/dialogs/AddServiceDialog.tsx` - Check limit before allowing add
- `src/components/dialogs/AddProductDialog.tsx` - Check limit before allowing add
- `src/components/dialogs/InviteStaffDialog.tsx` - Check staff limit
- `src/pages/salon/SettingsPage.tsx` (Locations tab) - Check location limit
- Show upgrade prompt when limit reached

---

## Phase 7.4: Resend Invitation Action
**Goal:** Allow resending pending staff invitations

**Files to Modify:**
- `src/pages/salon/StaffPage.tsx`
  - Wire "Resend" button in pending invitations tab
  - Call edge function to send new email
  - Update invitation timestamp

---

## Phase 7.5: Subscription Billing Integration
**Goal:** Connect to Stripe Billing for plan payments

**Edge Functions:**
- `supabase/functions/create-billing-session/index.ts`
  - Create Stripe Checkout session for subscription
  - Handle Paystack subscription for NG/GH
  
- `supabase/functions/billing-webhook/index.ts`
  - Handle subscription events
  - Update tenant billing status

**Files to Create:**
- `src/components/billing/SubscriptionManager.tsx`
  - Current plan display
  - Upgrade/downgrade options
  - Billing history

**Files to Modify:**
- `src/pages/salon/SettingsPage.tsx` - Add Billing tab with SubscriptionManager

---

# IMPLEMENTATION ATTEMPT 8: BackOffice Impersonation & Polish
**Priority: Lower | Effort: 2-3 days**

This attempt adds view-only impersonation and final polish.

## Phase 8.1: Impersonation System
**Goal:** View-only tenant access for support

**Files to Create:**
- `src/components/backoffice/ImpersonationModal.tsx`
  - Select tenant to view
  - Require reason text
  - Confirmation before proceeding
  - Log to audit

- `src/hooks/backoffice/useImpersonation.tsx`
  - Set impersonation context
  - Read-only mode flag
  - Exit impersonation

**Rules:**
- View-only: no payments, refunds, withdrawals, subscription edits
- Every action shows "Viewing as [Tenant]" banner
- All actions logged with impersonation flag

---

## Phase 8.2: Communication Credits Management
**Goal:** Set credit pricing and overrides

**Files to Modify:**
- `src/pages/backoffice/PricingAdminPage.tsx`
  - Add section for message credit pricing
  - Per-channel pricing: SMS, WhatsApp (email is free)
  - Create tenant-specific overrides
  - Set low credit warning thresholds

---

## Phase 8.3: Maintenance Banner Integration
**Goal:** Show active maintenance warnings across platforms

**Files to Create:**
- `src/components/layout/MaintenanceBanner.tsx`
  - Fetch active maintenance events
  - Show dismissible banner on salon/client/booking platforms
  - Style based on severity

**Files to Modify:**
- `src/components/layout/SalonSidebar.tsx` - Include MaintenanceBanner
- `src/components/client/ClientSidebar.tsx` - Include MaintenanceBanner
- `src/pages/booking/BookingPage.tsx` - Include MaintenanceBanner

---

## Phase 8.4: Kill Switch Implementation
**Goal:** Emergency platform-wide read-only mode

**Files to Create:**
- `src/components/backoffice/KillSwitchBanner.tsx`
  - Full-screen blocking banner
  - Shows reason from platform_settings
  - Only Super Admin can deactivate

**Files to Modify:**
- Add kill switch check to all write operations across platforms
- Show banner on all pages when active

---

## Phase 8.5: BackOffice Polish
**Goal:** Final cleanup and improvements

**Tasks:**
- Add loading states and error handling to all BackOffice pages
- Implement pagination for large tables
- Add keyboard shortcuts
- Mobile responsive sidebar
- Help documentation links

---

# File Summary

## Files to Create (Total: 55+)

### Marketing (6)
- `src/pages/marketing/LandingPage.tsx`
- `src/pages/marketing/PricingPage.tsx`
- `src/pages/marketing/SupportPage.tsx`
- `src/pages/marketing/TermsPage.tsx`
- `src/pages/marketing/PrivacyPage.tsx`
- `src/components/marketing/WaitlistForm.tsx`
- `src/components/marketing/PlanCard.tsx`

### Client Portal (6)
- `src/pages/client/ClientBookingDetailPage.tsx`
- `src/components/client/BookingActions.tsx`
- `src/components/client/PurseAuthGate.tsx`
- `src/components/client/ApprovalActionCard.tsx`
- `src/components/client/TipReviewDialog.tsx`
- `src/pages/auth/InvitationExpiredPage.tsx`

### Public Booking (3)
- `src/hooks/booking/useDepositCalculation.tsx`
- `src/components/booking/VoucherInput.tsx`
- `src/components/booking/CustomerPurseToggle.tsx`

### BackOffice (20+)
- `src/pages/backoffice/BackOfficeLoginPage.tsx`
- `src/pages/backoffice/BackOfficeDashboard.tsx`
- `src/pages/backoffice/WaitlistAdminPage.tsx`
- `src/pages/backoffice/TenantsPage.tsx`
- `src/pages/backoffice/PricingAdminPage.tsx`
- `src/pages/backoffice/FeatureFlagsPage.tsx`
- `src/pages/backoffice/MaintenancePage.tsx`
- `src/pages/backoffice/NotificationsAdminPage.tsx`
- `src/pages/backoffice/AuditLogsPage.tsx`
- `src/pages/backoffice/BackOfficeSettingsPage.tsx`
- `src/hooks/backoffice/useBackOfficeAuth.tsx`
- `src/hooks/backoffice/usePlatformStats.tsx`
- `src/hooks/backoffice/useWaitlistAdmin.tsx`
- `src/hooks/backoffice/useTenantAdmin.tsx`
- `src/hooks/backoffice/usePricingAdmin.tsx`
- `src/hooks/backoffice/useFeatureFlagsAdmin.tsx`
- `src/hooks/backoffice/useMaintenanceEvents.tsx`
- `src/hooks/backoffice/useAuditLogs.tsx`
- `src/hooks/backoffice/useImpersonation.tsx`
- `src/components/backoffice/BackOfficeSidebar.tsx`
- `src/components/backoffice/BackOfficeProtectedRoute.tsx`
- `src/components/backoffice/BackOfficeInactivityGuard.tsx`
- `src/components/backoffice/TOTPSetupDialog.tsx`
- `src/components/backoffice/ImpersonationModal.tsx`
- `src/components/backoffice/ConfirmWithReasonDialog.tsx`
- `src/components/backoffice/KillSwitchBanner.tsx`

### Salon Module (5)
- `src/components/dialogs/ChangeStaffRoleDialog.tsx`
- `src/components/dialogs/RemoveStaffDialog.tsx`
- `src/hooks/usePlanLimits.tsx`
- `src/components/billing/SubscriptionManager.tsx`
- `src/components/layout/MaintenanceBanner.tsx`

### Hooks (5)
- `src/hooks/usePlans.tsx`
- `src/hooks/usePlanPricing.tsx`
- `src/hooks/useFeatureFlags.tsx`
- `src/hooks/client/useClientTipReview.tsx`

### Edge Functions (6)
- `supabase/functions/submit-waitlist/index.ts`
- `supabase/functions/send-waitlist-approval/index.ts`
- `supabase/functions/verify-purse-access/index.ts`
- `supabase/functions/create-payment-session/index.ts`
- `supabase/functions/payment-webhook/index.ts`
- `supabase/functions/create-billing-session/index.ts`
- `supabase/functions/billing-webhook/index.ts`

---

# Effort Summary

| Attempt | Description | Phases | Effort |
|---------|-------------|--------|--------|
| 1 | Foundation & Database Infrastructure | 5 | 3-4 days |
| 2 | Landing Page & Waitlist | 5 | 3-4 days |
| 3 | Client Portal Completion | 5 | 4-5 days |
| 4 | Public Booking Completion | 5 | 4-5 days |
| 5 | BackOffice Core | 5 | 6-7 days |
| 6 | BackOffice Operations | 5 | 5-6 days |
| 7 | Salon Module Polish | 5 | 2-3 days |
| 8 | BackOffice Polish & Impersonation | 5 | 2-3 days |
| **Total** | | **40 phases** | **30-37 days** |

---

# Recommended Execution Order

1. **Attempt 1** - Foundation (required by all others)
2. **Attempt 2** - Landing & Waitlist (marketing priority)
3. **Attempt 5.1-5.4** - BackOffice core to manage waitlist
4. **Attempt 3** - Client Portal (customer experience)
5. **Attempt 4** - Public Booking (complete booking flow)
6. **Attempt 5.5 + 6** - BackOffice operations
7. **Attempt 7** - Salon polish
8. **Attempt 8** - Final polish

