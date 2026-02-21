# Salon Magik Hub (monorepo)

Multi-app workspace for Salon Magik:
- `apps/salon-admin` – salon owner/operator app
- `apps/backoffice` – internal control panel
- `apps/client-portal` – client-facing portal
- `apps/public-booking` – public booking flow
- `apps/marketing` – marketing/landing site
- `packages/shared`, `packages/ui`, `packages/supabase-client` – shared code

## Prerequisites
- Node 20.x (`nvm use 20`)
- pnpm 10.x (`corepack enable` then `corepack prepare pnpm@10.29.1 --activate`)
- Supabase CLI (for functions/migrations)
- Docker running if you run Supabase functions locally

## Setup
```sh
pnpm install
```

## Running apps
From repo root:
```sh
# Salon Admin
pnpm --filter salon-admin dev
# Backoffice
pnpm --filter backoffice dev
# Client Portal
pnpm --filter client-portal dev
# Public Booking
pnpm --filter public-booking dev
# Marketing
pnpm --filter marketing dev
```
All apps use Vite; default ports are set in their `package.json`.

## Environment variables
- Each app has its own `.env.local` (see `apps/*/.env.local` for keys you already use).
- Shared Supabase settings usually include `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Email (Resend): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- Stripe/Paystack webhook secrets as needed in functions.
- URL settings used by edge functions:
  - `SALON_APP_URL=https://app.salonmagik.com`
  - `BACKOFFICE_APP_URL=https://backoffice.salonmagik.com`
  - `PUBLIC_BOOKING_BASE_DOMAIN=salonmagik.com`
  - `MANAGE_BOOKINGS_URL=https://bookings.salonmagik.com`
  - `BASE_URL=https://salonmagik.com`
- If you need URL values in Vite client code, set `VITE_` prefixed versions too
  (for example `VITE_PUBLIC_BOOKING_BASE_DOMAIN`, `VITE_MANAGE_BOOKINGS_URL`).
- Marketing CTA routing (`Log in`, `Get started`) uses `VITE_SALON_APP_URL` when set.
  If it is not set, fallback defaults are:
  - dev mode: `http://localhost:8080`
  - prod build: `https://app.salonmagik.com`

## Supabase
- Functions live in `supabase/functions`.
- Deploy selected functions:
  ```sh
  supabase functions deploy <name1> <name2> ...
  ```
- Migrations/policies are managed via Supabase CLI; ensure Docker is running if you run them locally.

## Scripts (Turbo)
```sh
pnpm dev     # runs turbo dev across workspace
pnpm build   # turbo build
pnpm lint    # turbo lint
pnpm test    # turbo test
```

## Deployment
- Vercel is used per app; point each project to its app directory and use the workspace root `pnpm-lock.yaml`.
- Root `engines` pins Node 20; set Vercel project to 20.x.
- Turbo schema uses `turbo.json` at the root.

## Email branding helpers
- Shared HTML helpers: `supabase/functions/_shared/email-template.ts`.
- Use `wrapEmailTemplate` and `getSenderName` in functions for consistent branding (Salon Magik vs. Salon-branded).

## Cleaning caches
Generated artifacts (e.g., `.vite`, `supabase/.temp`) are gitignored. If needed:
```sh
pnpm clean # (add your own script) or manually remove .vite/.turbo
```

## Notes
- Use feature branch `development-only` for PRs into `main`.
