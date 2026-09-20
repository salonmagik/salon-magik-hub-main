import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRefundViaPaystack } from "./index.ts";

const owner = { id: "user-1" };
const transaction = { id: "transaction-1", tenant_id: "tenant-1", appointment_id: null,
  amount: 100, currency: "GHS", type: "payment", status: "completed", method: "card",
  provider: "paystack", provider_reference: "ref-abc", paystack_reference: null };

function clients(prepared: Record<string, unknown> = { ok: true, id: "11111111-1111-4111-8111-111111111111", status: "initiating" }) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const service = { from(table: string) {
    if (table === "transactions") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: transaction, error: null }) }) }) };
    if (table === "user_roles") return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ role: "owner" }], error: null }) }) }) }) };
    if (table === "paystack_refunds") return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    throw new Error(`Unexpected table ${table}`);
  }, rpc(fn: string, params: Record<string, unknown>) {
    calls.push({ fn, params });
    if (fn === "prepare_paystack_refund") return Promise.resolve({ data: prepared, error: null });
    if (fn === "reconcile_paystack_refund") return Promise.resolve({ data: { status: params.p_status, refundId: "refund-1" }, error: null });
    if (fn === "complete_local_refund") return Promise.resolve({ data: { success: true, refundId: "refund-1" }, error: null });
    throw new Error(`Unexpected RPC ${fn}`);
  } } as any;
  return { service, user: {} as any, calls };
}

const request = (overrides: Record<string, unknown> = {}) => new Request("http://local", { method: "POST", body: JSON.stringify({
  transactionId: transaction.id, amount: 100, reason: "Customer request", refundType: "paystack", idempotencyKey: "key-1", ...overrides,
}) });

Deno.test("Paystack refund initiation is explicitly disabled", async () => {
  const { service, user, calls } = clients();
  const response = await handleRefundViaPaystack(request(), user, service, owner);
  assertEquals(response.status, 410);
  assertEquals((await response.json()).code, "PAYSTACK_REFUNDS_DISABLED");
  assertEquals(calls.length, 0);
});

Deno.test("direct transfer refund uses the atomic local RPC", async () => {
  const { service, user, calls } = clients();
  const response = await handleRefundViaPaystack(request({ refundType: "offline" }), user, service, owner);
  assertEquals(response.status, 200);
  assertEquals(calls.find((call) => call.fn === "complete_local_refund")?.params.p_refund_type, "offline");
});

Deno.test("salon-credit refund uses the atomic local RPC", async () => {
  const { service, user, calls } = clients();
  const response = await handleRefundViaPaystack(request({ refundType: "store_credit" }), user, service, owner);
  assertEquals(response.status, 200);
  assertEquals(calls.find((call) => call.fn === "complete_local_refund")?.params.p_refund_type, "store_credit");
});

Deno.test("store-credit refund uses the atomic local RPC", async () => {
  const { service, user, calls } = clients();
  const response = await handleRefundViaPaystack(request({ refundType: "store_credit" }), user, service, owner);
  assertEquals(response.status, 200);
  assertEquals(calls.find((call) => call.fn === "complete_local_refund")?.params.p_key, "key-1");
});
