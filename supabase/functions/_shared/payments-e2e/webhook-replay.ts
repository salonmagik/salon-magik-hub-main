// Builds realistic Paystack event payloads from a seeded fixture, signs them
// independently (design AD-3 — never via the production verifier, or
// signature verification would pass by construction), and delivers them
// either straight to processWebhook (Tier B, AD-2) or over HTTP to the
// deployed webhook function (transport cells, section 14.4).

import "./env.ts";
import { processWebhook, type WebhookEvent } from "../payment-webhook-processor.ts";
import type { Currency } from "./env.ts";

export interface PaystackEventMetadata {
  appointment_id?: string;
  appointment_ids?: string;
  payment_intent_id?: string;
  tenant_id?: string;
  customer_id?: string;
  invoice_id?: string;
  credits?: string;
  is_deposit?: boolean | string;
  split_purse_amount?: string | number;
  split_customer_id?: string;
  intent?: string;
  billing_cycle?: string;
  service_amount?: string | number;
  processing_fee_amount?: string | number;
}

export interface PaystackEventData {
  reference?: string;
  status?: string;
  /** Minor units (kobo/pesewas), matching Paystack's own wire format. */
  amount?: number;
  channel?: string;
  metadata?: PaystackEventMetadata;
  authorization?: { authorization_code?: string; reusable?: boolean };
  customer?: { customer_code?: string; email?: string };
  transfer_code?: string;
  recipient?: { recipient_code?: string; account_number?: string; bank_code?: string };
}

export interface PaystackEvent {
  event: string;
  data: PaystackEventData;
}

/**
 * Signs a raw JSON body exactly as Paystack does: HMAC-SHA512 over the raw
 * bytes, hex-encoded. Deliberately a second, independent implementation from
 * `verifyPaystackSignature` in payment-webhook-processor.ts (AD-3).
 */
export async function signPayload(rawBody: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mirrors the raw-Paystack-payload -> WebhookEvent mapping duplicated in
 * payment-webhook-gh/index.ts and payment-webhook-ng/index.ts. Kept here
 * rather than imported from either webhook function so the harness has one
 * place to update if that mapping ever changes, and so this module has no
 * dependency on Deno.serve-wrapped code.
 */
export function toWebhookEvent(paystackEvent: PaystackEvent): WebhookEvent {
  const { data } = paystackEvent;
  const metadata = data.metadata ?? {};

  const parseAppointmentIds = (raw: string | undefined, fallback?: string): string[] => {
    if (!raw) return fallback ? [fallback] : [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  };

  return {
    type: paystackEvent.event,
    gateway: "paystack",
    data: {
      paymentIntentId: metadata.payment_intent_id,
      appointmentId: metadata.appointment_id,
      appointmentIds: parseAppointmentIds(metadata.appointment_ids, metadata.appointment_id),
      tenantId: metadata.tenant_id,
      customerId: metadata.customer_id,
      invoiceId: metadata.invoice_id,
      credits: metadata.credits ? parseInt(metadata.credits, 10) : undefined,
      amount: data.amount !== undefined ? data.amount / 100 : undefined,
      channel: data.channel,
      status: data.status,
      reference: data.reference,
      isDeposit: metadata.is_deposit === true || metadata.is_deposit === "true",
      splitPurseAmount: metadata.split_purse_amount !== undefined
        ? parseFloat(String(metadata.split_purse_amount))
        : undefined,
      splitCustomerId: metadata.split_customer_id,
      intent: metadata.intent,
      billingCycle: metadata.billing_cycle,
      authorizationCode: data.authorization?.authorization_code,
      authorizationReusable: data.authorization?.reusable,
      customerCode: data.customer?.customer_code,
      customerEmail: data.customer?.email,
      serviceAmount: metadata.service_amount !== undefined ? parseFloat(String(metadata.service_amount)) : undefined,
      processingFeeAmount: metadata.processing_fee_amount !== undefined
        ? parseFloat(String(metadata.processing_fee_amount))
        : undefined,
    },
  };
}

export interface DeliverToProcessorInput {
  event: PaystackEvent;
  supabaseUrl: string;
  supabaseServiceKey: string;
  resendApiKey?: string;
  resendFromEmail?: string;
}

/**
 * Tier B (AD-2): awaits processWebhook directly rather than racing the
 * unawaited call the deployed webhook functions make. Deterministic, no
 * transport layer, no HTTP.
 */
export async function deliverToProcessor(input: DeliverToProcessorInput): Promise<void> {
  const webhookEvent = toWebhookEvent(input.event);
  await processWebhook(
    webhookEvent,
    input.supabaseUrl,
    input.supabaseServiceKey,
    input.resendApiKey,
    input.resendFromEmail,
  );
}

export interface DeliverOverHttpInput {
  event: PaystackEvent;
  currency: Currency;
  functionsBaseUrl: string;
  signingSecret: string;
  /** Overrides the signature actually sent — used by transport cells to send a tampered body or wrong-currency signature. */
  signatureOverride?: string;
  /** Overrides the raw body sent, independent of what was signed — used for the tampered-body transport cell. */
  rawBodyOverride?: string;
}

/**
 * Transport cells only (section 14.4): POSTs to the deployed
 * payment-webhook-gh/-ng function over HTTP, exercising signature
 * verification and the HTTP wrapper itself. Never used to assert on
 * processing outcomes — the webhook functions return 200 before processing
 * completes (AD-2), so only deliverToProcessor is used for behavioural cells.
 */
export async function deliverOverHttp(input: DeliverOverHttpInput): Promise<Response> {
  const rawBody = input.rawBodyOverride ?? JSON.stringify(input.event);
  const signature = input.signatureOverride ?? (await signPayload(rawBody, input.signingSecret));
  const functionName = input.currency === "GHS" ? "payment-webhook-gh" : "payment-webhook-ng";

  return await fetch(`${input.functionsBaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": signature,
    },
    body: rawBody,
  });
}

export interface ChargeSuccessFixtureInput {
  reference: string;
  amount: number;
  currency: Currency;
  channel?: string;
  intentType:
    | "appointment_payment"
    | "customer_purse_topup"
    | "salon_purse_topup"
    | "invoice_payment"
    | "messaging_credit_purchase";
  paymentIntentId: string;
  tenantId: string;
  appointmentIds?: string[];
  customerId?: string;
  invoiceId?: string;
  credits?: number;
  isDeposit?: boolean;
  serviceAmount?: number;
}

/** Builds a realistic charge.success payload matching what create-payment-session's metadata would produce. */
export function buildChargeSuccessEvent(input: ChargeSuccessFixtureInput): PaystackEvent {
  return {
    event: "charge.success",
    data: {
      reference: input.reference,
      status: "success",
      amount: Math.round(input.amount * 100),
      channel: input.channel ?? "card",
      metadata: {
        payment_intent_id: input.paymentIntentId,
        tenant_id: input.tenantId,
        appointment_id: input.appointmentIds?.[0],
        appointment_ids: input.appointmentIds ? JSON.stringify(input.appointmentIds) : undefined,
        customer_id: input.customerId,
        invoice_id: input.invoiceId,
        credits: input.credits !== undefined ? String(input.credits) : undefined,
        is_deposit: input.isDeposit ?? false,
        service_amount: input.serviceAmount,
      },
      customer: { email: `harness-${input.reference}@e2e.test` },
    },
  };
}

export interface ChargeFailedFixtureInput {
  reference: string;
  amount: number;
  currency: Currency;
  paymentIntentId: string;
  tenantId: string;
}

export function buildChargeFailedEvent(input: ChargeFailedFixtureInput): PaystackEvent {
  return {
    event: "charge.failed",
    data: {
      reference: input.reference,
      status: "failed",
      amount: Math.round(input.amount * 100),
      metadata: {
        payment_intent_id: input.paymentIntentId,
        tenant_id: input.tenantId,
      },
    },
  };
}

export interface TransferEventFixtureInput {
  type: "transfer.success" | "transfer.failed" | "transfer.reversed";
  withdrawalId: string;
  reference: string;
  status?: string;
}

export function buildTransferEvent(input: TransferEventFixtureInput): PaystackEvent {
  return {
    event: input.type,
    data: {
      reference: input.reference,
      status: input.status,
      transfer_code: `TRF_${input.withdrawalId}`,
    },
  };
}
