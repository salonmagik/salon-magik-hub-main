
# Salon Magik - Complete Implementation Plan (Final)

## Overview

This document consolidates ALL implementation requirements for the v1 launch. It serves as the single source of truth.

---

## Phase 1: Quick Fixes & Branding ✅ COMPLETED

### 1.1 Favicon Update
**Files to create/copy:**
- `public/favicon.ico` (from user upload)
- `public/favicon-16x16.png` (from user upload)
- `public/favicon-32x32.png` (from user upload)
- `public/apple-touch-icon.png` (from user upload)
- `public/android-chrome-192x192.png` (from user upload)
- `public/android-chrome-512x512.png` (from user upload)
- `public/site.webmanifest` (new)

**Files to modify:**
- `index.html` - Update favicon links

### 1.2 Fix "🎁Free" Badge
**File:** `src/components/layout/SalonSidebar.tsx`
- Replace hardcoded "Free" badge with actual plan name from tenant data
- Show trial countdown if in trial period
- Show "Past Due" if payment failed

### 1.3 Make Owner Phone & Address Required
**Files to modify:**
- `src/components/onboarding/ProfileStep.tsx` - Change "Phone number" to "Phone number *"
- `src/components/onboarding/BusinessStep.tsx` - Change "Address (optional)" to "Address *"
- `src/pages/onboarding/OnboardingPage.tsx` - Add validation for phone and address

### 1.4 BackOffice Login Placeholder Update
**File:** `src/pages/backoffice/BackofficeLoginPage.tsx`
- Change placeholder from `admin@company.com` to `example@salonmagik.com`

### 1.5 Fixed Sidebar Height
**File:** `src/components/layout/SalonSidebar.tsx`
- Sidebar should use `h-screen` with `overflow-hidden` for fixed height
- Content area should use `overflow-y-auto` for scrolling
- Mobile sidebar already uses `fixed inset-y-0`

```typescript
// Desktop sidebar
<aside className="hidden lg:flex flex-col bg-primary relative z-[60] transition-all duration-300 h-screen overflow-hidden">

// Main content area
<main className="flex-1 flex flex-col h-screen overflow-hidden">
  <header>...</header>
  <div className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</div>
</main>
```

---

## Phase 2: Authentication Enhancements

### 2.1 Remember Me Feature
**Files to modify:**
- `src/pages/auth/LoginPage.tsx` - Wire up rememberMe checkbox to session persistence

### 2.2 Google OAuth
**Action:** Use `supabase--configure-social-auth` tool to enable Google OAuth

**Files to modify:**
- `src/pages/auth/LoginPage.tsx` - Add Google sign-in handler
- `src/pages/auth/SignupPage.tsx` - Add Google sign-up handler

---

## Phase 3: Landing Page & Mobile Fixes

### 3.1 Responsive Logo
**File:** `src/components/SalonMagikLogo.tsx`
- Add `xs` size: icon 18px, container 28px, text "text-base"
- Add `responsiveSize` prop for mobile/desktop variants

### 3.2 Landing Navigation
**File:** `src/components/landing/LandingNav.tsx`
- Use `xs` logo on mobile, `sm` on desktop
- Make button sizes responsive (text-xs on mobile, text-sm on desktop)
- Keep Pricing link visible on all screen sizes

---

## Phase 4: Geo-Based Currency Detection

### 4.1 Currency Detection Hook
**New file:** `src/hooks/useGeoCurrency.tsx`
- Detect user country via IP geolocation API
- Map NG → NGN, GH → GHS, others → USD
- **NO manual override on frontend** - only BackOffice can override

### 4.2 Pricing Page Update
**File:** `src/pages/marketing/PricingPage.tsx`
- Auto-select currency based on geo-detection
- **Remove manual currency selector** from frontend
- Currency is read-only, determined by IP or BackOffice override

### 4.3 BackOffice Currency Override
**File:** `src/pages/backoffice/SettingsPage.tsx`
- Add "Currency Override" section for BackOffice admins
- Can set forced currency for specific tenants
- Stored in tenant record or platform_settings

---

## Phase 5: BackOffice Super Admin Setup

### 5.1 Super Admin Provisioning
**Details:**
- Super Admin email: `tech@salonmagik.com`
- Password: Auto-generated secure password
- Password sent via email to `tech@salonmagik.com` using branded Salon Magik template

**Edge Function:** `supabase/functions/provision-super-admin/index.ts`
```typescript
// 1. Generate secure random password
// 2. Create auth user with tech@salonmagik.com
// 3. Insert into backoffice_users with role='super_admin'
// 4. Send password via branded email template
// 5. Mark as seeded in platform_settings
```

**One-time seed:**
- Check if backoffice already seeded
- If not, invoke provision function
- Record seeded status to prevent re-running

### 5.2 Manage BackOffice Admins Page
**New files:**
- `src/pages/backoffice/AdminsPage.tsx`
- `src/hooks/backoffice/useBackofficeUsers.tsx`

**Files to modify:**
- `src/components/backoffice/BackofficeLayout.tsx` - Add nav item
- `src/App.tsx` - Add route

**Database changes:**
- Add INSERT policy for `super_admin` to create backoffice users
- Add DELETE policy for `super_admin` (cannot delete self)

### 5.3 BackOffice Single-Session Enforcement

**New table:** `backoffice_sessions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| session_token | text | Unique session identifier |
| ip_address | inet | User's IP address |
| user_agent | text | Browser/device info |
| city | text | Geo-detected city |
| country | text | Geo-detected country |
| region | text | Geo-detected region |
| isp | text | Internet service provider |
| device_type | text | desktop/mobile/tablet |
| started_at | timestamptz | Session start time |
| last_activity_at | timestamptz | Last activity time |
| ended_at | timestamptz | When session ended |
| end_reason | text | 'logout'/'expired'/'replaced'/'force_ended' |

**Login flow:**
1. On successful login, check for existing active session
2. If active session exists on DIFFERENT device/browser:
   - Deny login with message: "You are already logged in on another device. Please log out there first or contact an admin."
3. If same device, update session
4. Record all session data including geo-location

**Session audit:**
- All sessions logged with full location data
- Sessions table viewable in BackOffice > Sessions tab
- Admins can force-end sessions

---

## Phase 6: Chain Plan Pricing Structure

### 6.1 Database Changes
**New table:** `additional_location_pricing`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| plan_id | uuid | FK to plans |
| tier_label | text | "2-3", "4-10", "11+" |
| tier_min | integer | Minimum locations |
| tier_max | integer | Maximum (null for unlimited) |
| currency | text | USD/NGN/GHS |
| price_per_location | numeric | Cost per location |
| is_custom | boolean | True for "11+" |

**Insert Chain pricing:**
- Base (1 location): $45 / ₦35,000 / ₵540
- 2-3 locations: $30 / ₦25,000 / ₵360 per location
- 4-10 locations: $20 / ₦18,000 / ₵240 per location
- 11+: Custom (set in BackOffice)

**Update plan_limits:**
- Chain monthly_messages: 250 (not 500)

### 6.2 Pricing Page Display Fix
**File:** `src/pages/marketing/PricingPage.tsx`
- Fix "-1 locations" display to show "Unlimited"
- Add additional location pricing breakdown for Chain plan
- Show base price includes first location

---

## Phase 7: Discount & Referral System

### 7.1 Discount Windows

```
Month 0 → Month 6: Waitlist 12% discount (if from waitlist)
Month 7 → Month 12: Referral 4% discount (if available)
Month 12+: No automatic discounts
```

**Rules:**
- Only one promo code per invoice/billing period
- Annual plans have built-in 12% discount, no stacking
- Discounts apply to subscription only (not credits/add-ons)
- Referral discounts do NOT apply to annual terms or add-on locations

### 7.2 Database Schema

**New tables:**

`referral_codes`
| Column | Type |
|--------|------|
| id | uuid |
| code | text (unique) |
| referrer_tenant_id | uuid |
| max_redemptions | integer (always 1) |
| consumed | boolean |
| consumed_at | timestamptz |
| consumed_by_tenant_id | uuid |

`referral_discounts`
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| source | text ('referrer'/'referee') |
| referral_code_id | uuid |
| percentage | numeric |
| available | boolean |
| used_on_invoice_id | uuid |
| expires_at | timestamptz |

`promo_codes`
| Column | Type |
|--------|------|
| id | uuid |
| code | text (unique) |
| discount_percentage | numeric |
| valid_from | timestamptz |
| valid_until | timestamptz |
| max_redemptions | integer |
| redemption_count | integer |
| applies_to | text ('subscription') |
| is_active | boolean |

`invoice_discounts`
| Column | Type |
|--------|------|
| id | uuid |
| invoice_id | uuid |
| tenant_id | uuid |
| discount_type | text |
| discount_percentage | numeric |
| discount_amount | numeric |
| billing_period_start | date |
| billing_period_end | date |

**Tenant table additions:**
- `signup_date`
- `waitlist_lead_id`
- `waitlist_promo_used`
- `referral_code` (unique)
- `referral_discount_available`
- `promo_applied_this_billing_period`

**Platform settings:**
```json
{
  "waitlist_percentage": 12,
  "waitlist_duration_months": 6,
  "referral_percentage": 4,
  "referral_window_start_month": 7,
  "referral_window_end_month": 12,
  "single_use_codes_enforced": true
}
```

### 7.3 UI Components

**New files:**
- `src/components/billing/PromoCodeInput.tsx`
- `src/components/billing/ReferralDiscountBanner.tsx`
- `src/hooks/useDiscounts.tsx`
- `src/hooks/useReferrals.tsx`

**Error messages:**
- "A promo is already applied to this billing period."
- "This code has already been used."
- "This code is not eligible for your current plan or timing."

**Files to modify:**
- `src/pages/salon/SettingsPage.tsx` - Add Referrals tab
- `src/pages/backoffice/SettingsPage.tsx` - Add Discounts configuration
- `src/components/landing/CTASection.tsx` - Show 12% discount callout
- `src/pages/marketing/PricingPage.tsx` - Show discount messaging, change CTAs to "Get exclusive access"

### 7.4 Stripe Webhook Updates
**File:** `supabase/functions/stripe-billing-webhook/index.ts`
- Handle `invoice.created` event
- Apply discounts based on eligibility
- Skip for annual plans
- Record in invoice_discounts table

---

## Phase 8: Paystack Integration

### 8.1 Secret Configuration
**Secrets needed:**
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`

### 8.2 Edge Function Updates
**File:** `supabase/functions/create-payment-session/index.ts`
- Replace mock checkout URL with actual Paystack API call
- POST to `https://api.paystack.co/transaction/initialize`
- Include amount (kobo/pesewas), email, reference, callback_url, metadata
- Return `authorization_url` from Paystack response

**File:** `supabase/functions/payment-webhook/index.ts`
- Verify Paystack signature (HMAC SHA-512)
- Handle `charge.success` event
- Extract metadata (appointment_id, payment_intent_id, tenant_id)
- Update appointment payment_status and amount_paid

### 8.3 Booking Flow Updates
**Files to modify:**
- `src/pages/booking/components/BookingWizard.tsx` - Handle Paystack redirect
- Create payment success/failure pages

---

## Phase 9: Comprehensive Banner System

### 9.1 Architecture

```
GlobalBannerProvider (Context)
    ├── SalonBanners (Billing, Trial, Onboarding)
    ├── BookingBanners (Disabled, Suspended, Maintenance)
    ├── ClientBanners (Session, Fees, Refunds)
    └── BackofficeBanners (Maintenance, Incidents, Auth)
```

### 9.2 Banner Types & Priority

| Priority | Type | Apps | Color | Dismissible | Blocking |
|----------|------|------|-------|-------------|----------|
| 1 | Kill Switch | All | Error | No | Yes |
| 2 | Payment Failed | Salon | Error | No | Yes |
| 3 | Trial Expired | Salon | Error | No | Yes |
| 4 | Booking Suspended | Booking, Client | Error | No | Yes |
| 5 | Maintenance High | All | Error | No | Partial |
| 6 | Onboarding Incomplete | Salon | Warning | No | Yes |
| 7 | Trial T-7 days | Salon | Warning | Yes | No |
| 8 | Trial T-3 hours | Salon | Warning | Yes | No |
| 9 | Maintenance Planned | All | Maintenance | Yes | No |
| 10 | Outstanding Fees | Client | Maintenance | Yes | No |
| 11 | Low Credits | Salon | Warning | Yes | No |
| 12 | Owner Invite Expired | Salon | Warning | Yes | No |

### 9.3 Color Scheme (Updated)
- **Info:** Same as Maintenance (not blue)
- **Success:** #16A34A on white
- **Warning:** #FDE68A background, #0F172A text
- **Error:** #FEE2E2 background, #EF4444 text
- **Maintenance/Info:** #F5F7FA background, #2563EB text

### 9.4 Multi-Content Rotation with Slider
- When multiple banners exist, show navigation dots/arrows
- User can manually navigate between banners
- Auto-rotate every 30 minutes if not manually navigating
- Show current position indicator (e.g., "1/3")

### 9.5 Banner vs Notifications Modal
- **Banner:** Surface SOME notifications as specified (billing, trial, maintenance)
- **Notifications Modal:** Still receives ALL notifications
- Banner is for high-priority, actionable alerts
- Modal is complete notification history

### 9.6 Files to Create
- `src/components/banners/GlobalBanner.tsx`
- `src/components/banners/BannerContext.tsx`
- `src/components/banners/useBannerState.tsx`
- `src/components/banners/BannerSlider.tsx` (for multi-content navigation)

### 9.7 Files to Modify
- `src/components/layout/SalonSidebar.tsx` - Replace SubscriptionBanner
- `src/components/backoffice/BackofficeLayout.tsx` - Add GlobalBanner
- `src/components/client/ClientSidebar.tsx` - Add GlobalBanner
- `src/pages/booking/components/BookingLayout.tsx` - Add GlobalBanner

---

## Phase 10: Video Tutorials

### 10.1 Inline in Help/Support Pages
**Files to modify:**
- `src/pages/salon/HelpPage.tsx` - Add Video Tutorials section with accordion
- `src/pages/marketing/SupportPage.tsx` - Add Video Tutorials card

**Content structure:**
- Getting Started (5 min)
- Adding Services (3 min)
- Staff Management (4 min)
- Payment Setup (6 min)

---

## Phase 11: Services & Products Module Enhancements

### 11.1 Module Renaming & Tab Reordering
**File:** `src/pages/salon/ServicesPage.tsx`
- Rename from "Products & Services" to "Services and Products"
- Reorder tabs: All → Services → Products → Packages → Vouchers

**File:** `src/components/layout/SalonSidebar.tsx`
- Update nav label

### 11.2 "+ Add" Popover on All Tab
**New file:** `src/components/catalog/AddItemPopover.tsx`
- Popover with options: Add service, Add product, Add package, Add voucher
- Each option opens corresponding dialog

### 11.3 Multi-Select with Checkboxes
**State management in ServicesPage.tsx:**
- Track selected items and selection type
- Clear selection when switching item types

**Updated ItemCard component:**
- Checkbox in top-left corner
- Ring highlight when selected

### 11.4 Floating Action Bar
**New file:** `src/components/catalog/BulkActionsBar.tsx`
- Fixed bar at bottom of viewport
- Actions by item type:

| Item Type | Actions |
|-----------|---------|
| Services | Create Package, Delete, Flag, Archive |
| Products | Create Package, Delete, Flag, Archive |
| Packages | Delete, Flag, Archive |
| Vouchers | Delete, Flag, Discontinue |

- Owner/Manager permission required for Delete/Archive
- Flag is always available (internal identification)

### 11.5 Deletion Restrictions
**New file:** `src/components/dialogs/ItemInUseDialog.tsx`
- Show when item is used in packages/appointments/deliveries
- List where item is used
- Offer Archive as alternative
- "Archive will remove it from the booking platform"

### 11.6 Detail Modals
**New files:**
- `src/components/dialogs/ServiceDetailDialog.tsx`
- `src/components/dialogs/PackageDetailDialog.tsx`
- `src/components/dialogs/ProductDetailDialog.tsx`
- `src/components/dialogs/VoucherDetailDialog.tsx`

Each shows: full details, images, edit button, archive/delete actions, usage stats

---

## Phase 12: Access Control & Route Protection

### 12.1 Fix Navigation Flash Issue
**File:** `src/components/layout/SalonSidebar.tsx`
- Return empty array during `permissionsLoading` (not all items)
- Show skeleton nav items during loading

```typescript
const filteredMainNavItems = useMemo(() => {
  if (permissionsLoading) return []; // Return EMPTY, not all items
  return mainNavItems.filter((item) => {
    if (!item.module) return true;
    return hasPermission(item.module);
  });
}, [hasPermission, permissionsLoading]);

// In render:
{permissionsLoading ? (
  <div className="space-y-2 px-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <Skeleton key={i} className="h-10 w-full rounded-lg" />
    ))}
  </div>
) : (
  <nav>...</nav>
)}
```

### 12.2 Access Denied Page
**New file:** `src/pages/salon/AccessDeniedPage.tsx`
- Shield icon with "Access Denied" message
- 5-second countdown timer
- "Go to Dashboard" CTA
- Auto-redirect to dashboard when timer reaches 0

### 12.3 Route Protection
**File:** `src/App.tsx`
- Add `/salon/access-denied` route
- Wrap all module-specific routes with `<ModuleProtectedRoute>`
- Redirect to access-denied page if unauthorized

**File:** `src/components/auth/ModuleProtectedRoute.tsx`
- Show full-page loader during permission check
- Redirect to access-denied if unauthorized

---

## Phase 13: Owner Invitation System

### 13.1 Database Changes
**Add to `staff_invitations` table:**
- `last_resent_at` (timestamptz)
- `resend_count` (integer, default 0)
- `invited_via` (text: 'staff_module' | 'onboarding')

### 13.2 Track Owner Invitations from Onboarding
**File:** `src/pages/onboarding/OnboardingPage.tsx`
- Include `invitedVia: "onboarding"` when sending owner invitation

**File:** `supabase/functions/send-staff-invitation/index.ts`
- Store `invited_via` field

### 13.3 Resend Throttle (30 Minutes)
**File:** `src/hooks/useStaffInvitations.tsx`
- Check `last_resent_at` before allowing resend
- Show toast with remaining wait time if throttled
- Update `last_resent_at` and `resend_count` on resend
- Reset status to "pending" if was expired

### 13.4 Cancel Invitation Warning
**File:** `src/pages/salon/StaffPage.tsx`
- Show confirmation dialog before canceling
- Use `ConfirmActionDialog` with warning variant

### 13.5 Owner Role Visibility
**File:** `src/components/dialogs/InviteStaffDialog.tsx`
- Check for active owner in staff
- Check for pending owner invitation
- Only show "Owner" option if neither exists

### 13.6 Backend Enforcement
**File:** `supabase/functions/send-staff-invitation/index.ts`
- Verify no active owner exists before allowing owner invitation
- Verify no pending owner invitation exists
- Return 400 error if conditions not met

### 13.7 Invitation Expiry
- Owner invitations expire after 7 days
- Status changes to "expired" on expiry
- Expired invitations remain in Pending Invitations tab
- Banner prompts re-invitation when expired

---

## Phase 14: Audit Log Module for Salon Owners

### 14.1 New Salon Page
**New file:** `src/pages/salon/AuditLogPage.tsx`

**Table columns:**
| Column | Description |
|--------|-------------|
| Action Type | What was done (e.g., "Appointment Created", "Service Updated") |
| Staff | Who performed the action |
| Time Started | When action began |
| Time Ended | When action completed |
| Criticality Score | % based importance (High: 80-100%, Medium: 40-79%, Low: 0-39%) |

**Criticality scoring:**
- Financial actions (payments, refunds): 90-100%
- Customer data changes: 70-85%
- Service/product changes: 50-70%
- Appointment changes: 40-60%
- View-only actions: 10-20%

### 14.2 Database Changes
**Add to `audit_logs` table:**
- `started_at` (timestamptz) - When action began
- `ended_at` (timestamptz) - When action completed
- `criticality_score` (numeric) - Calculated importance percentage

### 14.3 Access Control
- **Owner only** - Add to permission system
- Not visible to managers or staff
- Add to mainNavItems with module: "audit_log"

### 14.4 Files to Modify
- `src/components/layout/SalonSidebar.tsx` - Add Audit Log nav item (owner only)
- `src/App.tsx` - Add route
- `src/hooks/useAuditLogs.tsx` - Add criticality scoring, time range support

---

## Phase 15: Salons Overview for Chain Owners

### 15.1 New Page (DOES NOT EXIST - MUST CREATE)
**New file:** `src/pages/salon/SalonsOverviewPage.tsx`

**Features:**
- Multi-location dashboard for Chain plan owners
- Comparative performance across salons

**Metrics per salon:**
- Revenue (daily/weekly/monthly)
- Booking volume
- Staff logged in (real-time)
- Outstanding appointments
- Customer satisfaction (if reviews enabled)

**Views:**
- Summary cards for each location
- Comparative charts
- Best/worst performing locations
- Drill-down to individual salon

### 15.2 Access Control
- Only visible to Chain plan tenants
- Only owners/managers with multi-location access
- Add feature flag for gradual rollout

### 15.3 Navigation
**File:** `src/components/layout/SalonSidebar.tsx`
- Add "Salons Overview" nav item
- Only show for Chain plan tenants
- Position after Dashboard

### 15.4 Files to Create
- `src/pages/salon/SalonsOverviewPage.tsx`
- `src/hooks/useSalonsOverview.tsx`

### 15.5 Files to Modify
- `src/App.tsx` - Add route
- `src/components/layout/SalonSidebar.tsx` - Add conditional nav item

---

## Phase 16: PRD Gaps (Post-Launch Priorities)

### 16.1 OTP Verification for Service Start
- Trigger OTP for Studio and Chain plans
- Solo plan bypasses verification
- Customer receives OTP when service starts
- Staff enters OTP to confirm start

### 16.2 Tips System
**New table:** `tips`
- Database schema for tip storage
- Tip entry UI after service completion
- 48-hour eligibility window
- Client portal tip submission

### 16.3 Customer Reviews
**New table:** `reviews`
- Review submission in client portal
- Display format: first name + last initial
- Review moderation in salon admin

### 16.4 Buffer Time Flow
- "On My Way" button in client portal
- "Running Late" delay selector (up to 30 mins)
- Buffer proposal modal in appointments
- Email notifications for buffer requests
- Accept/decline CTAs in customer emails

### 16.5 Invoice Generation
- PDF/HTML invoice generation
- Invoice email sending
- Invoice history in client portal
- Invoice download in salon admin

### 16.6 Service Change During Appointment
- Service change proposal UI
- Customer approval email with CTAs
- Price difference handling (charge, credit, refund)

### 16.7 Communication Credits Purchase
- Credit pricing per region
- Payment flow for credit purchase
- Credit balance top-up logic

### 16.8 Trial Enforcement
- Trial countdown banner
- Card collection modal before trial expires
- Access restriction on trial expiry

---

## Phase 17: Launch Preparation

### 17.1 Custom Domain Setup
**DNS Configuration for www.salonmagik.com:**
- A record for @ pointing to 185.158.133.1
- A record for www pointing to 185.158.133.1
- TXT record for domain verification

### 17.2 Security Audit
- RLS policy review
- Edge function input validation
- Webhook signature verification
- Authentication flow testing

### 17.3 End-to-End Testing Checklist

**Salon Owner Journey:**
- [ ] Sign up with email/password
- [ ] Complete onboarding (profile → business → location → plan)
- [ ] Add first service
- [ ] Invite staff member
- [ ] Enable online booking
- [ ] Receive first appointment

**Customer Journey:**
- [ ] Browse public booking page
- [ ] Select services → checkout
- [ ] Complete Paystack/Stripe payment
- [ ] Access client portal via OTP
- [ ] View booking details
- [ ] Request refund

**Staff Journey:**
- [ ] Accept invitation via email
- [ ] Reset password on first login
- [ ] View assigned appointments
- [ ] Start/complete service

**BackOffice Journey:**
- [ ] Login with @salonmagik.com email
- [ ] Set up 2FA
- [ ] View waitlist
- [ ] Manage feature flags
- [ ] Start impersonation session

---

## Files Summary

### New Files (35+ total)

| File | Purpose |
|------|---------|
| `public/favicon-16x16.png` | Favicon |
| `public/favicon-32x32.png` | Favicon |
| `public/apple-touch-icon.png` | Apple touch icon |
| `public/android-chrome-192x192.png` | Android icon |
| `public/android-chrome-512x512.png` | Android icon |
| `public/site.webmanifest` | Web app manifest |
| `src/hooks/useGeoCurrency.tsx` | Geo-based currency detection |
| `src/pages/backoffice/AdminsPage.tsx` | Manage BackOffice users |
| `src/hooks/backoffice/useBackofficeUsers.tsx` | CRUD for backoffice_users |
| `src/components/billing/PromoCodeInput.tsx` | Promo code entry |
| `src/components/billing/ReferralDiscountBanner.tsx` | Referral discount display |
| `src/hooks/useDiscounts.tsx` | Discount state and operations |
| `src/hooks/useReferrals.tsx` | Referral code management |
| `src/components/banners/GlobalBanner.tsx` | Unified banner component |
| `src/components/banners/BannerContext.tsx` | Banner state provider with rotation |
| `src/components/banners/BannerSlider.tsx` | Multi-banner navigation |
| `src/components/banners/useBannerState.tsx` | Compute active banners |
| `src/components/catalog/AddItemPopover.tsx` | "+ Add" popover on All tab |
| `src/components/catalog/BulkActionsBar.tsx` | Floating bulk actions |
| `src/components/dialogs/ItemInUseDialog.tsx` | Deletion restriction warning |
| `src/components/dialogs/ServiceDetailDialog.tsx` | Service detail modal |
| `src/components/dialogs/PackageDetailDialog.tsx` | Package detail modal |
| `src/components/dialogs/ProductDetailDialog.tsx` | Product detail modal |
| `src/components/dialogs/VoucherDetailDialog.tsx` | Voucher detail modal |
| `src/pages/salon/AccessDeniedPage.tsx` | Access denied with countdown |
| `src/pages/salon/AuditLogPage.tsx` | Audit log for owners |
| `src/pages/salon/SalonsOverviewPage.tsx` | Multi-salon dashboard for Chain |
| `src/hooks/useSalonsOverview.tsx` | Chain overview data |
| `supabase/functions/provision-super-admin/index.ts` | Super admin setup |

### Modified Files (30+ files)

| File | Changes |
|------|---------|
| `index.html` | Updated favicon links |
| `src/components/layout/SalonSidebar.tsx` | Plan badge fix, nav flash fix, module rename, fixed height, audit log nav |
| `src/components/SalonMagikLogo.tsx` | Add xs size, responsive sizing |
| `src/components/landing/LandingNav.tsx` | Responsive sizing |
| `src/components/landing/CTASection.tsx` | Discount callout |
| `src/pages/marketing/PricingPage.tsx` | Geo-currency, Chain plan fix, discount messaging, remove manual override |
| `src/pages/auth/LoginPage.tsx` | Remember me, Google OAuth |
| `src/pages/auth/SignupPage.tsx` | Google OAuth |
| `src/components/onboarding/ProfileStep.tsx` | Required phone |
| `src/components/onboarding/BusinessStep.tsx` | Required address |
| `src/pages/onboarding/OnboardingPage.tsx` | Validation, owner invite tracking |
| `src/pages/backoffice/BackofficeLoginPage.tsx` | Placeholder update |
| `src/pages/backoffice/SettingsPage.tsx` | Discount configuration, currency override |
| `src/pages/salon/SettingsPage.tsx` | Referrals tab, promo code UI |
| `src/pages/salon/ServicesPage.tsx` | Tab reorder, multi-select, popover |
| `src/pages/salon/StaffPage.tsx` | Cancel confirmation, resend throttle |
| `src/pages/salon/HelpPage.tsx` | Video tutorials |
| `src/pages/marketing/SupportPage.tsx` | Video tutorials card |
| `src/hooks/useStaffInvitations.tsx` | Resend throttle, expire check |
| `src/components/dialogs/InviteStaffDialog.tsx` | Conditional owner role |
| `src/components/auth/ModuleProtectedRoute.tsx` | Full-page loader |
| `src/App.tsx` | Routes for AdminsPage, AccessDenied, AuditLog, SalonsOverview |
| `supabase/functions/create-payment-session/index.ts` | Paystack API integration |
| `supabase/functions/payment-webhook/index.ts` | Paystack webhook handling |
| `supabase/functions/stripe-billing-webhook/index.ts` | Discount application |
| `supabase/functions/send-staff-invitation/index.ts` | Owner validation, invitedVia |
| `src/hooks/useAuditLogs.tsx` | Add criticality scoring |

### Database Migrations

| Migration | Purpose |
|-----------|---------|
| Create `additional_location_pricing` | Chain plan per-location costs |
| Create `referral_codes` | Referral code tracking |
| Create `referral_discounts` | Available discounts per tenant |
| Create `promo_codes` | Platform promo codes |
| Create `invoice_discounts` | Applied discount records |
| Create `backoffice_sessions` | Session tracking with geo data |
| Add tenant discount columns | Discount state tracking |
| Add platform_settings discount_config | Configurable discount values |
| Add staff_invitations columns | last_resent_at, resend_count, invited_via |
| Update Chain plan_limits | monthly_messages = 250 |
| Add BackOffice INSERT/DELETE policies | Super Admin user management |
| Add audit_logs columns | started_at, ended_at, criticality_score |

---

## Implementation Priority Order

### Sprint 1: Critical Fixes (Day 1)
1. Favicons (5 min)
2. Fix "🎁Free" badge (10 min)
3. Required phone/address (10 min)
4. BackOffice login placeholder (5 min)
5. Access control flash fix (15 min)
6. Access Denied page (15 min)
7. Fixed sidebar height (10 min)

### Sprint 2: Authentication & Landing (Day 1-2)
8. Remember me feature (10 min)
9. Google OAuth setup (10 min)
10. Responsive logo/nav (15 min)
11. Geo-currency detection (15 min)

### Sprint 3: BackOffice & Security (Day 2)
12. Super Admin provisioning with auto-password email (30 min)
13. Manage Admins page (30 min)
14. Single-session enforcement with geo tracking (45 min)
15. Session audit table and UI (30 min)

### Sprint 4: Pricing & Discounts (Day 2-3)
16. Chain plan pricing structure (30 min)
17. Database schema for discounts (30 min)
18. Waitlist discount UI (25 min)
19. Referral system (30 min)
20. Stripe webhook discount logic (30 min)
21. BackOffice discount config (20 min)

### Sprint 5: Paystack Integration (Day 3)
22. Add Paystack secrets
23. Update create-payment-session (30 min)
24. Update payment-webhook (20 min)
25. Payment success/failure pages (20 min)

### Sprint 6: Banner System (Day 3-4)
26. Banner context with rotation (30 min)
27. GlobalBanner component with slider (40 min)
28. Integrate into all layouts (20 min)
29. Owner invite expiry banner (10 min)

### Sprint 7: Services & Products Module (Day 4)
30. Module rename & tab reorder (10 min)
31. "+ Add" popover (15 min)
32. Multi-select with checkboxes (30 min)
33. Floating action bar (30 min)
34. Deletion restrictions (20 min)
35. Detail modals (45 min)

### Sprint 8: Owner Features (Day 4-5)
36. Audit Log page for owners (45 min)
37. Salons Overview for Chain owners (60 min)
38. Owner invitation system improvements (45 min)

### Sprint 9: Content & Polish (Day 5)
39. Video tutorials sections (30 min)
40. End-to-end testing
41. Security audit
42. Custom domain setup

### Post-Launch
43. OTP verification
44. Tips system
45. Customer reviews
46. Buffer time flow
47. Invoice generation
48. Service change approval
49. Communication credits purchase
50. Trial enforcement
