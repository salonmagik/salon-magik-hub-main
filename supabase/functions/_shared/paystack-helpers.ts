/**
 * Paystack Multi-Currency Helper Functions
 * 
 * This module provides utilities for working with multiple Paystack accounts
 * based on currency (NGN for Nigeria, GHS for Ghana).
 */

export interface PaystackKeyResult {
  key: string | null;
  currency: string;
  error?: string;
}

/**
 * Get the appropriate Paystack secret key based on currency.
 * 
 * @param currency - The currency code (NGN or GHS)
 * @returns Object containing the key and currency, or error if not supported
 */
export function getPaystackKeyForCurrency(currency: string): PaystackKeyResult {
  const normalizedCurrency = currency?.toUpperCase().trim();

  if (!normalizedCurrency) {
    return {
      key: null,
      currency: "",
      error: "Currency is required",
    };
  }

  if (normalizedCurrency === "NGN") {
    const key = Deno.env.get("PAYSTACK_SECRET_KEY_NG");
    if (!key) {
      return {
        key: null,
        currency: normalizedCurrency,
        error: "PAYSTACK_SECRET_KEY_NG not configured",
      };
    }
    return { key, currency: normalizedCurrency };
  }

  if (normalizedCurrency === "GHS") {
    const key = Deno.env.get("PAYSTACK_SECRET_KEY_GH");
    if (!key) {
      return {
        key: null,
        currency: normalizedCurrency,
        error: "PAYSTACK_SECRET_KEY_GH not configured",
      };
    }
    return { key, currency: normalizedCurrency };
  }

  return {
    key: null,
    currency: normalizedCurrency,
    error: `Paystack not supported for currency ${normalizedCurrency}. Supported: NGN, GHS`,
  };
}

/**
 * Validate that the transaction currency matches the tenant's currency.
 * 
 * @param tenantCurrency - The tenant's default currency
 * @param transactionCurrency - The currency being used in the transaction
 * @returns Object with isValid flag and error message if invalid
 */
export function validateCurrencyMatch(
  tenantCurrency: string | null | undefined,
  transactionCurrency: string | null | undefined
): { isValid: boolean; error?: string } {
  if (!tenantCurrency || !transactionCurrency) {
    return { isValid: true }; // Skip validation if either is missing
  }

  const normalizedTenant = tenantCurrency.toUpperCase().trim();
  const normalizedTransaction = transactionCurrency.toUpperCase().trim();

  if (normalizedTenant !== normalizedTransaction) {
    return {
      isValid: false,
      error: `Currency mismatch: transaction uses ${normalizedTransaction} but salon uses ${normalizedTenant}`,
    };
  }

  return { isValid: true };
}

/**
 * Determine the effective currency to use for a transaction.
 * Prefers transaction currency, falls back to tenant currency.
 * 
 * @param transactionCurrency - The currency specified in the transaction
 * @param tenantCurrency - The tenant's default currency
 * @returns The currency to use (normalized to uppercase)
 */
export function determineEffectiveCurrency(
  transactionCurrency: string | null | undefined,
  tenantCurrency: string | null | undefined
): string | null {
  if (transactionCurrency) {
    return transactionCurrency.toUpperCase().trim();
  }

  if (tenantCurrency) {
    return tenantCurrency.toUpperCase().trim();
  }

  return null;
}

/**
 * Check if a currency is supported by Paystack.
 * 
 * @param currency - The currency code to check
 * @returns True if the currency is supported (NGN or GHS)
 */
export function isPaystackSupportedCurrency(currency: string | null | undefined): boolean {
  if (!currency) return false;
  const normalized = currency.toUpperCase().trim();
  return normalized === "NGN" || normalized === "GHS";
}

/**
 * Get the country code for a Paystack currency.
 * 
 * @param currency - The currency code (NGN or GHS)
 * @returns The country code (NG or GH) or null if not supported
 */
export function getCountryForCurrency(currency: string): string | null {
  const normalized = currency?.toUpperCase().trim();
  if (normalized === "NGN") return "NG";
  if (normalized === "GHS") return "GH";
  return null;
}

/**
 * Maps Paystack's real payment channel (from a transaction's `channel`
 * field, on both the webhook payload and the verify response) to our
 * payment_method enum. Every transaction used to be recorded as "card"
 * regardless of how the customer actually paid; Paystack tells us the real
 * channel, we just weren't reading it.
 */
export function mapPaystackChannelToPaymentMethod(channel: string | null | undefined): string {
  switch (channel) {
    case "card":
      return "card";
    case "bank":
    case "bank_transfer":
    case "eft":
      return "transfer";
    case "mobile_money":
      return "mobile_money";
    case "ussd":
      return "ussd";
    case "qr":
      return "qr";
    default:
      return "card";
  }
}

export interface ChargeAuthorizationResult {
  success: boolean;
  reference?: string;
  authorization?: Record<string, unknown>;
  error?: string;
  raw?: unknown;
}

/**
 * Charges a previously-stored, reusable card token server-to-server with no
 * checkout redirect. Used both for the synchronous "pay the delta now" path
 * and the recurring add-on billing cron, since Paystack's Plan/Subscription
 * objects can't represent a dynamically-changing total — this is how we
 * self-manage the variable portion of a tenant's bill.
 *
 * @param paystackKey - the secret key for the currency being charged (see getPaystackKeyForCurrency)
 * @param params.amountInMajorUnits - amount in the currency's major unit (e.g. naira, not kobo)
 */
export async function chargeAuthorization(
  paystackKey: string,
  params: {
    authorizationCode: string;
    email: string;
    amountInMajorUnits: number;
    currency: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ChargeAuthorizationResult> {
  try {
    const res = await fetch("https://api.paystack.co/transaction/charge_authorization", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorization_code: params.authorizationCode,
        email: params.email,
        amount: Math.round(params.amountInMajorUnits * 100),
        currency: params.currency.toUpperCase(),
        metadata: params.metadata || {},
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.status || data.data?.status !== "success") {
      return {
        success: false,
        error: data.data?.gateway_response || data.message || "Charge authorization failed",
        raw: data,
      };
    }

    return {
      success: true,
      reference: data.data.reference,
      authorization: data.data.authorization,
      raw: data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error charging authorization";
    return { success: false, error: message };
  }
}

export interface PaystackBalanceResult {
  balance: number | null;
  currency: string | null;
  error?: string;
}

/**
 * Fetches the platform's live settlement-account balance from Paystack —
 * the funds actually available to withdraw right now, distinct from the
 * per-tenant salon wallet balances we track ourselves.
 *
 * @param paystackKey - the secret key for the account being checked (see getPaystackKeyForCurrency)
 */
export async function getPaystackBalance(paystackKey: string): Promise<PaystackBalanceResult> {
  try {
    const res = await fetch("https://api.paystack.co/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok || !data.status) {
      return { balance: null, currency: null, error: data.message || `HTTP ${res.status}` };
    }

    // data.data is an array of { currency, balance } — balance in the
    // currency's smallest unit (kobo/pesewas). One entry per currency the
    // integration settles in; take the first (each of our keys is scoped
    // to a single currency already).
    const entry = Array.isArray(data.data) ? data.data[0] : null;
    if (!entry) {
      return { balance: null, currency: null, error: "No balance data returned" };
    }

    return { balance: entry.balance / 100, currency: entry.currency };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error fetching Paystack balance";
    return { balance: null, currency: null, error: message };
  }
}

export interface PaystackTransferStatusResult {
  /** Paystack's own transfer status: pending | success | failed | reversed | otp, or null if the lookup itself failed. */
  status: string | null;
  error?: string;
}

/**
 * Asks Paystack directly what a transfer's real status is, instead of only
 * ever waiting on our own transfer.success/failed/reversed webhook (which
 * can be delayed, or never arrive at all — e.g. a transfer initiated under
 * the retired subaccount flow that never went through the Transfer API in
 * the first place). Used to reconcile a withdrawal that's been sitting in
 * pending/awaiting_otp before falling back to blocking a new one.
 */
export async function fetchPaystackTransferStatus(
  paystackKey: string,
  transferCodeOrId: string,
): Promise<PaystackTransferStatusResult> {
  try {
    const res = await fetch(`https://api.paystack.co/transfer/${encodeURIComponent(transferCodeOrId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok || !data.status) {
      return { status: null, error: data.message || `HTTP ${res.status}` };
    }

    return { status: data.data?.status ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error fetching Paystack transfer status";
    return { status: null, error: message };
  }
}

/**
 * Both monthly and annual tenants are fully self-managed (charged via a
 * saved authorization, on our own schedule) — annual never uses Paystack's
 * own native Subscription object. The only difference between the two is
 * how far out the next charge is scheduled.
 */
export function getNextBillingAt(billingCycle: string | null | undefined): string {
  const days = billingCycle === "annual" ? 365 : 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export interface PaystackSubscriptionResult {
  subscription: {
    subscription_code: string;
    email_token: string;
    status: string;
    next_payment_date: string | null;
    authorization?: Record<string, unknown>;
  } | null;
  error?: string;
}

/**
 * Fetches a Paystack native Subscription by its code. Used only by the
 * Chain-annual migration (migrate-chain-annual-billing) to read
 * next_payment_date before disabling it — nothing in the ongoing self-managed
 * billing path ever creates or reads a native Subscription object.
 */
export async function getPaystackSubscription(
  paystackKey: string,
  subscriptionCode: string,
): Promise<PaystackSubscriptionResult> {
  try {
    const res = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(subscriptionCode)}`, {
      headers: { Authorization: `Bearer ${paystackKey}` },
    });
    const data = await res.json();

    if (!res.ok || !data.status) {
      return { subscription: null, error: data.message || `HTTP ${res.status}` };
    }

    return { subscription: data.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error fetching Paystack subscription";
    return { subscription: null, error: message };
  }
}

export interface DisablePaystackSubscriptionResult {
  success: boolean;
  error?: string;
}

/**
 * Disables a Paystack native Subscription so it stops renewing on its own
 * schedule. Used exactly once per tenant by migrate-chain-annual-billing,
 * as the mandatory first step before realigning that tenant onto
 * self-managed billing (see AD-9). Disabling first (rather than realigning
 * first) picks the safer failure mode: if this call itself fails, the
 * tenant's row is untouched and they keep billing natively. If it succeeds
 * but the subsequent realign write fails, the tenant now has no billing
 * mechanism at all until the caller re-runs — which is why the caller
 * writes an audit row immediately after a successful disable, so a re-run
 * can detect that half-migrated state and complete it.
 */
export async function disablePaystackSubscription(
  paystackKey: string,
  params: { subscriptionCode: string; emailToken: string },
): Promise<DisablePaystackSubscriptionResult> {
  try {
    const res = await fetch("https://api.paystack.co/subscription/disable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: params.subscriptionCode,
        token: params.emailToken,
      }),
    });
    const data = await res.json();

    if (!res.ok || !data.status) {
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error disabling Paystack subscription";
    return { success: false, error: message };
  }
}
