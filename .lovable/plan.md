
# Client Portal Implementation Plan

## Overview

This plan implements the complete Client Portal (`/client/*`) platform as specified in the PRD, providing customers with self-service access to their bookings, purse management, refund handling, and profile management.

---

## Current State Analysis

| Component | Status | Reusable? |
|-----------|--------|-----------|
| `customers.user_id` column | Exists | Yes - links customers to auth.users |
| `InactivityGuard` | Exists | Yes - accepts configurable timers |
| `useCustomerPurse` | Exists | Partially - needs client-context version |
| `useAppointments` | Exists | Partially - tenant-scoped, needs customer-scoped version |
| OTP login flow | Exists | Yes - already in LoginPage.tsx |
| Phone input component | Exists | Yes - AuthPhoneInput |
| SalonSidebar layout | Exists | Pattern reusable for ClientSidebar |
| Notification system | Exists | Needs customer-scoped version |
| RLS policies | Tenant-based | Need customer-self-access policies |

---

## Architecture Decisions

### 1. Separate Auth Context for Clients

The current `useAuth` hook is tenant/salon-focused. For the Client Portal, we need a separate `useClientAuth` context that:
- Identifies the logged-in user as a customer across multiple tenants
- Fetches all `customers` records where `user_id = auth.uid()`
- Does NOT require tenant selection (customer sees all their salon relationships)

### 2. OTP-First Authentication

Per PRD requirements (no Google OAuth for clients):
- Primary: OTP via email or phone
- Password optional: only prompted if account has password set
- Single field entry for email/phone detection

### 3. Database Access Strategy

Customers need RLS policies to access their own data across tenants:
- Read their own `customers` records (via `user_id`)
- Read their own `appointments`, `transactions`, `refund_requests`
- Read `customer_purses` for their customer IDs
- NO access to other customers' data or tenant admin data

---

## Database Schema Changes

### 1. New RLS Policies for Customer Self-Access

```sql
-- Customers can read their own customer records across all tenants
CREATE POLICY "Customers can read own customer records"
ON customers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Customers can read their own appointments
CREATE POLICY "Customers can read own appointments"
ON appointments FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- Customers can read their own purses
CREATE POLICY "Customers can read own purses"
ON customer_purses FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- Customers can read their own transactions
CREATE POLICY "Customers can read own transactions"
ON transactions FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- Customers can read their own refund requests
CREATE POLICY "Customers can read own refund requests"
ON refund_requests FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- Customers can read notifications targeted at them
CREATE POLICY "Customers can read own notifications"
ON notifications FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);
```

### 2. Customer Profiles Table (for OTP-only users)

Since customers may not have a `profiles` entry (OTP-only users), we need to handle this gracefully or create customer profiles on first login.

---

## File Structure

```text
src/
├── pages/
│   └── client/
│       ├── ClientLoginPage.tsx       # OTP-first login
│       ├── ClientDashboard.tsx       # Landing after login
│       ├── ClientBookingsPage.tsx    # Upcoming/Completed/Cancelled
│       ├── ClientBookingDetailPage.tsx # Single booking with actions
│       ├── ClientHistoryPage.tsx     # All past transactions/bookings
│       ├── ClientRefundsPage.tsx     # Refund requests & credits
│       ├── ClientNotificationsPage.tsx
│       ├── ClientProfilePage.tsx     # Profile & Security
│       └── ClientHelpPage.tsx
│
├── components/
│   └── client/
│       ├── ClientSidebar.tsx         # Layout wrapper with sidebar
│       ├── ClientInactivityGuard.tsx # 25/30 min timers
│       ├── BookingCard.tsx           # Booking summary card
│       ├── BookingActions.tsx        # On My Way, Running Late, etc.
│       ├── PurseCard.tsx             # Balance display
│       ├── PurseAuthGate.tsx         # OTP/password gate for purse use
│       ├── OutstandingFeesAlert.tsx  # Outstanding fees banner
│       └── ApprovalActionCard.tsx    # Buffer/refund approval UI
│
├── hooks/
│   └── client/
│       ├── useClientAuth.tsx         # Customer-focused auth context
│       ├── useClientBookings.tsx     # Customer's appointments
│       ├── useClientPurse.tsx        # Customer's purse across salons
│       ├── useClientNotifications.tsx
│       └── useClientProfile.tsx
```

---

## Implementation Phases

### Phase 1: Database & Auth Infrastructure

1. **Create RLS policies** for customer self-access
2. **Create `useClientAuth` context** that:
   - Authenticates via OTP (email/phone)
   - Fetches customer records linked to `auth.uid()`
   - Checks if password is set for optional password prompt
3. **Create `ClientProtectedRoute`** component
4. **Create `ClientInactivityGuard`** with 25/30 minute timers

### Phase 2: Client Login Experience

1. **ClientLoginPage.tsx**:
   - Single input field (auto-detect email vs phone)
   - Send OTP to email or phone
   - After OTP success, check if password exists:
     - If yes: prompt for password
     - If no: complete login
   - No Google OAuth button

2. **Password detection edge function**:
   - `check-customer-auth-method`: Returns whether user has password set

### Phase 3: Layout & Navigation

1. **ClientSidebar.tsx**:
   - Dashboard, Bookings, History, Refunds & Credits, Notifications, Profile & Security, Help, Logout
   - Mobile drawer overlay, desktop collapsible
   - Wrap with `ClientInactivityGuard`

2. **Update App.tsx routing**:
   - Add `/client/*` routes with `ClientProtectedRoute`

### Phase 4: Dashboard

1. **ClientDashboard.tsx** cards:
   - Next upcoming appointment
   - Outstanding fees (with "Pay now" if any)
   - Purse balance per salon
   - Gifted services/products
   - Notifications preview (unread count)
   - Quick actions: "Book again", "View bookings", "Add purse funds"

### Phase 5: Bookings Module

1. **ClientBookingsPage.tsx**:
   - Tabs: Upcoming, Completed, Cancelled
   - List of `BookingCard` components
   - Each card shows: status, services, date/time, location, payment state

2. **ClientBookingDetailPage.tsx**:
   - Full booking details
   - **Actions** (state-dependent):
     - "On My Way" (once per booking, before start)
     - "Running Late" (select delay, suggest reschedule if ≥30 min)
     - "Reschedule" (before start, applies deposit rules)
     - "Cancel" (before start, applies cancellation rules)
   - **Approval Actions**:
     - Buffer request: Accept / Suggest reschedule
     - Service change: Approve / Reject
     - Refund proposal: Approve / Reject
   - **Pay Outstanding** button if fees exist
   - **Purse Toggle** with auth gate

3. **Hooks**:
   - `useClientBookings`: Fetch appointments where `customer_id.user_id = auth.uid()`
   - `useClientBookingActions`: On My Way, Running Late, Reschedule, Cancel

### Phase 6: Purse & Payments

1. **useClientPurse.tsx**:
   - Fetch all `customer_purses` for customer IDs owned by user
   - Display balance per salon
   - Transaction history (topups, redemptions, credits)

2. **PurseAuthGate.tsx**:
   - When purse is toggled for payment, require OTP or password confirmation
   - Prevents unauthorized purse usage

3. **Payment flow integration**:
   - Deposit / Full / Pay-at-salon options
   - Purse applied first if toggled
   - Remainder via online payment or pay-at-salon

### Phase 7: Refunds & Credits

1. **ClientRefundsPage.tsx**:
   - List of refund requests with status
   - Ability to request refund on eligible transactions
   - "Mark as received" for offline refunds
   - Store credit appears in purse immediately

### Phase 8: Notifications

1. **ClientNotificationsPage.tsx**:
   - Types: booking confirmations, reschedules, buffer requests, service changes, refunds, gifts, system
   - Inbox with read/unread
   - Deep links to relevant booking/action

2. **useClientNotifications.tsx**:
   - Subscribe to realtime notifications for `user_id = auth.uid()`

### Phase 9: Profile & Security

1. **ClientProfilePage.tsx**:
   - View/edit: name, email, phone
   - Phone/email edit requires OTP verification
   - Optional password add/change
   - Logout all sessions
   - Communication preferences (email/SMS/WhatsApp)

---

## Key Components Detail

### ClientSidebar Navigation Items

| Label | Icon | Path | Description |
|-------|------|------|-------------|
| Dashboard | LayoutDashboard | /client | Landing page |
| Bookings | Calendar | /client/bookings | Upcoming/Completed/Cancelled |
| History | Clock | /client/history | All transactions |
| Refunds & Credits | RefreshCcw | /client/refunds | Refund requests |
| Notifications | Bell | /client/notifications | Inbox |
| Profile & Security | User | /client/profile | Edit profile |
| Help & Support | HelpCircle | /client/help | Support |
| Sign out | LogOut | - | Logout action |

### Booking Actions State Machine

```text
┌─────────────────────────────────────────────────────────┐
│                    SCHEDULED                            │
│                                                         │
│  Actions: On My Way, Running Late, Reschedule, Cancel   │
│  Approvals: Buffer Accept/Reject                        │
└────────────────────────┬────────────────────────────────┘
                         │ (Service starts)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    STARTED                              │
│                                                         │
│  Actions: None (customer waits)                         │
│  Approvals: Service Change Approve/Reject               │
└────────────────────────┬────────────────────────────────┘
                         │ (Service ends)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   COMPLETED                             │
│                                                         │
│  Actions: Tip (48h window), Review                      │
│  Approvals: Refund/Store-credit Approve/Reject          │
└─────────────────────────────────────────────────────────┘
```

---

## Security Considerations

1. **No Google OAuth** - PRD constraint enforced
2. **OTP verification** required for:
   - Login
   - Phone/email changes
   - Purse usage
3. **Inactivity timers** - 25 min warning, 30 min logout
4. **RLS policies** - customers only see their own data
5. **Audit logging** - all payment/refund actions logged
6. **No card data storage** - tokens only via providers

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/client/useClientAuth.tsx` | Customer auth context |
| `src/hooks/client/useClientBookings.tsx` | Customer appointments hook |
| `src/hooks/client/useClientPurse.tsx` | Customer purse hook |
| `src/hooks/client/useClientNotifications.tsx` | Customer notifications |
| `src/hooks/client/useClientProfile.tsx` | Profile management |
| `src/components/client/ClientSidebar.tsx` | Layout with navigation |
| `src/components/client/ClientInactivityGuard.tsx` | 25/30 min timers |
| `src/components/client/ClientProtectedRoute.tsx` | Auth guard |
| `src/components/client/BookingCard.tsx` | Booking summary |
| `src/components/client/BookingActions.tsx` | Action buttons |
| `src/components/client/PurseCard.tsx` | Balance display |
| `src/components/client/PurseAuthGate.tsx` | Auth gate for purse |
| `src/components/client/OutstandingFeesAlert.tsx` | Fees banner |
| `src/pages/client/ClientLoginPage.tsx` | OTP-first login |
| `src/pages/client/ClientDashboard.tsx` | Dashboard |
| `src/pages/client/ClientBookingsPage.tsx` | Bookings list |
| `src/pages/client/ClientBookingDetailPage.tsx` | Booking detail |
| `src/pages/client/ClientHistoryPage.tsx` | Transaction history |
| `src/pages/client/ClientRefundsPage.tsx` | Refunds & credits |
| `src/pages/client/ClientNotificationsPage.tsx` | Notifications |
| `src/pages/client/ClientProfilePage.tsx` | Profile & security |
| `src/pages/client/ClientHelpPage.tsx` | Help page |
| `supabase/functions/check-customer-auth-method/index.ts` | Password detection |

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/client/*` routes |
| `supabase/migrations/xxx.sql` | Add customer-self-access RLS policies |

---

## Technical Notes

### OTP-First Login Flow

```text
1. User enters email or phone
2. System detects type (email pattern vs phone pattern)
3. Send OTP via appropriate channel
4. User enters 6-digit code
5. Verify OTP
6. Check if user has password set:
   a. If no password → Login complete
   b. If password exists → Prompt for password → Verify → Login complete
```

### Customer-to-User Linking

The `customers.user_id` column links salon customers to Supabase auth users. A single auth user can be a customer at multiple salons (multiple `customers` records with same `user_id`).

### Purse Per Salon

Each `customer_purses` record is per-tenant (salon). A customer viewing their purse sees all balances across salons where they have accounts.

---

## Summary

This implementation creates a complete self-service Client Portal with:
- OTP-first authentication (no Google OAuth per PRD)
- Full booking management with state-appropriate actions
- Purse/store credit management with auth gate
- Refund request and approval handling
- Real-time notifications
- Profile and security management
- 25/30 minute inactivity protection
- Mobile-responsive design matching the Salon platform patterns
