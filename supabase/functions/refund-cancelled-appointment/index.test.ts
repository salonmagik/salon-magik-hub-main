import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRefundCancelledAppointment } from "./index.ts";

// handleRefundCancelledAppointment is the extracted, dependency-injected
// core of this function — driven here with a mock service-role client to
// verify the refund-clawback safeguard now applies to this path too (FR-7):
// a blocked debit must surface as a 409 with no customer credit, no refund
// transaction, and no appointment update.

const owner = { id: "owner-1" };

const appointmentRow = {
  id: "appointment-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  status: "cancelled",
  payment_status: "fully_paid",
  amount_paid: 100,
  total_amount: 100,
  booking_reference: "BOOK-1",
};

interface MockOptions {
  debitResult?: { data: unknown; error: { message: string } | null };
}

function createMockAdmin(opts: MockOptions) {
  const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];
  const inserted: { table: string; row: Record<string, unknown> }[] = [];

  const admin = {
    from(table: string) {
      if (table === "appointments") {
        return {
          select: () => ({
            limit: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: appointmentRow, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [{ role: "owner" }], error: null }),
            }),
          }),
        };
      }
      if (table === "refund_requests") {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                in: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, row });
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "transactions") {
        return {
          select: (cols: string) => {
            if (cols === "id") {
              return {
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: () => Promise.resolve({ data: { id: "transaction-1" }, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            };
          },
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, row });
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "refund-transaction-1" }, error: null }),
              }),
            };
          },
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { currency: "GHS" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      if (fn === "debit_salon_wallet_for_refund") {
        return Promise.resolve(opts.debitResult ?? { data: { ok: true, ledger_entry_id: "ledger-1" }, error: null });
      }
      if (fn === "credit_customer_purse") {
        return Promise.resolve({ data: "credit-entry-1", error: null });
      }
      throw new Error(`Unexpected RPC in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { admin, rpcCalls, inserted };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

Deno.test("FR-7: a blocked debit returns 409 and credits no one", async () => {
  const { admin, rpcCalls, inserted } = createMockAdmin({
    debitResult: {
      data: { ok: false, code: "INSUFFICIENT_RECOVERABLE_FUNDS", wallet_balance: 10, shortfall: 90, currency: "GHS" },
      error: null,
    },
  });

  const res = await handleRefundCancelledAppointment(makeRequest({ appointmentId: "appointment-1" }), admin, owner);

  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.code, "INSUFFICIENT_RECOVERABLE_FUNDS");
  assertEquals(rpcCalls.some((c) => c.fn === "credit_customer_purse"), false);
  assertEquals(inserted.length, 0);
});

Deno.test("a sufficient wallet debits, credits the customer, and completes the refund", async () => {
  const { admin, rpcCalls, inserted } = createMockAdmin({});

  const res = await handleRefundCancelledAppointment(makeRequest({ appointmentId: "appointment-1" }), admin, owner);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(rpcCalls.some((c) => c.fn === "credit_customer_purse"), true);
  assertEquals(inserted.some((i) => i.table === "refund_requests" && i.row.wallet_debit_entry_id === "ledger-1"), true);
});
