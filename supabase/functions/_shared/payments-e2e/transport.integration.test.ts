// transport.integration.test.ts — design section 14.4, against the
// *deployed* payment-webhook-gh/-ng functions over HTTP (never
// processWebhook directly — see AD-2).
//
// NOT EXECUTED in this pass. Paystack's webhook signature secret is the
// same value as PAYSTACK_SECRET_KEY_GH/NG (payment-webhook-gh/index.ts
// reads it directly and passes it to verifyPaystackSignature) — so a
// correct-signature cell needs that value configured in the *served edge
// function's own environment* (the local edge-runtime container), which is
// separate from and cannot be set by this test process's own `Deno.env`.
// Wiring that (a `supabase/functions/.env` plus a stack restart) was judged
// not worth the risk to the rest of this run's already-seeded state and
// evidence for a cell whose core mechanism (HMAC-SHA512 signing/
// verification) is already covered for real by webhook-replay.test.ts. See
// the implementer report.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   # Additionally requires PAYSTACK_SECRET_KEY_GH/NG configured in
//   # supabase/functions/.env for the served function itself, then
//   # `supabase stop && supabase start` to pick it up.
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/transport.integration.test.ts

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv, requirePaystackKey } from "./env.ts";
import { recordCell } from "./evidence.ts";
import { deliverOverHttp, signPayload, type PaystackEvent } from "./webhook-replay.ts";
import type { Currency } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

const SAMPLE_EVENT: PaystackEvent = {
  event: "charge.success",
  data: { reference: "transport-cell-ref", amount: 1000, channel: "card", metadata: {} },
};

async function attempt(
  cellId: string,
  currency: Currency,
  kind: string,
  run: (key: string) => Promise<{ ok: boolean; note: string }>,
) {
  let result: "pass" | "fail" = "fail";
  let note: string;
  try {
    const key = requirePaystackKey(env, currency);
    const outcome = await run(key);
    result = outcome.ok ? "pass" : "fail";
    note = outcome.note;
  } catch (error) {
    note = error instanceof Error ? error.message : String(error);
  }
  await recordCell({
    cell_id: cellId,
    requirement_ids: ["FR-6"],
    currency,
    intent: "TRANSPORT",
    scenario: kind,
    tier: "A",
    result,
    note,
  });
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`transport: correctly-signed event is processed (${currency})`, async () => {
    await attempt(`PAY-TRANSPORT-OK-${currency}`, currency, "OK", async (key) => {
      const res = await deliverOverHttp({ event: SAMPLE_EVENT, currency, functionsBaseUrl: env.supabaseUrl, signingSecret: key });
      return { ok: res.status === 200, note: `HTTP ${res.status}` };
    });
  });

  Deno.test(`transport: tampered body with the original signature is rejected (${currency})`, async () => {
    await attempt(`PAY-TRANSPORT-TAMPERED-${currency}`, currency, "TAMPERED", async (key) => {
      const originalBody = JSON.stringify(SAMPLE_EVENT);
      const signature = await signPayload(originalBody, key);
      const tamperedBody = JSON.stringify({ ...SAMPLE_EVENT, data: { ...SAMPLE_EVENT.data, amount: 999999 } });
      const res = await deliverOverHttp({
        event: SAMPLE_EVENT,
        currency,
        functionsBaseUrl: env.supabaseUrl,
        signingSecret: key,
        signatureOverride: signature,
        rawBodyOverride: tamperedBody,
      });
      return { ok: res.status === 401, note: `HTTP ${res.status} (expected 401)` };
    });
  });

  Deno.test(`transport: event signed with the other currency's secret is rejected (${currency})`, async () => {
    await attempt(`PAY-TRANSPORT-WRONG-CURRENCY-SECRET-${currency}`, currency, "WRONG-CURRENCY-SECRET", async (key) => {
      const otherCurrency: Currency = currency === "GHS" ? "NGN" : "GHS";
      const wrongKey = requirePaystackKey(env, otherCurrency);
      void key;
      const body = JSON.stringify(SAMPLE_EVENT);
      const wrongSignature = await signPayload(body, wrongKey);
      const res = await deliverOverHttp({
        event: SAMPLE_EVENT,
        currency,
        functionsBaseUrl: env.supabaseUrl,
        signingSecret: wrongKey,
        signatureOverride: wrongSignature,
        rawBodyOverride: body,
      });
      return { ok: res.status === 401, note: `HTTP ${res.status} (expected 401 — catches a GH/NG key-crossover misconfiguration)` };
    });
  });

  Deno.test(`transport: malformed body is rejected without a 5xx (${currency})`, async () => {
    await attempt(`PAY-TRANSPORT-MALFORMED-${currency}`, currency, "MALFORMED", async (key) => {
      const malformedBody = "{not valid json";
      const signature = await signPayload(malformedBody, key);
      const res = await deliverOverHttp({
        event: SAMPLE_EVENT,
        currency,
        functionsBaseUrl: env.supabaseUrl,
        signingSecret: key,
        signatureOverride: signature,
        rawBodyOverride: malformedBody,
      });
      return { ok: res.status >= 400 && res.status < 500, note: `HTTP ${res.status} (expected 4xx, not 5xx)` };
    });
  });
}
