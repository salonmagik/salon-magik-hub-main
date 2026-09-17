import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRefundViaPaystack } from "./index.ts";

Deno.env.set("PAYSTACK_SECRET_KEY_GH", "sk_test_fake");
Deno.env.set("PAYSTACK_SECRET_KEY_NG", "sk_test_fake");

// handleRefundViaPaystack is the extracted, dependency-injected core of this
// function (see index.ts) — driven here directly with mock Supabase clients,
// a fake authenticated user, and a fake `fetch` for Paystack, exercising the
// real request/response and reversal logic end to end. The RPCs themselves
// (debit_salon_wallet_for_refund, reverse_refund_wallet_debit,
// complete_transaction_refund) are covered against a real Postgres instance
// by supabase/tests/refund_clawback.sql — this sandbox's local Supabase has
// no Auth/Kong/PostgREST running, only Postgres, so a live-auth HTTP e2e run
// isn't reliable here (same constraint noted for the sibling
// subscription-lifecycle Playwright suite).

const owner = { id: "user-1" };

const transactionRow = {
  id: "transaction-1",
  tenant_id: "tenant-1",
  appointment_id: "appointment-1",
  amount: 100,
  currency: "GHS",
  type: "payment",
  status: "completed",
  method: "card",
  provider: "paystack",
  provider_reference: "ref-abc",
  paystack_reference: null,
};

interface MockOptions {
  transaction?: { data: unknown; error: { message: string } | null };
  roles?: { data: unknown[]; error: { message: string } | null };
  debitResult?: { data: unknown; error: { message: string } | null };
  reverseResult?: { data: unknown; error: { message: string } | null };
  completeResult?: { data: unknown; error: { message: string } | null };
}

function createMockClients(opts: MockOptions) {
  const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];

  const serviceSupabase = {
    from(table: string) {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(opts.transaction ?? { data: transactionRow, error: null }),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => Promise.resolve(opts.roles ?? { data: [{ role: "owner" }], error: null }),
              }),
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
      if (fn === "reverse_refund_wallet_debit") {
        return Promise.resolve(opts.reverseResult ?? { data: "reversal-1", error: null });
      }
      throw new Error(`Unexpected service-client RPC in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const userClient = {
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      if (fn === "complete_transaction_refund") {
        return Promise.resolve(opts.completeResult ?? { data: "refund-1", error: null });
      }
      throw new Error(`Unexpected user-client RPC in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { serviceSupabase, userClient, rpcCalls };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

function fakeFetch(response: { ok: boolean; status: number; body: unknown }) {
  return (async (_url: string | URL | Request) =>
    new Response(JSON.stringify(response.body), { status: response.status })) as typeof fetch;
}

// AC-1: full card-refund happy path — wallet debited, Paystack called,
// complete_transaction_refund receives the ledger entry id.
Deno.test("AC-1: card refund happy path debits the wallet, calls Paystack, and completes the refund", async () => {
  const { serviceSupabase, userClient, rpcCalls } = createMockClients({});
  const fetchImpl = fakeFetch({ ok: true, status: 200, body: { status: true, data: { reference: "ref-abc" } } });

  const res = await handleRefundViaPaystack(
    makeRequest({ transactionId: "transaction-1", amount: 100, reason: "Customer request", refundType: "paystack", idempotencyKey: "idem-1" }),
    userClient,
    serviceSupabase,
    owner,
    fetchImpl,
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.walletDebitEntryId, "ledger-1");

  const debitCall = rpcCalls.find((c) => c.fn === "debit_salon_wallet_for_refund");
  const completeCall = rpcCalls.find((c) => c.fn === "complete_transaction_refund");
  assertEquals(debitCall?.params.p_idempotency_key, "idem-1");
  assertEquals(completeCall?.params.p_wallet_debit_entry_id, "ledger-1");
  assertEquals(rpcCalls.some((c) => c.fn === "reverse_refund_wallet_debit"), false);
});

// AC-2/AC-3: blocked path — no external effect, nothing else attempted.
Deno.test("AC-2/AC-3: a blocked debit returns 409 and never calls Paystack or completes the refund", async () => {
  const { serviceSupabase, userClient, rpcCalls } = createMockClients({
    debitResult: {
      data: { ok: false, code: "INSUFFICIENT_RECOVERABLE_FUNDS", wallet_balance: 20, shortfall: 80, currency: "GHS" },
      error: null,
    },
  });
  let paystackCalled = false;
  const fetchImpl = (async () => {
    paystackCalled = true;
    return new Response(JSON.stringify({ status: true }), { status: 200 });
  }) as typeof fetch;

  const res = await handleRefundViaPaystack(
    makeRequest({ transactionId: "transaction-1", amount: 100, reason: "Customer request", refundType: "paystack" }),
    userClient,
    serviceSupabase,
    owner,
    fetchImpl,
  );

  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.code, "INSUFFICIENT_RECOVERABLE_FUNDS");
  assertEquals(body.shortfall, 80);
  assertEquals(paystackCalled, false);
  assertEquals(rpcCalls.some((c) => c.fn === "complete_transaction_refund"), false);
});

// Paystack declines after the debit already committed — the debit must be reversed.
Deno.test("Paystack decline after a successful debit reverses the wallet debit", async () => {
  const { serviceSupabase, userClient, rpcCalls } = createMockClients({});
  const fetchImpl = fakeFetch({ ok: false, status: 400, body: { status: false, message: "Transaction already refunded" } });

  const res = await handleRefundViaPaystack(
    makeRequest({ transactionId: "transaction-1", amount: 100, reason: "Customer request", refundType: "paystack", idempotencyKey: "idem-2" }),
    userClient,
    serviceSupabase,
    owner,
    fetchImpl,
  );

  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.code, "PAYSTACK_DECLINED");

  const reverseCall = rpcCalls.find((c) => c.fn === "reverse_refund_wallet_debit");
  assertEquals(reverseCall?.params.p_debit_idempotency_key, "idem-2");
  assertEquals(rpcCalls.some((c) => c.fn === "complete_transaction_refund"), false);
});

// Store-credit refund on a gateway-funded transaction: requires and passes a debit.
Deno.test("store_credit refund on a gateway-funded transaction debits the wallet and never calls Paystack", async () => {
  const { serviceSupabase, userClient, rpcCalls } = createMockClients({});
  let paystackCalled = false;
  const fetchImpl = (async () => {
    paystackCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const res = await handleRefundViaPaystack(
    makeRequest({ transactionId: "transaction-1", amount: 100, reason: "Goodwill", refundType: "store_credit" }),
    userClient,
    serviceSupabase,
    owner,
    fetchImpl,
  );

  assertEquals(res.status, 200);
  assertEquals(paystackCalled, false);
  const debitCall = rpcCalls.find((c) => c.fn === "debit_salon_wallet_for_refund");
  assertEquals(debitCall?.params.p_refund_type, "store_credit");
});

// A caller who isn't an owner/manager is rejected before any wallet debit.
Deno.test("a non-owner/manager caller is rejected with 403 before any RPC runs", async () => {
  const { serviceSupabase, userClient, rpcCalls } = createMockClients({
    roles: { data: [{ role: "staff" }], error: null },
  });

  const res = await handleRefundViaPaystack(
    makeRequest({ transactionId: "transaction-1", amount: 100, reason: "Customer request", refundType: "paystack" }),
    userClient,
    serviceSupabase,
    owner,
  );

  assertEquals(res.status, 403);
  assertEquals(rpcCalls.length, 0);
});

// complete_transaction_refund fails after Paystack already succeeded — the
// debit must be kept (the salon really does owe it), not reversed.
Deno.test("a bookkeeping failure after Paystack succeeds keeps the debit and returns 500", async () => {
  const { serviceSupabase, userClient, rpcCalls } = createMockClients({
    completeResult: { data: null, error: { message: "unexpected failure" } },
  });
  const fetchImpl = fakeFetch({ ok: true, status: 200, body: { status: true, data: { reference: "ref-abc" } } });

  const res = await handleRefundViaPaystack(
    makeRequest({ transactionId: "transaction-1", amount: 100, reason: "Customer request", refundType: "paystack" }),
    userClient,
    serviceSupabase,
    owner,
    fetchImpl,
  );

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.code, "REFUND_RECORDING_FAILED");
  assertEquals(body.walletDebitEntryId, "ledger-1");
  assertEquals(rpcCalls.some((c) => c.fn === "reverse_refund_wallet_debit"), false);
});
