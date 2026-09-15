// checkout.integration.test.ts — session creation, currency mismatch,
// already-settled 409, guest vs authenticated (design implementation order
// step 5, FR-14/FR-15). Drives the *deployed* create-payment-session
// function over HTTP (it is a bare Deno.serve handler with no exported
// function to import, unlike handleProcessSalonWithdrawal/
// handleAddTenantCoOwner) against the local edge runtime `supabase start`
// already serves.
//
// IMPORTANT — see the implementer report: create-payment-session
// unconditionally calls the real Paystack /transaction/initialize API after
// its own validation checks pass. Cells that only exercise validation that
// runs *before* that call (currency mismatch, already-settled, missing
// auth) produce real, evidenced pass/fail results with no Paystack
// dependency. Cells that need a session actually created (BOOK-OK and
// every other intent's OK/ABD-C/DUP starting point) cannot complete without
// a real sk_test_ Paystack key and are recorded `fail` with that reason —
// a credential blocker, not a product defect — never silently skipped.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/checkout.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv, requirePaystackKey } from "./env.ts";
import { cleanup, seedAppointment, seedCustomer, seedTenant, tag } from "./fixtures.ts";
import { snapshotAppointment } from "./assertions.ts";
import { recordCell } from "./evidence.ts";
import type { Currency } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

async function callCreatePaymentSession(body: Record<string, unknown>, authHeader?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/create-payment-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`checkout: currency mismatch is refused (${currency})`, async () => {
    const cellTag = tag(`checkout-mismatch-${currency}`);
    const otherCurrency: Currency = currency === "GHS" ? "NGN" : "GHS";
    let result: "pass" | "fail" = "fail";
    let note = "";
    let before: unknown = null;
    let after: unknown = null;
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 50 });
      before = await snapshotAppointment(admin, appointment.id);

      const { status, json } = await callCreatePaymentSession({
        tenantId: tenant.id,
        appointmentId: appointment.id,
        amount: 50,
        currency: otherCurrency,
        customerEmail: customer.email,
        customerName: customer.fullName,
        successUrl: "https://e2e.test/success",
        cancelUrl: "https://e2e.test/cancel",
      });
      after = { response: { status, json }, appointment: await snapshotAppointment(admin, appointment.id) };

      const ok = status === 400 && typeof json.error === "string" && (json.error as string).toLowerCase().includes("currency");
      result = ok ? "pass" : "fail";
      note = ok
        ? `refused with 400: ${json.error}`
        : `expected 400 currency-mismatch error, got ${status}: ${JSON.stringify(json)}`;

      assertEquals(ok, true, note);
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await recordCell({
        cell_id: `CHECKOUT-CURRENCY-MISMATCH-${currency}`,
        requirement_ids: ["FR-14"],
        currency,
        intent: "BOOK",
        scenario: "CURRENCY-MISMATCH",
        tier: "B",
        result,
        before,
        after,
        note,
      });
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`checkout: already-settled booking is refused with 409 (${currency})`, async () => {
    const cellTag = tag(`checkout-settled-${currency}`);
    let result: "pass" | "fail" = "fail";
    let note = "";
    let before: unknown = null;
    let after: unknown = null;
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, {
        totalAmount: 50,
        amountPaid: 50,
        paymentStatus: "fully_paid",
      });
      before = await snapshotAppointment(admin, appointment.id);

      const { status, json } = await callCreatePaymentSession({
        tenantId: tenant.id,
        appointmentId: appointment.id,
        amount: 50,
        currency,
        customerEmail: customer.email,
        customerName: customer.fullName,
        successUrl: "https://e2e.test/success",
        cancelUrl: "https://e2e.test/cancel",
      });
      after = { response: { status, json }, appointment: await snapshotAppointment(admin, appointment.id) };

      const ok = status === 409;
      result = ok ? "pass" : "fail";
      note = ok ? `refused with 409: ${json.error}` : `expected 409, got ${status}: ${JSON.stringify(json)}`;
      assertEquals(ok, true, note);
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await recordCell({
        cell_id: `CHECKOUT-ALREADY-SETTLED-${currency}`,
        requirement_ids: ["FR-15"],
        currency,
        intent: "BOOK",
        scenario: "ALREADY-SETTLED",
        tier: "B",
        result,
        before,
        after,
        note,
      });
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`checkout: non-appointment intent without a bearer token is unauthorized (${currency})`, async () => {
    const cellTag = tag(`checkout-noauth-${currency}`);
    let result: "pass" | "fail" = "fail";
    let note = "";
    let before: unknown = null;
    let after: unknown = null;
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      before = { payment_intents: (await admin.from("payment_intents").select("id", { count: "exact" }).eq("tenant_id", tenant.id)).count };

      const { status, json } = await callCreatePaymentSession({
        tenantId: tenant.id,
        amount: 20,
        currency,
        customerEmail: customer.email,
        customerName: customer.fullName,
        successUrl: "https://e2e.test/success",
        cancelUrl: "https://e2e.test/cancel",
        intentType: "customer_purse_topup",
        customerId: customer.id,
      });
      after = {
        response: { status, json },
        payment_intents: (await admin.from("payment_intents").select("id", { count: "exact" }).eq("tenant_id", tenant.id)).count,
      };

      const ok = status === 401;
      result = ok ? "pass" : "fail";
      note = ok ? "refused with 401 (no bearer token)" : `expected 401, got ${status}: ${JSON.stringify(json)}`;
      assertEquals(ok, true, note);
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await recordCell({
        cell_id: `CHECKOUT-UNAUTHENTICATED-${currency}`,
        requirement_ids: ["FR-14"],
        currency,
        intent: "CPT",
        scenario: "UNAUTHENTICATED",
        tier: "B",
        result,
        before,
        after,
        note,
      });
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`checkout: appointment_payment session creation (${currency}) — blocked without a live Paystack test key`, async () => {
    const cellTag = tag(`checkout-ok-${currency}`);
    let result: "pass" | "fail" = "fail";
    let note = "";
    let before: unknown = null;
    let after: unknown = null;
    try {
      requirePaystackKey(env, currency);

      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 50 });
      before = { payment_intents: (await admin.from("payment_intents").select("id", { count: "exact" }).eq("tenant_id", tenant.id)).count };

      const { status, json } = await callCreatePaymentSession({
        tenantId: tenant.id,
        appointmentId: appointment.id,
        amount: 50,
        currency,
        customerEmail: customer.email,
        customerName: customer.fullName,
        successUrl: "https://e2e.test/success",
        cancelUrl: "https://e2e.test/cancel",
      });
      after = {
        response: { status, checkoutUrlPresent: typeof json.checkoutUrl === "string", reference: json.reference, error: json.error },
        payment_intents: (await admin.from("payment_intents").select("id", { count: "exact" }).eq("tenant_id", tenant.id)).count,
      };

      const ok = status === 200 && typeof json.checkoutUrl === "string";
      result = ok ? "pass" : "fail";
      note = ok ? `session created: ${json.reference}` : `expected 200 + checkoutUrl, got ${status}: ${JSON.stringify(json)}`;
      assertEquals(ok, true, note);
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      result = "fail";
    } finally {
      await recordCell({
        cell_id: `PAY-BOOK-OK-${currency}`,
        requirement_ids: ["FR-6", "FR-7", "FR-8"],
        currency,
        intent: "BOOK",
        scenario: "OK",
        tier: "B",
        result,
        before,
        after,
        note: note || "not attempted",
      });
      await cleanup(admin, cellTag);
    }
  });
}
