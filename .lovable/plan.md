
# Salon Magik - Consolidated UI Implementation Plan

## Executive Summary
This plan consolidates two approved initiatives into a single phased implementation:
1. **Phone Input Enhancement** - Country flag selector with dial codes across all phone inputs
2. **Complete UI Build-out** - All salon platform modules, booking, client portal, backoffice, and marketing pages

The implementation follows the PRD exactly and incorporates specifications from the previous Codex build.

---

## Current State Summary

### Existing Infrastructure
- **Authentication**: Login (email/phone tabs), Signup, Forgot Password
- **Onboarding**: 3-step flow (Business, Location, Hours)
- **Salon Platform**: Sidebar navigation with placeholder modules
- **Design System**: Questrial font, primary blue (#2563EB), CSS variables configured
- **Database**: Tenants, locations, user_roles, communication_credits tables with RLS

### What This Plan Delivers
- Reusable phone input with country flag selector
- Enhanced authentication flows (password strength, phone OTP reset)
- Full onboarding overhaul (7 steps with role/plan/owner-invite)
- Session inactivity guard (55m warning, 60m logout)
- Complete salon modules (Appointments, Calendar, Customers, Services, Payments, Reports, Messaging, Journal, Staff, Settings)
- Public booking platform (`/b/:slug`)
- Client portal (`/client`)
- BackOffice platform (`/backoffice`)
- Landing page and waitlist experience

---

## Phase 1: Phone Input Component (Foundation)

### 1.1 Country Data Utility
**New file: `src/lib/countries.ts`**

Centralized country data with:
- ISO country code (NG, US, GB, etc.)
- Country name
- Dial code (+234, +1, +44, etc.)
- Flag emoji
- Priority countries at top (Nigeria, Ghana, US, UK, Kenya, South Africa)
- Full alphabetically sorted list

### 1.2 Reusable Phone Input Component
**New file: `src/components/ui/phone-input.tsx`**

Features:
- Dropdown button showing selected flag + dial code
- Searchable popover with all countries (flag + name + dial code)
- Auto-formats phone number as user types
- Outputs value in E.164 format
- Supports disabled state, error styling, ref forwarding
- Uses existing UI primitives (Popover, Command, Button, Input, ScrollArea)

### 1.3 Auth-Styled Phone Input Wrapper
**New file: `src/components/auth/AuthPhoneInput.tsx`**

Wrapper matching `AuthInput` styling pattern:
- Label above the input
- Error message display below
- Consistent spacing and typography

---

## Phase 2: Authentication Enhancements

### 2.1 Login Page Updates
**Modify: `src/pages/auth/LoginPage.tsx`**

Changes:
- Replace plain phone input in "Phone" tab with `AuthPhoneInput`
- Remove helper text about country codes
- Update validation to work with E.164 format output

### 2.2 Signup Page Updates
**Modify: `src/pages/auth/SignupPage.tsx`**

Changes:
- Replace phone field with `AuthPhoneInput`
- Add password strength validation (8+ chars, letters+numbers, no weak patterns)
- Update form handling to use E.164 formatted value

### 2.3 Forgot Password Enhancement
**Modify: `src/pages/auth/ForgotPasswordPage.tsx`**

Changes:
- Add tabs for "Email" and "Phone" reset methods
- Phone reset flow: Enter phone with country selector, receive OTP, verify, set new password
- Reuse OTP input pattern from LoginPage

### 2.4 Reset Password Page
**New file: `src/pages/auth/ResetPasswordPage.tsx`**

Features:
- Handles redirect from email reset link
- Password field with strength validation
- Confirm password field
- Submit to `supabase.auth.updateUser()`

### 2.5 Route Update
**Modify: `src/App.tsx`**

Add route: `/reset-password` pointing to `ResetPasswordPage`

---

## Phase 3: Onboarding Overhaul

### 3.1 Step Components
Create modular step components for the new onboarding flow:

| File | Purpose |
|------|---------|
| `src/components/onboarding/RoleStep.tsx` | Owner / Manager / Supervisor / Receptionist / Staff selection |
| `src/components/onboarding/ProfileStep.tsx` | First name, last name, phone, email with "same as sign-in" toggles |
| `src/components/onboarding/OwnerInviteStep.tsx` | (Non-owner only) Collect owner name/phone/email |
| `src/components/onboarding/PlanStep.tsx` | Solo / Studio / Chain tier selection |
| `src/components/onboarding/BusinessStep.tsx` | Business name, type, country, city, address, timezone, hours |
| `src/components/onboarding/LocationsStep.tsx` | (Chain only) Multi-location cards with toggles |
| `src/components/onboarding/ReviewStep.tsx` | Summary before completion |

### 3.2 Main Onboarding Page Rewrite
**Modify: `src/pages/onboarding/OnboardingPage.tsx`**

Step flow:
- **Owner path**: Role, Profile, Plan, Business, (Locations if Chain), Review
- **Non-owner path**: Role, Profile, Owner Invite, Plan, Business, (Locations if Chain), Review

Data persistence:
- Upsert to `public.onboarding_profiles` (new table if needed)
- Set `user_metadata.onboarded = true` + cookie `sm_onboarded = true`
- If non-owner, trigger owner invitation

Chain-specific features:
- "All salons in same country?" toggle
- "Do all locations share the same name?" toggle
- Locations list with default location selector
- Flags stored: `same_country`, `same_name`, `same_opening_days`, `plan`, `default_location_index`

---

## Phase 4: Session Management

### 4.1 Inactivity Guard Component
**New file: `src/components/session/InactivityGuard.tsx`**

Features:
- Warn at 55 minutes with modal
- Logout at 60 minutes with 60-second countdown
- Blocking modal that prevents interaction
- Reset on user activity (mouse, keyboard, touch)

### 4.2 Integration
Wrap salon routes with `InactivityGuard` in the layout or individual pages.

---

## Phase 5: Salon Platform Modules

### 5.1 Dashboard Enhancements
**Modify: `src/pages/salon/SalonDashboard.tsx`**

- Connect to real data from database
- Today's appointments display
- Revenue stats (today, this week, this month)
- Post-onboarding checklist (add service, add customer, book appointment)
- Quick actions grid

### 5.2 Appointments Module
**Modify/Create:**
- `src/pages/salon/AppointmentsPage.tsx`
- `src/components/appointments/AppointmentCard.tsx`
- `src/components/appointments/AppointmentActions.tsx`
- `src/components/appointments/AppointmentTimeline.tsx`

Features:
- Full CRUD with database integration
- Lifecycle actions: Start, Pause, Resume, End, Cancel, Reschedule
- Walk-in vs Scheduled tabs
- Status filtering and date range selection
- Real-time updates

### 5.3 Calendar Module (Read-Only)
**New files:**
- `src/pages/salon/CalendarPage.tsx`
- `src/components/calendar/CalendarView.tsx`
- `src/components/calendar/DayView.tsx`
- `src/components/calendar/WeekView.tsx`

Features:
- Day/Week/Month views
- Staff and location filtering
- Role-gated access
- View-only (no drag-drop creation)

### 5.4 Customers Module
**Modify/Create:**
- `src/pages/salon/CustomersPage.tsx`
- `src/components/customers/CustomerDetailDrawer.tsx`
- `src/components/customers/CustomerHistory.tsx`

Features:
- Full CRUD with database
- Customer profile drawer
- Visit history
- Balance/purse management
- Import/export
- Tags and VIP status

### 5.5 Services & Products Module
**Modify/Create:**
- `src/pages/salon/ServicesPage.tsx`
- `src/components/services/ServiceDetailDrawer.tsx`
- `src/components/services/PackageBuilder.tsx`

Features:
- Services, Packages, Products tabs
- Category management
- Deposit configuration
- Location availability
- Status toggle

### 5.6 Payments Module
**New files:**
- `src/pages/salon/PaymentsPage.tsx`
- `src/components/payments/TransactionList.tsx`
- `src/components/payments/RefundDialog.tsx`

Features:
- Transaction history
- Refund requests (pending/approved/rejected)
- Customer purse management
- Communication credits display

### 5.7 Reports Module
**New files:**
- `src/pages/salon/ReportsPage.tsx`
- `src/components/reports/RevenueChart.tsx`
- `src/components/reports/AppointmentStats.tsx`
- `src/components/reports/ServicePopularity.tsx`

Features:
- Revenue overview charts
- Appointment completion rates
- Popular services analytics
- Staff performance
- Date range filtering

### 5.8 Messaging Module
**New files:**
- `src/pages/salon/MessagingPage.tsx`
- `src/components/messaging/CreditBalance.tsx`
- `src/components/messaging/MessageTemplates.tsx`

Features:
- Communication credits balance
- Send notifications (deduct credits)
- Message templates
- Delivery history

### 5.9 Journal Module
**New files:**
- `src/pages/salon/JournalPage.tsx`
- `src/components/journal/AuditLogTable.tsx`
- `src/components/journal/ActivityTimeline.tsx`

Features:
- Audit logs display
- Filter by entity type, action, date
- Activity timeline view

### 5.10 Staff Module
**New files:**
- `src/pages/salon/StaffPage.tsx`
- `src/components/staff/StaffCard.tsx`
- `src/components/staff/InviteStaffDialog.tsx`
- `src/components/staff/RolePermissions.tsx`

Features:
- Staff member list
- Invite new staff (email/phone with country selector)
- Role assignment
- Permission matrix view
- Location assignment

### 5.11 Settings Module
**Modify: `src/pages/salon/SettingsPage.tsx`**

Implement all tabs:
- Salon Profile
- Business Hours
- Booking Settings
- Payments (integration UI)
- Notifications
- Roles & Permissions
- Subscription
- Integrations

### 5.12 Sidebar Update
**Modify: `src/components/layout/SalonSidebar.tsx`**

- Add Calendar link
- Implement role-gating for restricted modules
- Display real user info from auth context

---

## Phase 6: Public Booking Platform (`/b`)

### 6.1 Booking Layout & Pages
**New files:**
- `src/pages/booking/BookingLayout.tsx`
- `src/pages/booking/SalonPage.tsx` (main catalogue)
- `src/pages/booking/ServicePage.tsx`
- `src/pages/booking/CartPage.tsx`
- `src/pages/booking/CheckoutPage.tsx`
- `src/pages/booking/ConfirmationPage.tsx`

Routes:
- `/b/:slug` - Salon catalogue (canonical)
- `/b/:slug/service/:serviceId` - Service detail
- `/b/:slug/cart` - Cart view
- `/b/:slug/checkout` - Checkout flow
- `/b/:slug/confirmation/:bookingId` - Booking confirmation

### 6.2 Booking Components
**New files:**
- `src/components/booking/BookingHeader.tsx`
- `src/components/booking/ServiceCatalogue.tsx`
- `src/components/booking/ServiceCard.tsx`
- `src/components/booking/CartDrawer.tsx` (right drawer)
- `src/components/booking/DateTimePicker.tsx`
- `src/components/booking/StaffSelector.tsx`
- `src/components/booking/GiftFlow.tsx`

Features:
- Canonical URL enforcement (301 redirects)
- Cart as header icon with right drawer
- Catalogue stays static when cart opens
- Gift flow support
- Unified cart (services + products)
- Purse auth stub for logged-in customers
- Booking disabled/suspended states with noindex
- SEO meta tags

---

## Phase 7: Client Portal (`/client`)

### 7.1 Client Layout & Pages
**New files:**
- `src/pages/client/ClientLayout.tsx`
- `src/pages/client/ClientDashboard.tsx`
- `src/pages/client/ClientAppointments.tsx`
- `src/pages/client/ClientProfile.tsx`
- `src/pages/client/ClientPurse.tsx`

Routes:
- `/client` - Dashboard (upcoming appointments)
- `/client/appointments` - Appointment history
- `/client/profile` - Profile management
- `/client/purse` - Wallet/credits balance

### 7.2 Client Components
**New files:**
- `src/components/client/ClientHeader.tsx`
- `src/components/client/ClientNav.tsx`
- `src/components/client/UpcomingAppointmentCard.tsx`
- `src/components/client/PastAppointmentCard.tsx`

Features:
- View upcoming appointments
- Cancel/reschedule requests
- Booking history
- Purse balance
- Profile management with phone country selector

---

## Phase 8: BackOffice Platform (`/backoffice`)

### 8.1 BackOffice Layout & Pages
**New files:**
- `src/pages/backoffice/BackOfficeLayout.tsx`
- `src/pages/backoffice/BackOfficeDashboard.tsx`
- `src/pages/backoffice/TenantsPage.tsx`
- `src/pages/backoffice/WaitlistPage.tsx`
- `src/pages/backoffice/FeatureFlagsPage.tsx`
- `src/pages/backoffice/AuditLogsPage.tsx`
- `src/pages/backoffice/ImpersonatePage.tsx`

Routes:
- `/backoffice` - Dashboard
- `/backoffice/tenants` - Tenant management
- `/backoffice/waitlist` - Waitlist management
- `/backoffice/features` - Feature flags
- `/backoffice/audit` - Audit logs (all tenants)
- `/backoffice/impersonate` - View-only impersonation

### 8.2 BackOffice Components
**New files:**
- `src/components/backoffice/BackOfficeSidebar.tsx`
- `src/components/backoffice/TenantCard.tsx`
- `src/components/backoffice/WaitlistCard.tsx`
- `src/components/backoffice/FeatureFlagToggle.tsx`
- `src/components/backoffice/ImpersonationBanner.tsx`

Features:
- Tenant list with search/filter
- Waitlist approval workflow
- Send invitation links
- Feature flag management per tenant
- View-only impersonation for troubleshooting
- Audit log viewer (cross-tenant)

### 8.3 Admin Route Guard
**New file: `src/components/auth/AdminRoute.tsx`**

Protects BackOffice routes, checking for admin role.

---

## Phase 9: Landing Page & Marketing

### 9.1 Marketing Pages
**New files:**
- `src/pages/marketing/LandingPage.tsx`
- `src/pages/marketing/PricingPage.tsx`
- `src/pages/marketing/FeaturesPage.tsx`
- `src/pages/marketing/AboutPage.tsx`

### 9.2 Marketing Components
**New files:**
- `src/components/marketing/MarketingHeader.tsx`
- `src/components/marketing/MarketingFooter.tsx`
- `src/components/marketing/Hero.tsx`
- `src/components/marketing/Features.tsx`
- `src/components/marketing/Pricing.tsx`
- `src/components/marketing/Testimonials.tsx`
- `src/components/marketing/CTA.tsx`

Routes:
- `/` - Landing page (when not logged in)
- `/pricing` - Pricing plans
- `/features` - Feature overview
- `/about` - About us

### 9.3 Waitlist Experience
**New files:**
- `src/pages/marketing/WaitlistPage.tsx`
- `src/components/marketing/WaitlistForm.tsx`
- `src/pages/marketing/WaitlistSuccessPage.tsx`

Routes:
- `/waitlist` - Join waitlist form
- `/waitlist/success` - Confirmation page

Features:
- Email/phone collection with country selector
- Salon name (optional)
- Country selection
- Success confirmation with position

---

## Phase 10: Final Routing & Polish

### 10.1 App.tsx Updates
**Modify: `src/App.tsx`**

Comprehensive route configuration:
- `/` - Landing page (if not authenticated) OR redirect to `/salon` (if authenticated)
- `/waitlist` - Waitlist form
- `/b/:slug/*` - Booking platform routes
- `/client/*` - Client portal (protected)
- `/backoffice/*` - BackOffice (protected, admin only)

---

## Technical Specifications

### Design System Compliance
- Font: Questrial (already configured)
- Primary: #2563EB
- No gradients, no glow effects
- Limited border radius (0.5rem, 0.75rem)
- Minimalist, iOS-grade aesthetic

### Component Patterns
- All forms use Zod validation
- Loading states with Skeleton components
- Error boundaries for each module
- Consistent empty states
- Responsive design (mobile-first)

### Phone Input Standards
- Country flag selector on all phone inputs
- E.164 format output
- Searchable country list
- Priority countries at top of list

---

## File Summary

### New Files: ~75+

| Category | Count | Examples |
|----------|-------|----------|
| Phone Input | 3 | `countries.ts`, `phone-input.tsx`, `AuthPhoneInput.tsx` |
| Auth | 1 | `ResetPasswordPage.tsx` |
| Onboarding | 7 | `RoleStep.tsx`, `PlanStep.tsx`, `LocationsStep.tsx`, etc. |
| Session | 1 | `InactivityGuard.tsx` |
| Appointments | 3 | `AppointmentCard.tsx`, `AppointmentActions.tsx`, etc. |
| Calendar | 4 | `CalendarPage.tsx`, `DayView.tsx`, `WeekView.tsx`, etc. |
| Customers | 2 | `CustomerDetailDrawer.tsx`, `CustomerHistory.tsx` |
| Services | 2 | `ServiceDetailDrawer.tsx`, `PackageBuilder.tsx` |
| Payments | 3 | `PaymentsPage.tsx`, `TransactionList.tsx`, `RefundDialog.tsx` |
| Reports | 4 | `ReportsPage.tsx`, `RevenueChart.tsx`, etc. |
| Messaging | 3 | `MessagingPage.tsx`, `CreditBalance.tsx`, `MessageTemplates.tsx` |
| Journal | 3 | `JournalPage.tsx`, `AuditLogTable.tsx`, `ActivityTimeline.tsx` |
| Staff | 4 | `StaffPage.tsx`, `StaffCard.tsx`, `InviteStaffDialog.tsx`, etc. |
| Booking | 14 | All booking pages and components |
| Client | 9 | All client portal pages and components |
| BackOffice | 12 | All backoffice pages and components |
| Marketing | 12 | All marketing pages and components |

### Modified Files: ~10

- `src/App.tsx` (routing updates)
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/SignupPage.tsx`
- `src/pages/auth/ForgotPasswordPage.tsx`
- `src/pages/onboarding/OnboardingPage.tsx`
- `src/pages/salon/SalonDashboard.tsx`
- `src/pages/salon/AppointmentsPage.tsx`
- `src/pages/salon/CustomersPage.tsx`
- `src/pages/salon/ServicesPage.tsx`
- `src/pages/salon/SettingsPage.tsx`
- `src/components/layout/SalonSidebar.tsx`

---

## Implementation Order

1. **Phase 1**: Phone Input Component (foundation for all subsequent work)
2. **Phase 2**: Authentication Enhancements (login, signup, forgot/reset password)
3. **Phase 3**: Onboarding Overhaul (7-step flow)
4. **Phase 4**: Session Management (inactivity guard)
5. **Phase 5**: Salon Modules (Dashboard through Settings)
6. **Phase 6**: Public Booking (`/b/:slug`)
7. **Phase 7**: Client Portal (`/client`)
8. **Phase 8**: BackOffice (`/backoffice`)
9. **Phase 9**: Landing Page & Waitlist
10. **Phase 10**: Route Cleanup & Testing

This consolidated plan ensures all UI work is completed systematically, with the phone input enhancement serving as the foundation that gets reused throughout all subsequent phases.
