import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-paystack-signature",
};

interface WebhookEvent {
  type: string;
  gateway: "stripe" | "paystack";
  data: {
    paymentIntentId?: string;
    appointmentId?: string;
    appointmentIds?: string[];
    tenantId?: string;
    customerId?: string;
    invoiceId?: string;
    credits?: number;
    amount?: number;
    status?: string;
    reference?: string;
    isDeposit?: boolean;
  };
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function parseAppointmentIds(raw: string | string[] | undefined, fallback?: string): string[] {
  const values =
    typeof raw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [raw];
          } catch {
            return [raw];
          }
        })()
      : Array.isArray(raw)
      ? raw
      : fallback
      ? [fallback]
      : [];

  return values.filter((value): value is string => typeof value === "string" && isValidUUID(value));
}

// Verify Stripe webhook signature using HMAC SHA256
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(",").reduce((acc, part) => {
      const [key, value] = part.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts["t"];
    const expectedSig = parts["v1"];

    if (!timestamp || !expectedSig) {
      console.error("Invalid Stripe signature format");
      return false;
    }

    // Check timestamp is within 5 minutes
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300) {
      console.error("Stripe webhook timestamp too old");
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === expectedSig;
  } catch (error) {
    console.error("Stripe signature verification error:", error);
    return false;
  }
}

// Verify Paystack webhook signature using HMAC SHA512
async function verifyPaystackSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === signature;
  } catch (error) {
    console.error("Paystack signature verification error:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine gateway from headers
    const stripeSignature = req.headers.get("stripe-signature");
    const paystackSignature = req.headers.get("x-paystack-signature");

    // Get raw body for signature verification
    const rawBody = await req.text();
    let body: Record<string, unknown>;

    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("Invalid JSON payload");
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let event: WebhookEvent;

    if (stripeSignature) {
      // Verify Stripe webhook signature
      if (!stripeWebhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET not configured");
        return new Response(
          JSON.stringify({ error: "Webhook secret not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyStripeSignature(rawBody, stripeSignature, stripeWebhookSecret);
      if (!isValid) {
        console.error("Invalid Stripe webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const stripeEvent = body as {
        type: string;
        data: {
          object: {
            id: string;
            status?: string;
            amount_received?: number;
            metadata?: Record<string, string>;
          };
        };
      };

      const object = stripeEvent.data.object;
      const metadata = object.metadata;

      event = {
        type: stripeEvent.type,
        gateway: "stripe",
        data: {
          paymentIntentId: metadata?.payment_intent_id,
          appointmentId: metadata?.appointment_id,
          appointmentIds: parseAppointmentIds(metadata?.appointment_ids, metadata?.appointment_id),
          tenantId: metadata?.tenant_id,
          customerId: metadata?.customer_id,
          invoiceId: metadata?.invoice_id,
          credits: metadata?.credits ? parseInt(metadata.credits) : undefined,
          amount: object.amount_received ? object.amount_received / 100 : undefined,
          status: object.status,
          reference: object.id,
          isDeposit: metadata?.is_deposit === "true",
        },
      };
    } else if (paystackSignature) {
      // Verify Paystack webhook signature
      if (!paystackSecretKey) {
        console.error("PAYSTACK_SECRET_KEY not configured");
        return new Response(
          JSON.stringify({ error: "Webhook secret not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyPaystackSignature(rawBody, paystackSignature, paystackSecretKey);
      if (!isValid) {
        console.error("Invalid Paystack webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const paystackEvent = body as {
        event: string;
        data: {
          reference?: string;
          status?: string;
          amount?: number;
          metadata?: {
            appointment_id?: string;
            payment_intent_id?: string;
            tenant_id?: string;
            customer_id?: string;
            invoice_id?: string;
            credits?: string;
          };
        };
      };

      const data = paystackEvent.data;
      const metadata = data.metadata;

      event = {
        type: paystackEvent.event,
        gateway: "paystack",
        data: {
          paymentIntentId: metadata?.payment_intent_id,
          appointmentId: metadata?.appointment_id,
          appointmentIds: parseAppointmentIds(metadata?.appointment_ids, metadata?.appointment_id),
          tenantId: metadata?.tenant_id,
          customerId: metadata?.customer_id,
          invoiceId: metadata?.invoice_id,
          credits: metadata?.credits ? parseInt(metadata.credits) : undefined,
          amount: data.amount ? data.amount / 100 : undefined,
          status: data.status,
          reference: data.reference,
          isDeposit: metadata?.is_deposit === true || metadata?.is_deposit === "true",
        },
      };
    } else {
      console.error("No webhook signature provided");
      return new Response(
        JSON.stringify({ error: "Missing webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing webhook event:", event.type, event.gateway);

    // Handle payment success
    if (
      event.type === "checkout.session.completed" ||
      event.type === "payment_intent.succeeded" ||
      event.type === "charge.success"
    ) {
      const { appointmentId, appointmentIds, paymentIntentId, amount, reference, tenantId, customerId, invoiceId, credits, isDeposit } = event.data;

      let intentType = "appointment_payment";
      if (paymentIntentId && isValidUUID(paymentIntentId)) {
        const { data } = await supabase
          .from("payment_intents")
          .select("intent_type")
          .eq("id", paymentIntentId)
          .single();

        if (data?.intent_type) {
          intentType = data.intent_type;
        }
      }

      console.log("Processing payment with intent_type:", intentType);

      switch (intentType) {
        case "appointment_payment": {
          const targetAppointmentIds = parseAppointmentIds(appointmentIds, appointmentId);
          if (targetAppointmentIds.length === 0) {
            console.error("No valid appointment ids found on payment webhook");
            return new Response(
              JSON.stringify({ error: "Invalid appointment ids" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          if (amount) {
            const { data: appointments, error: appointmentsError } = await supabase
              .from("appointments")
              .select("id, tenant_id, customer_id, total_amount, booking_reference")
              .in("id", targetAppointmentIds);

            if (appointmentsError) {
              console.error("Error loading appointments from payment webhook:", appointmentsError);
            }

            if (appointments && appointments.length > 0) {
              const totalAppointmentAmount = appointments.reduce(
                (sum, entry) => sum + Number(entry.total_amount || 0),
                0,
              );
              const paymentStatus = isDeposit ? "deposit_paid" : "fully_paid";
              const allocatedAmounts = appointments.map((entry, index) => {
                const proportionalAmount =
                  totalAppointmentAmount > 0
                    ? Number((((Number(entry.total_amount || 0) / totalAppointmentAmount) * amount)).toFixed(2))
                    : Number((amount / appointments.length).toFixed(2));
                if (index === appointments.length - 1) {
                  const previousTotal = appointments
                    .slice(0, -1)
                    .reduce((sum, prior) => {
                      const priorAmount =
                        totalAppointmentAmount > 0
                          ? Number((((Number(prior.total_amount || 0) / totalAppointmentAmount) * amount)).toFixed(2))
                          : Number((amount / appointments.length).toFixed(2));
                      return sum + priorAmount;
                    }, 0);
                  return Number((amount - previousTotal).toFixed(2));
                }
                return proportionalAmount;
              });

              for (const [index, entry] of appointments.entries()) {
                const { error: appointmentError } = await supabase
                  .from("appointments")
                  .update({
                    payment_status: paymentStatus,
                    amount_paid: allocatedAmounts[index],
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", entry.id);

                if (appointmentError) {
                  console.error("Error updating appointment:", appointmentError);
                }
              }

              const primaryAppointment = appointments[0];
              const { data: customer } = await supabase
                .from("customers")
                .select("full_name, email")
                .eq("id", primaryAppointment.customer_id)
                .single();

              const { data: tenant } = await supabase
                .from("tenants")
                .select("name, contact_email, currency")
                .eq("id", primaryAppointment.tenant_id)
                .single();

              await supabase.from("transactions").insert({
                tenant_id: primaryAppointment.tenant_id,
                customer_id: primaryAppointment.customer_id,
                appointment_id: primaryAppointment.id,
                type: "payment",
                amount,
                payment_method: "card",
                gateway: event.gateway,
                gateway_reference: reference,
                status: "completed",
                ...(event.gateway === "paystack" && reference ? { paystack_reference: reference } : {}),
              });

              await supabase.from("notifications").insert({
                tenant_id: primaryAppointment.tenant_id,
                type: "payment",
                title: isDeposit ? "New Deposit Paid" : "New Paid Booking",
                description: `${customer?.full_name || "A customer"} completed ${isDeposit ? "a deposit" : "payment"} of ${tenant?.currency || ""} ${amount} for their booking`,
                entity_type: "appointment",
                entity_id: primaryAppointment.id,
                urgent: true,
              });

              try {
                await fetch(`${supabaseUrl}/functions/v1/send-appointment-notification`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    appointmentId: primaryAppointment.id,
                    action: "scheduled",
                  }),
                });
              } catch (emailError) {
                console.error("Error sending customer notification:", emailError);
              }

              if (resendApiKey && tenant) {
                const { data: owners } = await supabase
                  .from("user_roles")
                  .select("user_id")
                  .eq("tenant_id", primaryAppointment.tenant_id)
                  .in("role", ["owner", "manager"]);

                if (owners && owners.length > 0) {
                  for (const owner of owners) {
                    const { data: profile } = await supabase
                      .from("profiles")
                      .select("email")
                      .eq("user_id", owner.user_id)
                      .single();

                    if (profile?.email) {
                      try {
                        await fetch("https://api.resend.com/emails", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${resendApiKey}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            from: buildFromAddress({ mode: "salon", salonName: tenant.name, fromEmail: resendFromEmail }),
                            to: profile.email,
                            subject: `${isDeposit ? "Deposit Received" : "New Paid Booking"} at ${tenant.name}`,
                            html: `
                          <h2>${isDeposit ? "Deposit Received" : "New Paid Booking"}</h2>
                          <p>A customer has just completed ${isDeposit ? "a deposit" : "payment"} for a booking.</p>
                          <ul>
                            <li><strong>Customer:</strong> ${customer?.full_name || "Unknown"}</li>
                            <li><strong>Amount Paid:</strong> ${tenant.currency} ${amount}</li>
                            <li><strong>Gateway:</strong> ${event.gateway}</li>
                            <li><strong>Appointments:</strong> ${appointments.length}</li>
                          </ul>
                          <p>Please review the booking in your dashboard.</p>
                        `,
                          }),
                        });
                      } catch (ownerEmailError) {
                        console.error("Error sending owner notification:", ownerEmailError);
                      }
                    }
                  }
                }
              }

              try {
                const { data: invoiceCount } = await supabase
                  .from("invoices")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", primaryAppointment.tenant_id);

                const count = (invoiceCount as unknown as number) || 0;
                const prefix = tenant?.name?.substring(0, 3).toUpperCase() || "INV";
                const invoiceNumber = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(count + 1).padStart(4, "0")}`;

                const { data: invoice } = await supabase
                  .from("invoices")
                  .insert({
                    tenant_id: primaryAppointment.tenant_id,
                    customer_id: primaryAppointment.customer_id,
                    appointment_id: primaryAppointment.id,
                    invoice_number: invoiceNumber,
                    currency: tenant?.currency || "USD",
                    subtotal: amount,
                    total: amount,
                    status: isDeposit ? "sent" : "paid",
                    paid_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single();

                if (invoice?.id) {
                  await fetch(`${supabaseUrl}/functions/v1/send-invoice`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${supabaseServiceKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ invoiceId: invoice.id }),
                  });
                }
              } catch (invoiceError) {
                console.error("Error generating invoice:", invoiceError);
              }

              try {
                const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                  p_tenant_id: primaryAppointment.tenant_id,
                  p_entry_type: "salon_purse_credit_booking",
                  p_reference_type: "appointment",
                  p_reference_id: primaryAppointment.id,
                  p_amount: amount,
                  p_currency: tenant?.currency || "NGN",
                  p_idempotency_key: `booking_${reference}`,
                  p_gateway_reference: reference,
                });

                if (creditError) {
                  console.error("Error crediting salon purse:", creditError);
                } else {
                  console.log(`Salon purse credited: ${amount} ${tenant?.currency || "NGN"} for appointment ${primaryAppointment.id}`);
                }
              } catch (purseError) {
                console.error("Exception crediting salon purse:", purseError);
              }
            }
          }
          break;
        }

        case "customer_purse_topup": {
          if (customerId && tenantId && amount) {
            const { data: tenant } = await supabase
              .from("tenants")
              .select("currency")
              .eq("id", tenantId)
              .single();

            try {
              const { error: creditError } = await supabase.rpc("credit_customer_purse", {
                p_tenant_id: tenantId,
                p_customer_id: customerId,
                p_amount: amount,
                p_currency: tenant?.currency || "NGN",
                p_idempotency_key: `topup_${reference}`,
                p_gateway_reference: reference,
              });

              if (creditError) {
                console.error("Error crediting customer purse:", creditError);
              } else {
                console.log(`Customer purse credited: ${amount} ${tenant?.currency || "NGN"} for customer ${customerId}`);
              }
            } catch (purseError) {
              console.error("Exception crediting customer purse:", purseError);
            }
          } else {
            console.error("Missing required fields for customer_purse_topup:", { customerId, tenantId, amount });
          }
          break;
        }

        case "salon_purse_topup": {
          const salonTenantId = tenantId;
          if (salonTenantId && amount && paymentIntentId) {
            const { data: salonTenant } = await supabase
              .from("tenants")
              .select("currency")
              .eq("id", salonTenantId)
              .single();

            try {
              const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                p_tenant_id: salonTenantId,
                p_entry_type: "salon_purse_topup",
                p_reference_type: "topup",
                p_reference_id: paymentIntentId,
                p_amount: amount,
                p_currency: salonTenant?.currency || "NGN",
                p_idempotency_key: `salon_topup_${reference}`,
                p_gateway_reference: reference,
              });

              if (creditError) {
                console.error("Error crediting salon purse:", creditError);
              } else {
                console.log(`Salon purse credited: ${amount} ${salonTenant?.currency || "NGN"} for tenant ${salonTenantId}`);
              }
            } catch (purseError) {
              console.error("Exception crediting salon purse:", purseError);
            }
          } else {
            console.error("Missing required fields for salon_purse_topup:", { salonTenantId, amount, paymentIntentId });
          }
          break;
        }

        case "invoice_payment": {
          if (invoiceId && isValidUUID(invoiceId) && amount && tenantId) {
            const { data: invoiceTenant } = await supabase
              .from("tenants")
              .select("currency")
              .eq("id", tenantId)
              .single();

            try {
              const { error: invoiceUpdateError } = await supabase
                .from("invoices")
                .update({
                  status: "paid",
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", invoiceId);

              if (invoiceUpdateError) {
                console.error("Error updating invoice:", invoiceUpdateError);
              }

              const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                p_tenant_id: tenantId,
                p_entry_type: "salon_purse_credit_invoice",
                p_reference_type: "invoice",
                p_reference_id: invoiceId,
                p_amount: amount,
                p_currency: invoiceTenant?.currency || "NGN",
                p_idempotency_key: `invoice_${reference}`,
                p_gateway_reference: reference,
              });

              if (creditError) {
                console.error("Error crediting salon purse for invoice:", creditError);
              }
            } catch (invoiceError) {
              console.error("Exception processing invoice payment:", invoiceError);
            }
          } else {
            console.error("Missing required fields for invoice_payment:", { invoiceId, amount, tenantId });
          }
          break;
        }

        case "messaging_credit_purchase": {
          const messagingTenantId = tenantId;
          const messagingAmount = amount;
          const messagingPaymentIntentId = paymentIntentId;

          if (credits && messagingTenantId && messagingAmount && messagingPaymentIntentId && isValidUUID(messagingPaymentIntentId)) {
            const { data: messagingTenant } = await supabase
              .from("tenants")
              .select("currency")
              .eq("id", messagingTenantId)
              .single();

            try {
              const { data: existingCredits } = await supabase
                .from("communication_credits")
                .select("id, balance")
                .eq("tenant_id", messagingTenantId)
                .single();

              if (existingCredits) {
                const { error: updateError } = await supabase
                  .from("communication_credits")
                  .update({
                    balance: existingCredits.balance + credits,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("tenant_id", messagingTenantId);

                if (updateError) {
                  console.error("Error updating communication_credits balance:", updateError);
                }
              } else {
                const { error: insertError } = await supabase
                  .from("communication_credits")
                  .insert({
                    tenant_id: messagingTenantId,
                    balance: credits,
                    updated_at: new Date().toISOString(),
                  });

                if (insertError) {
                  console.error("Error inserting communication_credits:", insertError);
                }
              }

              const { error: purchaseInsertError } = await supabase
                .from("messaging_credit_purchases")
                .insert({
                  tenant_id: messagingTenantId,
                  credits,
                  currency: messagingTenant?.currency || "NGN",
                  amount: messagingAmount,
                  paid_via: "paystack",
                  payment_intent_id: messagingPaymentIntentId,
                  gateway_reference: reference,
                });

              if (purchaseInsertError) {
                console.error("Error inserting messaging_credit_purchases:", purchaseInsertError);
              }
            } catch (creditPurchaseError) {
              console.error("Exception processing messaging credit purchase:", creditPurchaseError);
            }
          } else {
            console.error("Missing required fields for messaging_credit_purchase:", {
              credits,
              messagingTenantId,
              messagingAmount,
              messagingPaymentIntentId,
            });
          }
          break;
        }

        default:
          console.log(`Unhandled intent_type: ${intentType}`);
          break;
      }

      if (paymentIntentId && isValidUUID(paymentIntentId)) {
        await supabase
          .from("payment_intents")
          .update({
            status: "completed",
            gateway_reference: reference,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentIntentId);
      }

      if (tenantId && reference) {
        await supabase.rpc("finalize_sales_conversion_from_webhook", {
          p_payment_ref: reference,
          p_tenant_id: tenantId,
          p_status: "paid",
          p_amount: amount ?? null,
          p_currency: "USD",
          p_paid_at: new Date().toISOString(),
        });
      }
    }

    // Handle payment failure
    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "charge.failed"
    ) {
      const { paymentIntentId, tenantId, reference, amount } = event.data;

      if (paymentIntentId && isValidUUID(paymentIntentId)) {
        await supabase
          .from("payment_intents")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentIntentId);
      }

      if (tenantId) {
        await supabase.rpc("finalize_sales_conversion_from_webhook", {
          p_payment_ref: reference ?? null,
          p_tenant_id: tenantId,
          p_status: "failed",
          p_amount: amount ?? null,
          p_currency: "USD",
          p_paid_at: new Date().toISOString(),
        });
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
