import type { Page, Route } from "@playwright/test";

// This app's Supabase client is pointed (via VITE_SUPABASE_URL, see
// .env.playwright) at this fake, non-resolving loopback address for the
// e2e run — nothing here should ever reach a real backend, and the
// hostname allowlist below fails loudly if a mock case is missing rather
// than silently letting a request through.
export const FAKE_SUPABASE_ORIGIN = "http://127.0.0.1:9999";
const PROJECT_REF = "e2e-test-project";
export const STORAGE_KEY = `sb-salonmagik-salon-${PROJECT_REF}`;

export interface MockTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  currency: string;
  billing_cycle: string;
  subscription_status: string;
  next_billing_at: string | null;
  subscription_cancel_at: string | null;
  billing_grace_ends_at: string | null;
  suspended_at: string | null;
  paystack_authorization_code: string | null;
  [key: string]: unknown;
}

export interface MockUser {
  id: string;
  email: string;
}

export const OWNER_USER: MockUser = { id: "11111111-1111-1111-1111-111111111111", email: "owner@e2e.test" };
export const STAFF_USER: MockUser = { id: "22222222-2222-2222-2222-222222222222", email: "staff@e2e.test" };

export function makeTenant(overrides: Partial<MockTenant> = {}): MockTenant {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    name: "E2E Test Salon",
    slug: "e2e-test-salon",
    plan: "studio",
    currency: "GHS",
    billing_cycle: "monthly",
    subscription_status: "active",
    next_billing_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_cancel_at: null,
    billing_grace_ends_at: null,
    suspended_at: null,
    paystack_authorization_code: "AUTH_e2e",
    country: "GH",
    ...overrides,
  };
}

function fakeSession(user: MockUser) {
  return {
    access_token: "e2e-fake-access-token",
    refresh_token: "e2e-fake-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Seeds a valid-looking Supabase session into localStorage *before* the app's
 * own JS runs, so supabase-js's getSession() resolves locally with no
 * network call. getUser() still always calls the network to "verify" the
 * JWT server-side — that call is mocked in installSupabaseMocks below.
 */
export async function seedSession(page: Page, user: MockUser) {
  const session = fakeSession(user);
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(session)],
  );
}

// Every product-tour id registered to the pages this suite navigates to
// (settings, subscription, branch-settings — see lib/walkthroughs.ts).
const SEEN_WALKTHROUGH_IDS = [
  "hub.booking-enable",
  "hub.booking-auto-confirm",
  "hub.booking-deposits",
  "hub.booking-allow-staff",
  "hub.booking-require-staff",
  "hub.booking-auto-assign",
  "hub.business-profile",
  "hub.manage-branches-tab",
  "hub.payout-destinations",
  "hub.custom-domain",
  "hub.subscription-plan",
  "hub.subscription-usage",
  "hub.subscription-seats",
  "hub.subscription-addons",
  "hub.theme-default",
  "hub.theme-ecommerce",
  "branch.profile",
  "branch.hours",
];

export interface InstallMocksOptions {
  user: MockUser;
  role: "owner" | "staff" | "manager" | "supervisor";
  tenant: MockTenant;
  /**
   * Called for every functions.invoke() call this suite cares about.
   * Receives (and may mutate) the live tenant object backing subsequent
   * `/rest/v1/tenants` responses, so a cancel/resume in the UI is reflected
   * the next time the app refetches the tenant — matching what
   * refreshTenants() actually depends on.
   */
  onFunctionInvoke?: (functionName: string, body: unknown, route: Route, tenant: MockTenant) => Promise<boolean>;
}

/**
 * Installs the full network-mock layer for one test. Route interception is
 * an allowlist, not a denylist: any request to the real Supabase project
 * host throws (caught by Playwright as a hard failure), and any request to
 * the fake host that isn't recognized falls through to a permissive
 * "no data" default rather than a hand-authored case for every one of
 * this app's many optional data hooks — only the calls this suite actually
 * asserts on get precise responses.
 */
export async function installSupabaseMocks(page: Page, opts: InstallMocksOptions) {
  const { user, role, tenant } = opts;

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (url.hostname.endsWith("supabase.co")) {
      throw new Error(`e2e safety net: blocked a real network request to ${url.href} — a mock case is missing`);
    }

    if (url.origin !== FAKE_SUPABASE_ORIGIN) {
      return route.continue();
    }

    const path = url.pathname;

    if (path === "/auth/v1/user") {
      return route.fulfill({
        json: {
          id: user.id,
          email: user.email,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    }

    if (path.startsWith("/rest/v1/user_roles")) {
      return route.fulfill({ json: [{ role, tenant_id: tenant.id, user_id: user.id, is_active: true }] });
    }

    if (path.startsWith("/rest/v1/profiles")) {
      return route.fulfill({ json: [{ id: user.id, full_name: user === OWNER_USER ? "Test Owner" : "Test Staff" }] });
    }

    if (path.startsWith("/rest/v1/tenants")) {
      return route.fulfill({ json: [tenant] });
    }

    // Marks every walkthrough registered to the settings/subscription/
    // branch-settings pages as already-seen, so ProductTourProvider's
    // first-visit auto-launch (which would otherwise spawn a
    // react-joyride overlay on top of the page under test) never fires.
    // A permissive [] default here would do the opposite — every
    // walkthrough would look *unseen* and auto-play.
    if (path.startsWith("/rest/v1/tour_progress")) {
      return route.fulfill({
        json: SEEN_WALKTHROUGH_IDS.map((walkthrough_id) => ({ walkthrough_id })),
      });
    }

    if (path.startsWith("/rest/v1/rpc/compute_tenant_recurring_total")) {
      return route.fulfill({
        json: [{ total_amount: 45, currency: tenant.currency, breakdown: { billing_cycle: tenant.billing_cycle, base_price: 45, addon_total: 0, addon_breakdown: {}, discount: 0, pre_discount_total: 45 } }],
      });
    }

    if (path.startsWith("/functions/v1/manage-subscription-cancellation") && opts.onFunctionInvoke) {
      const body = req.postDataJSON();
      const handled = await opts.onFunctionInvoke("manage-subscription-cancellation", body, route, tenant);
      if (handled) return;
    }

    if (path.startsWith("/functions/v1/")) {
      return route.fulfill({ json: {} });
    }

    if (path.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({ json: [] });
    }

    if (path.startsWith("/rest/v1/")) {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ status: 200, json: {} });
  });
}
