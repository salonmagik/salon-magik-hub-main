# Vercel + Supabase Migration Guide for Subdomain Architecture

This guide covers everything you need to deploy SalonMagik as separate applications across subdomains using Vercel and a self-managed Supabase project.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        salonmagik.com (DNS)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────┐    ┌──────────────────────┐              │
│  │  backoffice.         │    │  app.                │              │
│  │  salonmagik.com      │    │  salonmagik.com      │              │
│  │                      │    │                      │              │
│  │  BackOffice App      │    │  Salon Admin App     │              │
│  │  (Internal ops)      │    │  (Staff dashboard)   │              │
│  └──────────────────────┘    └──────────────────────┘              │
│                                                                     │
│  ┌──────────────────────┐    ┌──────────────────────┐              │
│  │  bookings.           │    │  [slug].             │              │
│  │  salonmagik.com      │    │  salonmagik.com      │              │
│  │                      │    │                      │              │
│  │  Client Portal       │    │  Public Booking      │              │
│  │  (Customer account)  │    │  (Wildcard subdomain)│              │
│  └──────────────────────┘    └──────────────────────┘              │
│                                                                     │
│  ┌──────────────────────┐                                          │
│  │  salonmagik.com      │                                          │
│  │  www.salonmagik.com  │                                          │
│  │                      │                                          │
│  │  Marketing / Landing │                                          │
│  └──────────────────────┘                                          │
│                                                                     │
│                     ┌─────────────────────┐                        │
│                     │    SUPABASE         │                        │
│                     │  (Shared Backend)   │                        │
│                     │  - Auth             │                        │
│                     │  - Database         │                        │
│                     │  - Edge Functions   │                        │
│                     │  - Storage          │                        │
│                     └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Create New Supabase Project

### Step 1.1: Sign up / Log in to Supabase
1. Go to https://supabase.com
2. Create a new account or log in
3. Click "New Project"
4. Choose organization (or create one)
5. Set project name: `salonmagik-production`
6. Generate a strong database password (save it securely)
7. Select region closest to your users (e.g., `eu-west-2` for Europe, `us-east-1` for USA)
8. Wait for project provisioning (~2 minutes)

### Step 1.2: Note Your Credentials
After creation, go to **Settings → API** and save:
- **Project URL**: `https://[project-ref].supabase.co`
- **Anon/Public Key**: `eyJ...` (safe for frontend)
- **Service Role Key**: `eyJ...` (secret - for Edge Functions only)
- **Project Reference**: Found in the URL

---

## Phase 2: Database Setup

### Step 2.1: Install Supabase CLI
```bash
# macOS
brew install supabase/tap/supabase

# npm (cross-platform)
npm install -g supabase

# Verify installation
supabase --version
```

### Step 2.2: Link to Your Project
```bash
cd your-salonmagik-project

# Login to Supabase
supabase login

# Link to your new project
supabase link --project-ref YOUR_PROJECT_REF
```

### Step 2.3: Run Migrations
Your migrations are already in `supabase/migrations/`. Apply them:

```bash
# Push all migrations to your new Supabase project
supabase db push
```

This will execute all migration files in order, creating:
- 30+ tables (tenants, profiles, appointments, etc.)
- All enum types (app_role, subscription_plan, etc.)
- All RLS policies
- All database functions and triggers
- All indexes

### Step 2.4: Verify Schema
In Supabase Dashboard → **Table Editor**, confirm tables exist:
- `tenants`, `profiles`, `user_roles`
- `appointments`, `appointment_services`, `appointment_products`
- `customers`, `customer_purses`
- `services`, `products`, `packages`
- `backoffice_users`, `backoffice_sessions`
- etc.

---

## Phase 3: Configure Supabase Auth

### Step 3.1: Email Templates
Go to **Authentication → Email Templates** and customize:
- Confirm signup
- Invite user
- Magic Link
- Change Email
- Reset Password

### Step 3.2: URL Configuration
Go to **Authentication → URL Configuration**:

**Site URL:**
```
https://app.salonmagik.com
```

**Redirect URLs (add all these):**
```
https://salonmagik.com/**
https://www.salonmagik.com/**
https://app.salonmagik.com/**
https://backoffice.salonmagik.com/**
https://bookings.salonmagik.com/**
https://*.salonmagik.com/**
http://localhost:5173/**
http://localhost:3000/**
```

### Step 3.3: Auth Providers (Optional)
If using social login, configure in **Authentication → Providers**:
- Google
- Apple
- etc.

### Step 3.4: Security Settings
Go to **Authentication → Settings**:
- **Confirm email**: Keep ENABLED (users must verify email)
- **Secure email change**: ENABLED
- **Leaked password protection**: ENABLE this

---

## Phase 4: Configure Secrets for Edge Functions

### Step 4.1: Set Environment Variables
Go to **Settings → Edge Functions → Secrets** and add:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `RESEND_API_KEY` | `re_...` | From resend.com dashboard |
| `RESEND_FROM_EMAIL` | `noreply@salonmagik.com` | Verified sender |
| `STRIPE_SECRET_KEY` | `sk_live_...` | From Stripe dashboard |
| `PAYSTACK_SECRET_KEY` | `sk_live_...` | From Paystack dashboard |

Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

### Step 4.2: Deploy Edge Functions
```bash
# Deploy all edge functions
supabase functions deploy

# Or deploy specific functions
supabase functions deploy send-staff-invitation
supabase functions deploy create-public-booking
supabase functions deploy payment-webhook
```

Your edge functions that need JWT disabled are already configured in `supabase/config.toml`:
- `send-staff-invitation` (verify_jwt = false)
- `send-password-reset` (verify_jwt = false)
- `create-public-booking` (verify_jwt = false)
- etc.

---

## Phase 5: Storage Buckets

### Step 5.1: Create Storage Buckets
Go to **Storage** and create buckets:

| Bucket Name | Public | Description |
|-------------|--------|-------------|
| `appointment-attachments` | Yes | Customer photos, drawings |
| `catalog-images` | Yes | Service/product images |
| `salon-branding` | Yes | Logos, banners |

### Step 5.2: Configure Storage Policies
For each bucket, add RLS policies. Example for `catalog-images`:

```sql
-- Allow public read
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'catalog-images');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'catalog-images');
```

---

## Phase 6: Monorepo Structure

### Recommended Directory Structure

```
salonmagik/
├── apps/
│   ├── backoffice/          # BackOffice app
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── salon-admin/         # Salon Admin app
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── client-portal/       # Client Portal app
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── public-booking/      # Public Booking app
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── marketing/           # Landing page
│       ├── src/
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   ├── ui/                  # Shared UI components
│   │   ├── src/
│   │   │   └── components/
│   │   │       └── ui/      # Your shadcn components
│   │   └── package.json
│   │
│   ├── supabase-client/     # Shared Supabase client
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── shared/              # Shared utilities
│       ├── src/
│       │   ├── lib/
│       │   └── hooks/
│       └── package.json
│
├── supabase/                # Edge Functions & Migrations
│   ├── functions/
│   └── migrations/
│
├── package.json             # Root workspace
├── pnpm-workspace.yaml      # or turbo.json for Turborepo
└── turbo.json
```

---

## Phase 7: Session Isolation Implementation

### Key Change: Platform-Specific Storage Keys

In each app's Supabase client configuration, use a unique storage key:

**BackOffice App (`apps/backoffice/src/lib/supabase.ts`):**
```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'sb-salonmagik-backoffice-auth',
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

**Salon Admin App (`apps/salon-admin/src/lib/supabase.ts`):**
```typescript
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'sb-salonmagik-salon-auth',
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

**Client Portal (`apps/client-portal/src/lib/supabase.ts`):**
```typescript
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: 'sb-salonmagik-client-auth',
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

This ensures logging into BackOffice does NOT log you into Salon Admin, and vice versa.

---

## Phase 8: Vercel Deployment

### Step 8.1: Connect to Vercel
1. Go to https://vercel.com
2. Import your repository (or each app if separate repos)
3. For monorepo, set **Root Directory** to the app folder (e.g., `apps/backoffice`)

### Step 8.2: Environment Variables
For each Vercel project, add:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://[ref].supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (public key) |

### Step 8.3: Domain Configuration
In Vercel dashboard for each project → **Settings → Domains**:

| Project | Domain |
|---------|--------|
| BackOffice | `backoffice.salonmagik.com` |
| Salon Admin | `app.salonmagik.com` |
| Client Portal | `bookings.salonmagik.com` |
| Marketing | `salonmagik.com`, `www.salonmagik.com` |

### Step 8.4: Wildcard Subdomain for Public Booking
For the public booking app (dynamic salon slugs):

1. In Vercel, add domain: `*.salonmagik.com`
2. Configure your DNS with wildcard A record (see Phase 9)
3. In your booking app, extract slug from hostname:

```typescript
// apps/public-booking/src/lib/salon-slug.ts
export function getSalonSlug(): string | null {
  const hostname = window.location.hostname;
  
  // Skip known subdomains
  const reserved = ['www', 'app', 'backoffice', 'bookings', 'api'];
  const parts = hostname.split('.');
  
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (!reserved.includes(subdomain)) {
      return subdomain; // This is the salon slug
    }
  }
  
  return null;
}
```

---

## Phase 9: DNS Configuration

### At Your Domain Registrar (e.g., Namecheap, Cloudflare, GoDaddy)

Add these DNS records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | `76.76.21.21` (Vercel) | Auto |
| A | www | `76.76.21.21` | Auto |
| A | app | `76.76.21.21` | Auto |
| A | backoffice | `76.76.21.21` | Auto |
| A | bookings | `76.76.21.21` | Auto |
| A | * | `76.76.21.21` | Auto |
| CNAME | _vercel | `cname.vercel-dns.com` | Auto |

Note: Use `76.76.21.21` for Vercel's IP, not Lovable's IP.

---

## Phase 10: Update Edge Function URLs

Edge functions need to know where to redirect users. Update hardcoded URLs:

**In `supabase/functions/send-staff-invitation/index.ts`:**
```typescript
// Update base URL logic
const baseUrl = req.headers.get("origin") || "https://app.salonmagik.com";
```

**Consider environment-based configuration:**
```typescript
const BASE_URLS = {
  salon: Deno.env.get("SALON_ADMIN_URL") || "https://app.salonmagik.com",
  client: Deno.env.get("CLIENT_PORTAL_URL") || "https://bookings.salonmagik.com",
  backoffice: Deno.env.get("BACKOFFICE_URL") || "https://backoffice.salonmagik.com",
};
```

Add these as Edge Function secrets in Supabase dashboard if you want flexibility.

---

## Phase 11: Testing Checklist

Before going live, verify:

- [ ] Database migrations applied successfully
- [ ] All RLS policies working (test with different users)
- [ ] Auth signup/login works on each subdomain
- [ ] Sessions are isolated (login to BackOffice doesn't affect Salon Admin)
- [ ] Edge functions deployed and responding
- [ ] Storage uploads working
- [ ] Email sending works (staff invitations, password reset)
- [ ] Payment webhooks configured (Stripe/Paystack)
- [ ] Wildcard subdomain resolves salon slugs correctly

---

## Summary: Files to Move to Shared Packages

### Move to `packages/ui/`:
- All `src/components/ui/*` (shadcn components)

### Move to `packages/supabase-client/`:
- `src/integrations/supabase/types.ts`
- New platform-aware client creators

### Move to `packages/shared/`:
- `src/lib/utils.ts`
- `src/lib/currency.ts`
- `src/lib/countries.ts`
- `src/hooks/use-toast.ts`
- `src/hooks/use-mobile.tsx`

### Keep in Each App:
- Platform-specific auth providers
- Platform-specific routes
- Platform-specific pages

---

## Cost Considerations

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Supabase** | 500MB DB, 1GB storage, 50K monthly active users | $25/mo Pro |
| **Vercel** | 100GB bandwidth, unlimited deploys | $20/mo per member |
| **Resend** | 100 emails/day | $20/mo for 50K/mo |

---

## Notes

- The migration to Vercel + Supabase will require a new Supabase project (Lovable Cloud is not accessible externally)
- DNS propagation may take up to 72 hours after configuration
- Consider using a monorepo tool like Turborepo for efficient builds across apps
- All existing Edge Functions will need redeployment via Supabase CLI
