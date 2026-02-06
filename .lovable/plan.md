

# Platform Completion & Migration Preparation Plan

## Overview

This plan outlines a structured approach to complete the SalonMagik platform development, close all identified gaps and security issues, and then prepare for migration to a Vercel + Supabase architecture with subdomain-based session isolation.

---

## Phase 1: Security Hardening (Critical)

Three active security findings need immediate attention before any migration:

### 1.1 Fix `profiles` Table Public Exposure
**Issue**: User personal information (names, phone numbers, avatar URLs) could be accessed by anonymous users.

**Solution**:
- Add RLS policies to restrict profile access to:
  - The profile owner (`user_id = auth.uid()`)
  - Authenticated users within the same tenant (for staff directory purposes)

### 1.2 Fix `appointments` Table Public Exposure  
**Issue**: Customer booking history, payment details, and personal notes are visible to anonymous users through the availability check policy.

**Solution**:
- Create a separate, minimal view or policy for anonymous availability checking that only exposes time slots
- Restrict full appointment data to authenticated tenant members and the customer themselves

### 1.3 Strengthen `notifications` Tenant Isolation
**Issue**: Potential cross-tenant notification leakage if policies aren't correctly enforced.

**Solution**:
- Audit and update notification policies to ensure strict tenant isolation using `get_user_tenant_ids()` function

---

## Phase 2: Platform Gap Closure

### 2.1 Salon Admin Platform (Priority: High)

| Gap | Description | Status |
|-----|-------------|--------|
| Staff Online Count | `useSalonsOverview.tsx` uses random placeholder for `staffOnline` | ✅ **DONE** - Real session tracking with `staff_sessions` table |
| Real-time Updates | No realtime subscriptions for live dashboard updates | ✅ **DONE** - Realtime subscription added |

### 2.2 Client Portal (Priority: High)

| Gap | Description | Status |
|-----|-------------|--------|
| Phone OTP Login | Shows "coming soon" message for phone-based login | ⏳ Needs SMS provider (Twilio/Africa's Talking) |
| Password Step | Password authentication step exists in UI but not fully wired | ✅ **DONE** - Flow updated |

### 2.3 BackOffice Platform (Priority: High)

| Gap | Description | Status |
|-----|-------------|--------|
| 2FA Setup | QR code and TOTP verification implemented | ✅ **DONE** |
| Impersonation Viewing | Session recording works but no actual salon view mode | ✅ **DONE** - ImpersonationProvider + Banner added |

### 2.4 Public Booking Platform (Priority: Medium)

| Gap | Description | Status |
|-----|-------------|--------|
| Subdomain Slug Resolution | Currently uses `/b/:slug` path routing | Will become subdomain-based post-migration |

---

## Phase 3: Post-Launch Features Audit

The following features are documented in `usePostLaunchFeatures.tsx` as placeholder stubs:

| Feature | Description | Priority | Status |
|---------|-------------|----------|--------|
| OTP Verification for Service Start | Customer receives OTP when service starts (Studio/Chain plans) | Medium | Placeholder |
| Tips System | Tip entry after service completion with 48-hour window | Medium | Placeholder |
| Customer Reviews | Rating/review submission with moderation | Medium | Placeholder |
| Buffer Time Flow | "On My Way" / "Running Late" customer notifications | Low | Placeholder |
| Invoice Generation | PDF/HTML invoices with email sending | High | ✅ **DONE** - `useInvoices` hook |
| Service Change During Appointment | Proposal and approval flow for service modifications | Medium | Placeholder |
| Communication Credits Purchase | Credit top-up payment flow | High | ✅ **DONE** - `useCreditPurchase` + UI |
| Trial Enforcement | Trial countdown, card collection, access restriction | High | ✅ **DONE** - `useTrialEnforcement` + Banner |

---

## Phase 4: Code Cleanup

### 4.1 Remove Duplicate Route ✅ DONE
In `App.tsx`, duplicate route definitions have been removed.

### 4.2 Clean Up Placeholder Page ✅ DONE
`PlaceholderPages.tsx` has been removed.

---

## Phase 5: Create Migration Documentation

Create a comprehensive markdown file documenting the Vercel + Supabase migration plan for future reference.

**File to create**: `docs/MIGRATION_GUIDE.md`

**Contents**:
1. Architecture overview (subdomain mapping)
2. Supabase project setup instructions
3. Database migration steps
4. Edge function deployment
5. Storage bucket configuration
6. Auth configuration (redirect URLs, providers)
7. Secrets management
8. Vercel deployment guide
9. DNS configuration
10. Session isolation implementation
11. Testing checklist

---

## Phase 6: Monorepo Restructure Preparation

Before migration, prepare the codebase for monorepo structure:

### 6.1 Identify Shared Code
| Package | Contents |
|---------|----------|
| `packages/ui` | All shadcn components from `src/components/ui/` |
| `packages/supabase-client` | Types, client configuration, shared hooks |
| `packages/shared` | Utilities (`lib/utils.ts`, `lib/currency.ts`, `lib/countries.ts`), common hooks |

### 6.2 Identify Platform-Specific Code
| App | Routes | Key Components |
|-----|--------|----------------|
| `apps/backoffice` | `/backoffice/*` | BackofficeLayout, BackofficeAuth |
| `apps/salon-admin` | `/salon/*` | SalonSidebar, all salon pages |
| `apps/client-portal` | `/client/*` | ClientSidebar, all client pages |
| `apps/public-booking` | `[slug].domain.com` | BookingWizard, CatalogView |
| `apps/marketing` | `/`, `/pricing`, `/terms`, etc. | Landing components |

### 6.3 Session Isolation Strategy
Each app will have a unique `storageKey` in the Supabase client configuration:

```text
BackOffice:     sb-salonmagik-backoffice-auth
Salon Admin:    sb-salonmagik-salon-auth
Client Portal:  sb-salonmagik-client-auth
Public Booking: (no persistent auth)
Marketing:      (no auth)
```

---

## Implementation Order

```text
Week 1: Security
├── Fix profiles table RLS
├── Fix appointments table exposure
└── Strengthen notifications isolation

Week 2: Platform Gaps
├── Implement staff online tracking
├── Complete client portal auth flow
└── Clean up duplicate routes

Week 3: Critical Features
├── Invoice generation
├── Communication credits purchase
└── Trial enforcement

Week 4: Migration Preparation
├── Create migration documentation
├── Plan monorepo structure
└── Test session isolation locally
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/MIGRATION_GUIDE.md` | Create | Complete Vercel + Supabase migration guide |
| `supabase/migrations/[timestamp]_fix_security.sql` | Create | RLS policy fixes for profiles, appointments, notifications |
| `src/App.tsx` | Modify | Remove duplicate routes |
| `src/pages/salon/PlaceholderPages.tsx` | Delete | No longer needed |
| `src/hooks/useSalonsOverview.tsx` | Modify | Replace placeholder staff count with real data |

---

## Notes

- The migration to Vercel + Supabase will require a new Supabase project (Lovable Cloud is not accessible externally)
- DNS propagation may take up to 72 hours after configuration
- Consider using a monorepo tool like Turborepo for efficient builds across apps
- All existing Edge Functions will need redeployment via Supabase CLI

