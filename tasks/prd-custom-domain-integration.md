# Product Requirements Document: Custom Domain Integration

## 1. Introduction/Overview
This feature allows salons to purchase and configure custom domains (e.g., `mysalon.com`) directly from the SalonMagik settings dashboard. The integration uses Dotlet as the registrar and DNS provider. To bypass Vercel constraints completely, the architecture leverages a "zero-Vercel" approach: Dotlet provisions Cloudflare Edge SSL and applies a Cloudflare Origin Rule (Host header rewrite) to silently proxy requests to the salon's existing `slug.salonmagik.com` wildcard routing.

## 2. Goals
- Allow salons to search, purchase, and configure custom domains natively within the Salon Admin UI.
- Use Dotlet's API for domain availability, orders, DNS management, and Cloudflare Origin Rule setup.
- Enable automatic SSL provisioning via Cloudflare (Universal SSL).
- Map incoming requests from `mysalon.com` and `www.mysalon.com` to the correct salon tenant without Vercel configuration limits.
- Keep UI components small, modular, and easy to review.

## 3. User Stories

### US-001: Database Schema & RLS Policies
- **Title**: Add Custom Domain Fields & Order Tracking Table
- **Description**: As a backend system, I need schema support to track custom domains on tenants and log domain purchase orders so that we can map domains and track payments securely.
- **Acceptance Criteria**:
  - [ ] Add columns to `tenants`: `custom_booking_domain`, `custom_domain_verified`, `custom_domain_verified_at`, `custom_domain_source`, `dotlet_domain_id`, `dotlet_origin_rule_id`.
  - [ ] Add unique index on `custom_booking_domain`.
  - [ ] Update `public_booking_tenants` view to include `custom_booking_domain`, `custom_domain_verified`.
  - [ ] Create `domain_orders` table with status tracking and foreign key to `tenants`.
  - [ ] Implement Row Level Security (RLS) on `domain_orders` allowing only owners/managers to read/insert/update.

### US-002: Edge Function - Domain Availability
- **Title**: Create Availability Checker Edge Function
- **Description**: As a system, I want an edge function to query Dotlet's availability API so that the frontend doesn't expose API keys.
- **Acceptance Criteria**:
  - [ ] Create `supabase/functions/dotlet-check-domain-availability/index.ts`.
  - [ ] Accept `domain` in body, normalize it (strip `https://`, `www.`, trailing slash).
  - [ ] Query Dotlet `/registrar/availability/{domain}` and `/registrar/price/{domain}`.
  - [ ] Return standard JSON response with availability status, price, and currency.

### US-003: Edge Function - Purchase Domain
- **Title**: Create Purchase Domain Edge Function
- **Description**: As a salon owner, I want to submit a purchase order for an available domain so that it gets registered with my WHOIS information.
- **Acceptance Criteria**:
  - [ ] Create `supabase/functions/dotlet-purchase-domain/index.ts`.
  - [ ] Validate user permissions (owner/manager).
  - [ ] Send payload to Dotlet `/registrar/order` API.
  - [ ] Insert a new row in `domain_orders` with status `pending_payment`.
  - [ ] Return the generated order ID and manual bank transfer instructions.

### US-004: Edge Function - Status & Configuration
- **Title**: Check Order Status & Setup Cloudflare Origin Rule
- **Description**: As a system, I need functions to poll Dotlet for payment success and then automatically configure the Cloudflare proxy and host header rewrite rules.
- **Acceptance Criteria**:
  - [ ] Create `supabase/functions/dotlet-check-order-status/index.ts` to poll Dotlet and update `domain_orders` status.
  - [ ] Create `supabase/functions/dotlet-configure-domain/index.ts`.
  - [ ] Set proxied CNAME records for `@` and `www` pointing to `cname.vercel-dns.com` via Dotlet DNS API.
  - [ ] Create and Enable Origin Rule via Dotlet `/origin-rules` API pointing to `{slug}.salonmagik.com`.
  - [ ] Update `tenants` with the domain, `dotlet_origin_rule_id`, and set `custom_domain_verified` to `true`.

### US-005: Public Booking App Slug Resolution
- **Title**: Async Custom Domain Resolution
- **Description**: As a customer visiting `mysalon.com`, I want the public booking app to resolve the custom domain to the correct tenant slug so I can see the right salon.
- **Acceptance Criteria**:
  - [ ] Update `resolveSlugFromCustomDomain` in `apps/public-booking/src/lib/slugResolution.ts` to query `public_booking_tenants` by `custom_booking_domain`.
  - [ ] Strip `www.` from the hostname before querying.
  - [ ] Integrate async resolution gracefully into `BookingPage.tsx` with a loading skeleton.

### US-006: Salon Admin UI - Search & Validation
- **Title**: Custom Domain Settings Tab & Search
- **Description**: As a salon admin, I want a dedicated tab in Settings to search for and validate domain availability.
- **Acceptance Criteria**:
  - [ ] Add "Custom Domain" tab to `SettingsPage.tsx` navigation.
  - [ ] Create search input and "Check" button.
  - [ ] Display availability, price, and error states based on Edge Function response.

### US-007: Salon Admin UI - Purchase & Payment Modal
- **Title**: Purchase Flow & Bank Transfer Modal
- **Description**: As a salon admin, I want to enter my contact info, confirm the purchase, and immediately see bank transfer instructions.
- **Acceptance Criteria**:
  - [ ] Add WHOIS form fields (First name, Last name, Email, Phone, Address, etc.) pre-filled with tenant data.
  - [ ] Wire up "Purchase" button to call `dotlet-purchase-domain`.
  - [ ] Show a modal/dialog immediately after success with bank transfer instructions and reference ID (`SALON-[id]-[domain]`).

### US-008: Salon Admin UI - Order History & Management
- **Title**: View Orders, Configure & Disconnect Domain
- **Description**: As a salon admin, I want to track my order status, trigger configuration once paid, and optionally disconnect my domain later.
- **Acceptance Criteria**:
  - [ ] Display a list of `domain_orders` with status badges.
  - [ ] Show a "Configure" button on `completed` orders that triggers `dotlet-configure-domain`.
  - [ ] Display an "Active" state UI when a domain is fully verified.
  - [ ] Provide a "Disconnect Domain" button that clears the tenant columns and (optionally) disables the origin rule via a new Edge Function.

### US-009: Handle Slug Change Sync
- **Title**: Auto-Update Origin Rule on Slug Change
- **Description**: As a salon admin with an active custom domain, if I change my SalonMagik slug, my custom domain should automatically update its proxy target.
- **Acceptance Criteria**:
  - [ ] Intercept slug changes in `SettingsPage.tsx` or backend.
  - [ ] If the tenant has a `dotlet_origin_rule_id`, hit a new/updated Edge Function (`dotlet-update-origin-rule`) to change the target subdomain and re-enable the rule.
  - [ ] Ensure the custom domain does not break after a slug change.

## 4. Functional Requirements
- **FR-1**: Only `owner` and `manager` roles can purchase or configure custom domains.
- **FR-2**: Domain searches must be stripped of protocols and `www.`.
- **FR-3**: Order payments are handled via manual bank transfer; the UI must clearly block configuration until the order status is `completed`.
- **FR-4**: The public booking routing must seamlessly fall back to subdomain and query parameter lookups if custom domain matching fails.

## 5. Non-Goals
- We are NOT implementing a subdomain marketplace or leasing system.
- We are NOT automating the actual payment capture (Dotlet admins confirm transfers manually).
- We are NOT handling DNS for external/BYOD domains in v1 (only Dotlet-purchased domains).
- Analytics tracking for custom domain vs subdomain usage is excluded.

## 6. Technical Notes
- **Vercel Zero-Config**: Do NOT invoke the Vercel API. The architecture relies on Cloudflare's Origin Rules rewriting the HTTP Host header before it reaches Vercel.
- **CORS**: Ensure all edge functions have properly configured CORS headers.
- **Dotlet Auth**: Use `X-API-Key` with the `dk_...` token for all Dotlet requests.
- **Timeouts**: Dotlet API calls might occasionally lag; ensure edge functions handle fetch timeouts gracefully.
