import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRefundCancelledAppointment } from "./index.ts";

const appointment = { id: "appointment-1", tenant_id: "tenant-1", customer_id: "customer-1",
  status: "cancelled", payment_status: "fully_paid", amount_paid: 100, total_amount: 100, booking_reference: "BOOK-1" };
function mock(result: Record<string, unknown>) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const client = { from(table: string) {
    if (table === "appointments") return { select: () => ({ limit: () => ({ eq: () => ({ single: () => Promise.resolve({ data: appointment, error: null }) }) }) }) };
    if (table === "user_roles") return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ role: "owner" }], error: null }) }) }) }) };
    if (table === "refund_requests") return { select: () => ({ eq: () => ({ or: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    if (table === "transactions") return { select: (columns: string) => columns === "id"
      ? ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "transaction-1" }, error: null }) }) }) }) }) }) })
      : ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    if (table === "tenants") return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { currency: "GHS" }, error: null }) }) }) };
    throw new Error(`Unexpected table ${table}`);
  }, rpc(fn: string, params: Record<string, unknown>) { calls.push({ fn, params }); return Promise.resolve({ data: result, error: null }); } } as any;
  return { client, calls };
}

Deno.test("cancelled appointment refund uses one atomic local operation", async () => {
  const { client, calls } = mock({ success: true, refundId: "refund-1" });
  const response = await handleRefundCancelledAppointment(new Request("http://local", { method: "POST", body: JSON.stringify({ appointmentId: appointment.id, idempotencyKey: "cancel-key" }) }), client, { id: "owner-1" });
  assertEquals(response.status, 200);
  assertEquals(calls[0].fn, "complete_local_refund");
  assertEquals(calls[0].params.p_key, "cancel-key");
});

Deno.test("blocked cancelled appointment refund does not issue a separate customer credit", async () => {
  const { client, calls } = mock({ success: false, code: "INSUFFICIENT_RECOVERABLE_FUNDS" });
  const response = await handleRefundCancelledAppointment(new Request("http://local", { method: "POST", body: JSON.stringify({ appointmentId: appointment.id }) }), client, { id: "owner-1" });
  assertEquals(response.status, 409);
  assertEquals(calls.some((call) => call.fn === "credit_customer_purse"), false);
});
