// Thin Tier A client (design section 5): test-mode-only calls against the
// real Paystack API, used by Tier A cells and by the operator's manual
// browser-checkout step. Never touches a live key — every call here is made
// with whatever key env.ts resolved, and env.ts's import of guard.ts already
// refused to load if that key isn't sk_test_-prefixed.

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export async function initializeTransaction(
  key: string,
  params: { email: string; amountMinorUnits: number; currency: string; reference: string; callbackUrl: string; metadata?: Record<string, unknown> },
): Promise<InitializeTransactionResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountMinorUnits,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata ?? {},
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(`Paystack initialize failed: ${data.message ?? `HTTP ${res.status}`}`);
  }
  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
}

export interface FetchTransactionResult {
  status: string;
  reference: string;
  amount: number;
  channel: string;
}

export async function fetchTransactionByReference(key: string, reference: string): Promise<FetchTransactionResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(`Paystack verify failed: ${data.message ?? `HTTP ${res.status}`}`);
  }
  return {
    status: data.data.status,
    reference: data.data.reference,
    amount: data.data.amount,
    channel: data.data.channel,
  };
}

export interface CreateRefundResult {
  status: string;
  reference: string;
}

export async function createRefund(
  key: string,
  params: { transactionReference: string; amountMinorUnits: number; merchantNote?: string },
): Promise<CreateRefundResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction: params.transactionReference,
      amount: params.amountMinorUnits,
      merchant_note: params.merchantNote,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(`Paystack refund failed: ${data.message ?? `HTTP ${res.status}`}`);
  }
  return { status: data.data.status, reference: data.data.reference ?? params.transactionReference };
}

export async function fetchTransfer(key: string, transferCode: string): Promise<{ status: string }> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transfer/${encodeURIComponent(transferCode)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(`Paystack fetch transfer failed: ${data.message ?? `HTTP ${res.status}`}`);
  }
  return { status: data.data.status };
}

export async function fetchBalance(key: string): Promise<{ balance: number; currency: string } | null> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/balance`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(`Paystack balance fetch failed: ${data.message ?? `HTTP ${res.status}`}`);
  }
  const entry = Array.isArray(data.data) ? data.data[0] : null;
  return entry ? { balance: entry.balance / 100, currency: entry.currency } : null;
}

/**
 * Bounded polling helper for Tier A cells awaiting a Paystack-delivered
 * webhook's effect (design section 6, "Data Flow" — Tier A). Fixed attempt
 * count, fixed interval, hard ceiling — never unbounded (design section 12).
 */
export async function pollUntil<T>(
  check: () => Promise<T | null>,
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<T | { timedOut: true }> {
  const attempts = opts.attempts ?? 20;
  const intervalMs = opts.intervalMs ?? 3000;
  for (let i = 0; i < attempts; i++) {
    const result = await check();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { timedOut: true };
}
