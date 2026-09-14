// Resolves Supabase + Paystack GH/NG configuration for the payments-e2e
// harness. Calls the guard on module load (design AD-4) — importing this
// module at all is the point past which nothing may run unguarded.

import { assertSafeEnvironment } from "./guard.ts";

assertSafeEnvironment();

const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321";
// The local stack's well-known demo keys (see backoffice-add-tenant-co-owner's
// integration test precedent) — used only as a fallback when the operator
// hasn't exported their own.
const DEFAULT_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEFAULT_LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export type Currency = "GHS" | "NGN";

export interface PaymentsE2EEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  resendApiKey?: string;
  resendFromEmail?: string;
  tier: "A" | "B";
  paystackKeys: Partial<Record<Currency, string>>;
}

function currencyKeyEnvVar(currency: Currency): string {
  return currency === "GHS" ? "PAYSTACK_SECRET_KEY_GH" : "PAYSTACK_SECRET_KEY_NG";
}

export function loadEnv(): PaymentsE2EEnv {
  const tier = Deno.env.get("PAYMENTS_E2E_TIER") === "A" ? "A" : "B";

  const paystackKeys: Partial<Record<Currency, string>> = {};
  for (const currency of ["GHS", "NGN"] as const) {
    const value = Deno.env.get(currencyKeyEnvVar(currency));
    if (value) paystackKeys[currency] = value;
  }

  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? DEFAULT_LOCAL_URL,
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? DEFAULT_LOCAL_ANON_KEY,
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? DEFAULT_LOCAL_SERVICE_ROLE_KEY,
    resendApiKey: Deno.env.get("RESEND_API_KEY") ?? undefined,
    resendFromEmail: Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@salonmagik.com",
    tier,
    paystackKeys,
  };
}

/** Throws with a clear, cell-attributable reason when a currency's Paystack key isn't available. */
export function requirePaystackKey(env: PaymentsE2EEnv, currency: Currency): string {
  const key = env.paystackKeys[currency];
  if (!key) {
    throw new Error(
      `${currencyKeyEnvVar(currency)} is not set — cells for ${currency} cannot call the real Paystack ` +
        `test-mode API and must be recorded not-run, not skipped silently.`,
    );
  }
  return key;
}
