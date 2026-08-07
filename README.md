# Salon Magik Hub

> Multi-tenant SaaS platform for salon and beauty business management, serving West Africa (Nigeria and Ghana). Handles online booking, appointment operations, customer management, staff, payments, messaging, and billing — across five web apps backed by Supabase + Deno Edge Functions.

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Platforms & Apps](#platforms--apps)
   - [Salon Admin](#1-salon-admin-appsalonmagikcom)
   - [Public Booking](#2-public-booking-slugsalonmagikcom)
   - [Client Portal](#3-client-portal-bookingssalonmagikcom)
   - [Backoffice](#4-backoffice-backofficesalonmagikcom)
   - [Marketing Site](#5-marketing-site-salonmagikcom)
3. [Backend Architecture](#backend-architecture)
4. [Database Schema Highlights](#database-schema-highlights)
5. [Edge Functions](#edge-functions)
6. [External Integrations](#external-integrations)
7. [Billing & Plans](#billing--plans)
8. [Permissions & Roles](#permissions--roles)
9. [Multi-Tenancy & Locations](#multi-tenancy--locations)
10. [Developer Setup](#developer-setup)
11. [Environment Variables](#environment-variables)
12. [Deployment](#deployment)
    - [Infrastructure](#infrastructure)
    - [Branch Model](#branch-model)
    - [Deployment Pipeline](#deployment-pipeline)
    - [Rules for the prod Branch](#rules-for-the-prod-branch)
    - [Triggering a Production Deploy](#triggering-a-production-deploy)
    - [Hotfix Process](#hotfix-process)

---

## Product Overview

Salon Magik is a B2B SaaS product for salons, spas, and beauty studios. Each customer (a **tenant**) gets their own workspace with:

- A branded public booking page where their clients can self-book services and products
- A management app for owners, managers, and staff to run day-to-day operations
- A client portal for clients to view bookings, history, notifications, and refunds
- Automated email and SMS notifications across the booking lifecycle

The platform is multi-currency (NGN for Nigeria, GHS for Ghana) and multi-location (single salon up to multi-branch chains).

---

## Platforms & Apps

### 1. Salon Admin (`app.salonmagik.com`)

The primary operator-facing application. Owners, managers, supervisors, receptionists, and staff use it to run their business.

#### Authentication
- Email/password signup and login with email verification
- Password reset and in-app forced password change
- Invitation-based staff onboarding (staff receive email links, complete signup in-app)
- Role-based access: `owner`, `manager`, `supervisor`, `receptionist`, `staff`
- Multi-salon switching (users can belong to multiple tenants)

#### Onboarding
- Guided setup wizard for new tenants: business name, currency, country, timezone, slug
- First-run configuration of services, locations, and staff

#### Dashboard
- Revenue summary (today, this week, this month)
- Upcoming appointments at a glance
- Trial countdown and upgrade CTA (see Billing)
- Quick-action shortcuts

#### Appointments
- Calendar view (day/week) showing all bookings by staff member
- List view with filters (status, date range, staff, service)
- Appointment detail: services, products, client, staff, payment status
- Appointment status lifecycle: `scheduled → started → paused → completed → cancelled / rescheduled`
- Approval-gated bookings: owner/manager must approve before a booking is confirmed; client is notified
- Manual appointment creation and rescheduling

#### Services & Products (Catalog)
- Service management: name, duration, price, category, image, assigned staff, active/inactive/archived
- Product management: name, price, description, image, stock tracking
- Catalog integrity checks: validation issues surfaced per item (e.g. service with no assigned staff)
- Bulk import via CSV
- Category management

#### Staff
- Add, edit, and deactivate staff
- Assign roles and locations
- View staff performance on schedule

#### Customers
- Customer list with search and filters
- Customer detail dialog: full booking history, spend, messaging context
- Inactive customer identification (days since last transaction configurable)
- Customer purse balance (store credit wallet)

#### Calendar
- Full-month/week/day calendar view
- Staff column layout

#### Payments & Journal
- Transaction log per appointment/invoice
- Invoice generation and payment link sharing
- Pay-at-salon flow: mark appointments as paid on-site
- Deposit collection at booking time (configurable percentage)
- Customer purse (store credit): top-up via Paystack, debit against invoices/bookings
- Salon wallet: tracks incoming and outgoing funds
- Payouts / withdrawals to bank accounts and mobile money

#### Reports
- Revenue by period, service, staff, location
- Appointment volume and cancellation rates

#### Messaging
Multi-step broadcast wizard:

**Channels**
- **Email** — powered by Resend; HTML templates with variable interpolation
- **SMS** — Arkesel, both Nigeria and Ghana (WhatsApp channel exists in backend but is hidden on prod)

**Audiences**
- All customers
- Inactive customers (configurable inactivity threshold)
- Custom segment (manual selection)
- Reactivation campaigns

**Features**
- Template library (email and SMS) with live preview and variable substitution (`{{customer_name}}`, `{{salon_name}}`, etc.)
- Per-template editor with subject (email) and body
- Message history with delivery status
- Credit balance and top-up for SMS
- Sender name management: request and track approval status (provider-side approval is async)

#### Email Templates
- Separate page for managing transactional email templates used in automated notifications

#### Settings
- **Business settings**: name, logo, brand colour, social links
- **Booking settings**: slug, online booking toggle, deposit rules, cancellation grace period, auto-confirm, staff selection rules, contact display
- **Subscription & billing**: current plan, trial status, upgrade to paid (Paystack checkout)
- **Booking theme**: ecommerce theme preview and configuration (`booking_page_bio`, banner images)
- **Branch settings**: per-location hours, capacity, buffer minutes

#### Audit Log
- Immutable event log of all sensitive actions (plan changes, permission changes, payment events, etc.)

---

### 2. Public Booking (`[slug].salonmagik.com`)

The client-facing booking storefront. Accessible without login. Each tenant gets their own subdomain.

#### Storefront / Catalog View
- Salon header: name, logo, banner carousel, `booking_page_bio` tagline, brand colour
- Service and product catalog with category navigation
- Item cards with images, pricing, duration, and add-to-cart
- Two themes: **default** and **ecommerce** (unlockable addon)
- Location selector for multi-branch tenants
- Staff selection (optional, required, or auto-assigned — per tenant config)

#### Booking Wizard (multi-step)
1. **Catalog** — browse and add services/products to cart
2. **Cart** — review items, apply voucher/promo codes, toggle customer purse credit
3. **Scheduling** — select date/time slot; slots filtered by staff availability and buffer rules
4. **Booker info** — name, email, phone; email lookup to pre-fill returning clients
5. **Review** — full summary before confirm
6. **Payment** — Paystack inline checkout for deposit or full payment; pay-at-salon option if enabled
7. **Gift recipients** — add recipient info for gift packages (if applicable)

#### Features
- Approval-gated flow: booking may land in `pending_approval` state; client receives a "we'll confirm shortly" message
- Voucher/promo code redemption
- Customer purse credit toggle (use store credit towards booking)
- Payment status polling after Paystack redirect
- Country-context resolution (NGN or GHS) for currency display

---

### 3. Client Portal (`bookings.salonmagik.com`)

Authenticated portal for clients to self-serve their relationship with their salon.

#### Authentication
- OTP-based login (email OTP, no password required)
- Account completion flow for new clients (set name, phone)
- Inactivity guard (auto-logout after idle)

#### Features
- **Dashboard**: upcoming bookings, recent activity summary
- **Bookings**: all upcoming and past bookings with status badges; cancel/reschedule actions
- **Booking detail**: full breakdown — services, staff, payment, receipt
- **Transaction history**: all payments across salons
- **Refunds**: view pending and completed refunds; request refund on eligible bookings
- **Purse**: store credit balance, top-up via Paystack, transaction history
- **Notifications**: in-app notification inbox (appointment reminders, confirmations, cancellations)
- **Profile**: update name, email, phone
- **Help**: submit support tickets

---

### 4. Backoffice (`backoffice.salonmagik.com`)

Internal control panel for the Salon Magik operations and support team.

#### Authentication & Security
- Email/password login (separate from tenant auth)
- Mandatory TOTP 2FA for all backoffice users
- Step-up challenge for sensitive actions (re-verify TOTP before proceeding)
- Inactivity auto-logout
- Forced password change on first login or after reset
- Role system: `super_admin`, `admin`, `support_agent`
- Fine-grained permission keys assignable per role template

#### Dashboard
- Platform-wide KPI summary

#### Customers
- **Waitlists** — view market interest submissions; invite or reject applicants; manage waitlist status per country
- **Tenants** — full tenant list; search by name/email/slug; per-tenant detail with plan, subscription status, billing history, unlock requests, staff count; approve chain-unlock requests; upgrade/downgrade plan; impersonate
- **Ops Monitor** — track setup completeness, import jobs, and reactivation campaign health per tenant

#### Plans
- Define and edit plans (Solo, Studio, Chain)
- Per-plan feature limits (max staff, locations, services, products, monthly messages)
- Per-currency pricing rows (NGN, GHS, USD) with monthly and annual amounts
- Paystack PLN code management: per-country (Nigeria NGN / Ghana GHS) masked monthly and annual codes, per-row save with audit log, permission-gated
- Chain location tier pricing (additional-location incremental pricing)
- Plan change notifications to tenants (roll out with a scheduled batch)

#### Feature Flags
- Platform-wide and per-tenant feature toggles
- Schedule enable/disable windows
- Scope: `platform`, `app`, `tenant`, `feature`
- Marketing toggles: waitlist enabled, other-countries interest enabled

#### Comms
- View and edit platform-owned message templates (`platform_message_templates`)
- Templates cover email and SMS; grouped by category
- Subject, body, variables, and active/inactive toggle

#### Sales Ops
- **Campaigns** — create and activate promo/discount campaigns with promo codes
- **Capture Client** — generate promo codes for individual prospects (sales agent tool)
- **Conversions** — view promo code redemptions; track sales agent commission entries
- **Agents & KYC** — manage sales agent profiles and KYC workflows

#### Admins
- Manage backoffice user accounts
- Create role templates (named sets of permissions + accessible pages)
- Assign role templates to admins
- Activate/deactivate accounts

#### Audit Logs
- Full platform audit trail across all tenants and backoffice actions

#### Impersonation
- Log in as a tenant user (with audit trail) for support purposes

---

### 5. Marketing Site (`salonmagik.com`)

Public marketing and acquisition site.

- **Landing page**: hero, features section, business types, benefits, CTA, waitlist capture
- **Pricing page**: plan comparison with NGN/GHS pricing, feature grid
- **Waitlist**: country-aware sign-up form; controlled by `waitlist_enabled` feature flag
- **Country launch strip**: shows which markets are live
- **Legal**: Privacy Policy, Terms of Service, Support pages
- CTA routing: "Log In" → salon admin app; "Get Started" → signup or waitlist depending on flag state

---

## Backend Architecture

- **Database**: Supabase (PostgreSQL 15) with Row Level Security on all tables
- **Auth**: Supabase Auth (JWT) — separate auth namespaces for tenant users, clients, and backoffice users
- **API layer**: Supabase PostgREST (auto-generated REST) + custom RPC functions
- **Server-side logic**: Deno Edge Functions (TypeScript) deployed to Supabase
- **File storage**: Supabase Storage (logos, banners, avatars)
- **Realtime**: Supabase Realtime for live notifications in the client portal
- **Frontend**: Vite + React + TypeScript, TanStack Query for server state, shadcn/ui + Tailwind CSS
- **Monorepo tooling**: pnpm workspaces + Turborepo
- **Shared packages**:
  - `packages/supabase-client` — typed Supabase client + generated types
  - `packages/ui` — shared component library (shadcn/ui based)
  - `packages/shared` — utilities and constants

---

## Database Schema Highlights

### Core Tables
| Table | Purpose |
|---|---|
| `tenants` | One row per salon; config, plan, subscription status, slug, billing fields |
| `user_roles` | Maps auth users to tenants with a role |
| `profiles` | User profile data (name, avatar, phone) |
| `locations` | Branch locations per tenant; hours, capacity, buffer settings |
| `services` | Service catalog items per tenant |
| `products` | Product catalog items per tenant |
| `appointments` | Booking records; links customer, staff, services/products, payment status |
| `customers` | Client records per tenant (normalised email/phone) |
| `transactions` | Payment events (Paystack webhooks write here) |
| `invoices` | Invoice records tied to appointments |
| `wallets` | Customer purse and salon wallet rows |
| `wallet_entries` | Ledger of all wallet movements |
| `withdrawal_requests` | Salon payout requests |
| `message_logs` | Every sent notification with provider and delivery status |
| `sms_templates` | Tenant-owned SMS template library |
| `email_templates` | Tenant-owned email template library |
| `platform_message_templates` | Platform-controlled templates editable from backoffice |
| `audit_logs` | Immutable audit trail |

### Plans & Billing
| Table | Purpose |
|---|---|
| `plans` | Plan definitions (`solo`, `studio`, `chain`) |
| `plan_limits` | Per-plan feature limits (staff, services, products, locations, messages) |
| `plan_pricing` | Per-plan, per-currency pricing; `paystack_plan_code_monthly` and `paystack_plan_code_annual` |
| `chain_location_pricing` | Incremental per-extra-location pricing tiers for Chain plan |
| `plan_change_notifications` | Queued notifications to tenants about plan updates |

### Backoffice
| Table | Purpose |
|---|---|
| `backoffice_users` | Backoffice team accounts |
| `backoffice_role_templates` | Named role templates with permission and page key arrays |
| `backoffice_user_role_assignments` | Assigns a role template to a backoffice user |
| `backoffice_permission_keys` | Registry of available fine-grained permission keys |
| `backoffice_page_keys` | Registry of accessible page routes per permission level |
| `backoffice_step_up_challenges` | TOTP re-verification tokens for sensitive actions |

### Feature Flags
| Table | Purpose |
|---|---|
| `feature_flags` | Platform feature toggles with scope, schedule, and per-tenant targeting |
| `feature_flag_master_toggles` | Marketing-level on/off toggles (waitlist, country interest) |

### Sales
| Table | Purpose |
|---|---|
| `sales_campaigns` | Promo campaign definitions |
| `sales_promo_codes` | Individual promo codes tied to campaigns |
| `sales_promo_uses` | Redemption records |
| `sales_agent_profiles` | Sales agent KYC and commission config |
| `sales_conversion_entries` | Commission ledger |

### Entitlements & Addons
| Table | Purpose |
|---|---|
| `tenant_addon_entitlements` | Active addon entitlements per tenant (ecommerce theme, extra staff seats) |
| `tenant_addon_quotes` | Addon purchase quotes/snapshots |
| `tenant_chain_unlock_requests` | Requests to unlock additional chain locations |

---

## Edge Functions

All functions live in `supabase/functions/`.

### Booking
| Function | Purpose |
|---|---|
| `create-public-booking` | Validates and creates a booking; enforces approval gates, deposit rules, slot capacity |
| `public-booking-email-lookup` | Pre-fills booker info for returning customers |
| `public-booking-prefill` | Returns saved booker details |
| `respond-booking-reschedule` | Handles client accept/decline of a reschedule proposal |
| `send-booking-approval-email` | Notifies client when booking is approved or declined |
| `send-appointment-notification` | Triggers email/SMS reminders |
| `refund-cancelled-appointment` | Processes refund to purse or original payment method |

### Payments
| Function | Purpose |
|---|---|
| `create-checkout-session` | Initialises a Paystack subscription transaction for billing upgrade |
| `create-payment-session` | Initialises a Paystack transaction for a booking deposit/full payment |
| `create-invoice-payment-session` | Payment link for a specific invoice |
| `payment-webhook-ng` | Nigeria Paystack webhook (charges, subscriptions) |
| `payment-webhook-gh` | Ghana Paystack webhook |
| `paystack-transfer-webhook` | Transfer (payout) webhook events |
| `process-salon-withdrawal` | Initiates a payout to bank/mobile money |
| `purchase-credits-from-purse` | Client purse top-up |
| `verify-bank-account` | Resolves a bank account name via Paystack |
| `get-banks-and-momo-providers` | Lists banks and mobile money providers per country |

### Messaging
| Function | Purpose |
|---|---|
| `send-manual-message` | Sends a single SMS or email to one customer (operator-triggered) |
| `send-bulk-message` | Broadcasts SMS or email to a customer segment |
| `send-reactivation-campaign` | Sends reactivation SMS/email to inactive customers |
| `send-daily-digest` | Daily appointment summary digest to salon owners |
| `manage-sms-sender-name` | Saves and manages the tenant's SMS sender name and approval status |

### Auth & Users
| Function | Purpose |
|---|---|
| `auth-check-otp-rate-limit` | Rate-limits OTP requests per identifier |
| `auth-resolve-identifier` | Resolves login identifier to auth method |
| `auth-set-client-password` | Sets a client portal password (OTP-confirmed) |
| `send-client-login-otp` | Sends OTP for passwordless client login |
| `send-password-reset` / `complete-password-reset` | Tenant user password reset flow |
| `complete-password-change` | In-app forced password change |
| `send-staff-invitation` | Emails a staff invite link |
| `verify-email` / `send-email-verification` | Email confirmation flow |
| `update-client-account` | Updates client profile fields |

### Backoffice
| Function | Purpose |
|---|---|
| `create-backoffice-admin` | Provisions a new backoffice user account |
| `backoffice-verify-step-up-totp` | Verifies a step-up TOTP challenge |
| `send-backoffice-password-reset` / `complete-backoffice-password-reset` | Backoffice password reset |
| `verify-backoffice-totp` | Verifies TOTP on backoffice login |

### Catalog & Operations
| Function | Purpose |
|---|---|
| `bulk-import-catalog` | Imports services/products from a CSV upload |
| `get-public-catalog-payload` | Returns the full public catalog for a tenant |
| `resolve-booking-country-context` | Determines NGN or GHS context for a booking |

### Sales & Marketing
| Function | Purpose |
|---|---|
| `send-sales-promo-email` | Sends a promo code email to a prospect |
| `submit-waitlist` / `send-waitlist-invitation` | Waitlist application and invite flow |
| `submit-market-interest` | Records non-waitlist market interest |
| `claim-sales-promo-code` | Redeems a promo code for a tenant |

---

## External Integrations

### Paystack
- **Two accounts**: Nigeria (`PAYSTACK_SECRET_KEY_NG`) and Ghana (`PAYSTACK_SECRET_KEY_GH`)
- **Subscriptions**: initialise a transaction with a `plan` (PLN code) — Paystack auto-creates a recurring subscription after first payment
- **One-off payments**: booking deposits, full payments, invoice links, purse top-ups
- **Payouts**: transfer API to bank accounts and mobile money
- **Webhooks**: `charge.success`, `subscription.create`, `transfer.success/failed`

### Resend
- Transactional email delivery for all tenant-facing and client-facing emails
- HTML templates via `_shared/email-template.ts` with consistent Salon Magik branding

### Arkesel (SMS — Nigeria & Ghana)
- Single and bulk SMS delivery for all tenants, both markets, via `_shared/arkesel-client.ts`
- Replaced Termii (Nigeria) and Txtconnect (Ghana) entirely — one account, one API key covers both
- See `docs/integrations/arkesel-migration.md` for the API contract and migration history

---

## Billing & Plans

### Plans
| Plan | Target | Key limits |
|---|---|---|
| **Solo** | Single-chair / independent operator | 1 location, limited staff |
| **Studio** | Small team salon | Multiple staff, single location |
| **Chain** | Multi-location business | Multiple locations (incremental pricing per extra location) |

### Billing Lifecycle
1. **Trial**: new tenants start a free trial (`trial_days` per plan, extendable by backoffice)
2. **Upgrade**: owner initiates Paystack checkout from Settings → Subscription; `create-checkout-session` initialises a subscription transaction using the plan's PLN code for their currency
3. **Subscription**: Paystack manages recurring billing; webhook updates `tenants.subscription_status`
4. **Suspension**: `past_due` or `canceled` status triggers a blocking `TrialBanner` modal
5. **Plan changes**: backoffice operator upgrades/downgrades via `upgrade_tenant_plan_and_log_billing` RPC; change notification queued for tenant

### Subscription Statuses
`trialing` | `active` | `past_due` | `canceled` | `paused` | `permanently_deactivated`

### Addons
- **Ecommerce theme** — unlocks the ecommerce storefront skin on public booking
- **Extra staff seats** — additional staff slots beyond the plan limit
- **Chain unlock** — additional locations for Chain plan tenants (incremental pricing)

---

## Permissions & Roles

### Tenant App Roles
`owner > manager > supervisor > receptionist > staff`

Access to pages is controlled by the `list_accessible_routes` RPC which evaluates the user's role against a page manifest.

### Backoffice Permissions System

Backoffice roles are fully custom-defined templates. Each template stores:
- **`pages`** — array of page keys the role can access
- **`permissions`** — array of fine-grained permission keys

**Available permission keys:**
| Key | Description |
|---|---|
| `customers.view_waitlists` | View waitlist applications |
| `customers.view_tenants` | View tenants and unlock requests |
| `customers.view_ops_monitor` | View setup/import monitoring |
| `plans.view` | View and manage plans |
| `plans.manage_paystack_codes` | View/edit Paystack PLN codes (sensitive) |
| `comms.view` | View and edit platform message templates |
| `settings.view` | View backoffice settings |
| `audit_logs.view` | View audit logs |
| `impersonation.view` | Use impersonation tools |
| `sales.manage_campaigns` | Create/edit/activate campaigns |
| `sales.capture_client` | Generate promo codes |
| `sales.view_conversions` | View redemptions and commissions |
| `sales.manage_agents_kyc` | Manage agents and KYC |
| `admins.manage` | Create roles, add admins, change access |

`super_admin` has all permissions unconditionally.

---

## Multi-Tenancy & Locations

- Every database row scoped to a tenant is protected by RLS using `user_roles` membership
- Salons can have 1–N **locations**, each with independent hours, capacity, and buffer minutes
- Staff can be assigned to one or more locations; catalog items can be restricted to specific branches
- Public booking resolves the correct location based on context and filters available slots per location
- Chain plan tenants can request additional locations; backoffice approves and grants the entitlement

---

## Developer Setup

### Prerequisites
- Node 20.x (`nvm use 20`)
- pnpm 10.x (`corepack enable && corepack prepare pnpm@10.29.1 --activate`)
- Supabase CLI
- Docker (required for local Supabase functions)

### Install
```sh
pnpm install
```

### Run apps
```sh
pnpm --filter salon-admin dev       # http://localhost:8080
pnpm --filter backoffice dev        # http://localhost:8081
pnpm --filter client-portal dev     # http://localhost:8082
pnpm --filter public-booking dev    # http://localhost:8083
pnpm --filter marketing dev         # http://localhost:5173
```

### Supabase
```sh
supabase db push                                                                      # apply pending migrations
supabase gen types --local > packages/supabase-client/src/supabase/types.ts          # regenerate TypeScript types
supabase functions deploy <name1> <name2>                                             # deploy selected functions
```

### Turbo scripts
```sh
pnpm dev      # run all apps in parallel
pnpm build    # build all apps
pnpm lint     # lint all
pnpm test     # run all test suites
```

---

## Environment Variables

### All apps
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |

### Salon Admin
| Variable | Description |
|---|---|
| `VITE_PUBLIC_BOOKING_BASE_DOMAIN` | Base domain for public booking subdomains |
| `VITE_MANAGE_BOOKINGS_URL` | Client portal base URL |

### Marketing
| Variable | Description |
|---|---|
| `VITE_SALON_APP_URL` | Salon admin app URL for CTA routing (dev default: `http://localhost:8080`, prod default: `https://app.salonmagik.com`) |

### Edge Functions (Supabase secrets)
| Variable | Description |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations |
| `RESEND_API_KEY` | Resend email delivery key |
| `RESEND_FROM_EMAIL` | Sender address for transactional emails |
| `PAYSTACK_SECRET_KEY_NG` | Paystack secret key — Nigeria account |
| `PAYSTACK_SECRET_KEY_GH` | Paystack secret key — Ghana account |
| `PAYSTACK_WEBHOOK_SECRET_NG` | Webhook signature secret — Nigeria |
| `PAYSTACK_WEBHOOK_SECRET_GH` | Webhook signature secret — Ghana |
| `ARKESEL_API_KEY_GH` | Arkesel SMS key — Ghana |
| `ARKESEL_API_KEY_NG_TRANSACTIONAL` | Arkesel SMS key — Nigeria, transactional |
| `ARKESEL_API_KEY_NG_PROMOTIONAL` | Arkesel SMS key — Nigeria, promotional |
| `SALON_APP_URL` | `https://app.salonmagik.com` |
| `BACKOFFICE_APP_URL` | `https://backoffice.salonmagik.com` |
| `PUBLIC_BOOKING_BASE_DOMAIN` | `salonmagik.com` |
| `MANAGE_BOOKINGS_URL` | `https://bookings.salonmagik.com` |
| `BASE_URL` | `https://salonmagik.com` |

---

## Deployment

### Infrastructure

- **Hosting**: Vercel, one project per app; each app's `vercel.json` sets build command and output dir
- **Node version**: 20.x (pinned in root `package.json` `engines`; set matching version in Vercel project settings)
- **Lock file**: use workspace root `pnpm-lock.yaml`
- **Supabase functions**: deployed via `supabase functions deploy`; secrets managed in Supabase dashboard
- **Migrations**: applied via `supabase db push` against the remote project
- **Email branding**: all functions use `wrapEmailTemplate` and `getSenderName` from `_shared/email-template.ts` for consistent branding

---

### Branch Model

| Branch | Purpose |
|---|---|
| `development-only` | Active feature work; PRs target `main` |
| `main` | Stable, CI-verified code; source of truth for all deployments |
| `prod` | Read-only pointer to what is actually running in production — **never merged into by humans** |

`prod` is not a normal branch. It is advanced exclusively by the production deploy workflow after a successful deploy. It exists so that the deployed state is always visible in git without querying Vercel or Supabase dashboards.

---

### Deployment Pipeline

```
feature branch
  → PR → main (CI must pass)
    → deploy-dev.yml   (auto, triggers on CI success on main push)
      → deploy-staging.yml  (auto, triggers on dev deploy success)
        → deploy-prod.yml   (manual trigger — you decide when to ship)
          → on success: CI advances prod to main's SHA
```

Each stage runs in order: **DB migrations → edge functions → frontend**. This order is non-negotiable — new frontend code that calls a new edge function must never reach users before the function is deployed.

---

### Rules for the `prod` Branch

**These rules prevent deployment conflicts and ensure `prod` always reflects reality.**

1. **Never merge into `prod` directly.** No `git merge`, no PRs targeting `prod`, no pushes. `prod` is only writable by the deploy CI using `--force-with-lease`.

2. **Never commit a hotfix directly to `prod`.** All changes — including urgent hotfixes — must go through `main` first. Merge the fix to `main`, then trigger `deploy-prod.yml` manually.

3. **`prod` always equals `main` after a deploy.** The deploy workflow sets `prod` to `main`'s SHA via force-push. This avoids the merge-commit divergence that causes conflicts on every subsequent merge attempt.

4. **If `prod` appears to be behind `main`, that means a deploy is pending** — `prod` has not yet been advanced because either no deploy has been triggered, or the last deploy failed. Never resolve this by merging; trigger the deploy.

#### Why these rules exist

When a conflict is resolved via a merge commit, that commit lives on the target branch but not on the source. The next time you try to merge in the same direction, git sees diverged histories and conflicts again — even if the code is identical. The `--force-with-lease` approach sidesteps this entirely: `prod` is never the target of a merge, so it never accumulates merge commits, and there is never divergence to resolve.

---

### Triggering a Production Deploy

```sh
# Via GitHub Actions UI:
# Actions → Deploy Prod → Run workflow → select main → Run

# Or via CLI:
gh workflow run deploy-prod.yml --ref main
```

The workflow will:
1. Run DB migrations against prod Supabase (`supabase db push`)
2. Deploy all edge functions (`supabase functions deploy`)
3. Deploy all frontend apps to Vercel
4. On success: advance `prod` to the current `main` SHA

If any step fails, `prod` does not advance and you will see which step failed in the Actions log.

---

### Hotfix Process

```
1. Branch off main:         git checkout -b fix/my-hotfix main
2. Fix and commit
3. PR into main (CI runs)
4. Merge to main
5. Trigger deploy-prod.yml manually
6. Deploy succeeds → prod advances to main
```

Do not branch off `prod` for hotfixes. `main` is always the branching point.
