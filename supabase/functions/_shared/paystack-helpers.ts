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

/**
 * Payload for creating a Paystack subaccount.
 */
export interface CreateSubaccountPayload {
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
  description?: string;
  primary_contact_email?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  metadata?: string;
  /**
   * Defaults to "auto" — Paystack pays the settlement account directly,
   * ~1 business day after a charge clears. Previously hardcoded to
   * "manual" with nothing anywhere that ever triggered a manual release,
   * so split funds accumulated on Paystack with no way to reach the
   * salon. Pass "manual" explicitly only for a salon that has opted into
   * on-demand payout via the platform's own wallet/withdrawal flow.
   */
  settlement_schedule?: "auto" | "weekly" | "monthly" | "manual";
}

/**
 * Helper to call the Paystack API and create a subaccount.
 */
export async function createPaystackSubaccount(
  currency: string,
  payload: CreateSubaccountPayload
) {
  const { key, error: keyError } = getPaystackKeyForCurrency(currency);

  if (keyError || !key) {
    throw new Error(keyError || "Failed to get Paystack key");
  }

  const settlementSchedule = payload.settlement_schedule || "auto";
  console.log('Creating Paystack subaccount with payload:', {
    ...payload,
    settlement_schedule: settlementSchedule,
  });
  const response = await fetch("https://api.paystack.co/subaccount", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      settlement_schedule: settlementSchedule,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to create Paystack subaccount");
  }

  return data.data;
}

/**
 * Payload for updating a Paystack subaccount.
 */
export interface UpdateSubaccountPayload {
  business_name?: string;
  settlement_bank?: string;
  account_number?: string;
  percentage_charge?: number;
  description?: string;
  primary_contact_email?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  settlement_schedule?: "auto" | "weekly" | "monthly" | "manual";
  metadata?: string;
}

/**
 * Helper to call the Paystack API and update an existing subaccount.
 */
export async function updatePaystackSubaccount(
  currency: string,
  idOrCode: string,
  payload: UpdateSubaccountPayload
) {
  const { key, error: keyError } = getPaystackKeyForCurrency(currency);
  
  if (keyError || !key) {
    throw new Error(keyError || "Failed to get Paystack key");
  }

  const response = await fetch(`https://api.paystack.co/subaccount/${idOrCode}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to update Paystack subaccount");
  }

  return data.data;
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
