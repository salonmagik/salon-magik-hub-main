// Unit test for webhook-replay's signature generation against a known-good
// HMAC-SHA512 vector, and for the Paystack-payload -> WebhookEvent mapping.
// No stack, no network.
//
//   deno test -A supabase/functions/_shared/payments-e2e/webhook-replay.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("PAYMENTS_E2E_ACK", "i-am-not-on-production");
Deno.env.set("PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS", "test-only-placeholder-ref");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");

const { signPayload, toWebhookEvent, buildChargeSuccessEvent } = await import("./webhook-replay.ts");

// Known-good HMAC-SHA512 vector, computed independently with Node's crypto
// module (`crypto.createHmac("sha512", "test-secret").update("hello world").digest("hex")`)
// so this test does not validate signPayload against itself.
Deno.test("signPayload matches a known-good HMAC-SHA512 vector", async () => {
  const signature = await signPayload("hello world", "test-secret");
  assertEquals(
    signature,
    "536766a5ed6b06e5ac1d1d913507cd4da5f9ad894f85f2352043b5536a3b2e50fe815b689dca960b70d9927eac8d97223148f9dbaafc86be706d08a6a121137f",
  );
});

Deno.test("signPayload produces different signatures for different secrets over the same body", async () => {
  const a = await signPayload("hello world", "secret-a");
  const b = await signPayload("hello world", "secret-b");
  assertEquals(a === b, false);
});

Deno.test("signPayload produces different signatures for a tampered body under the same secret", async () => {
  const original = await signPayload("hello world", "test-secret");
  const tampered = await signPayload("hello world!", "test-secret");
  assertEquals(original === tampered, false);
});

Deno.test("toWebhookEvent maps a realistic charge.success payload the same way payment-webhook-gh/ng do", () => {
  const paystackEvent = buildChargeSuccessEvent({
    reference: "sm_test_ref_123",
    amount: 150,
    currency: "GHS",
    intentType: "appointment_payment",
    paymentIntentId: "11111111-1111-1111-1111-111111111111",
    tenantId: "22222222-2222-2222-2222-222222222222",
    appointmentIds: ["33333333-3333-3333-3333-333333333333"],
    isDeposit: false,
    serviceAmount: 150,
  });

  const event = toWebhookEvent(paystackEvent);

  assertEquals(event.type, "charge.success");
  assertEquals(event.gateway, "paystack");
  assertEquals(event.data.reference, "sm_test_ref_123");
  assertEquals(event.data.amount, 150);
  assertEquals(event.data.paymentIntentId, "11111111-1111-1111-1111-111111111111");
  assertEquals(event.data.tenantId, "22222222-2222-2222-2222-222222222222");
  assertEquals(event.data.appointmentIds, ["33333333-3333-3333-3333-333333333333"]);
  assertEquals(event.data.isDeposit, false);
  assertEquals(event.data.serviceAmount, 150);
});

Deno.test("toWebhookEvent falls back to a single appointmentId when appointment_ids is absent", () => {
  const event = toWebhookEvent({
    event: "charge.success",
    data: {
      reference: "ref",
      amount: 1000,
      metadata: { appointment_id: "44444444-4444-4444-4444-444444444444" },
    },
  });

  assertEquals(event.data.appointmentIds, ["44444444-4444-4444-4444-444444444444"]);
});
