import { defineConfig, devices } from "@playwright/test";

// Network-mocked e2e suite: drives a real browser against the real app, but
// every Supabase call is intercepted (see e2e/mock-supabase.ts) rather than
// hitting a live backend. This repo's local Supabase instance only runs
// Postgres in CI/sandboxed environments (no Auth/Kong/PostgREST), so a
// live-auth e2e run isn't reliably possible here — see the subscription
// lifecycle implementer report for the tradeoff this was scoped against.
//
// `.env.playwright` points VITE_SUPABASE_URL at a local, non-resolving-to-
// anything-real address (127.0.0.1:9999) specifically so a mock gap fails
// loudly (connection refused) instead of silently reaching a real project.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8180",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm vite dev --mode playwright --port 8180 --strictPort",
    url: "http://127.0.0.1:8180",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
