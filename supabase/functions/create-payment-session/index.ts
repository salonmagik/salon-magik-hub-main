import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PaymentRequest {
  tenantId: string;
  appointmentId?: string;
  appointmentIds?: string[];
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  description: string;
  isDeposit?: boolean;
  successUrl: string;
  cancelUrl: string;
  preferredGateway?: "stripe" | "paystack"; // Allow user to select gateway
  intentType?: "appointment_payment" | "customer_purse_topup" | "salon_purse_topup" | "invoice_payment" | "messaging_credit_purchase";
  customerId?: string;
  invoiceId?: string;
  credits?: number;
}

function calculateDiscountedAmount(
  amount: number,
  discountType?: string | null,
  discountValue?: number | null,
) {
  const numericValue = Number(discountValue || 0);
  if (!numericValue || amount <= 0) return amount;

  if (discountType === "fixed") {
    return Math.max(0, Number((amount - numericValue).toFixed(2)));
  }

  return Math.max(0, Number((amount - (amount * numericValue) / 100).toFixed(2)));
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get("Authorization");

    const body: PaymentRequest = await req.json();
    const {
      tenantId,
      appointmentId,
      amount,
      currency,
      customerEmail,
      customerName,
      description,
      isDeposit,
      successUrl,
      cancelUrl,
      preferredGateway,
      intentType = "appointment_payment",
      customerId,
      invoiceId,
      credits,
    } = body;

    if (!tenantId || !amount || !customerEmail) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const requiresAuthenticatedCaller = intentType !== "appointment_payment";
    let authenticatedUserId: string | null = null;

    if (requiresAuthenticatedCaller) {
      if (!authHeader) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!accessToken) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (authError || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      authenticatedUserId = user.id;

      if (intentType === "customer_purse_topup") {
        if (!customerId) {
          return jsonResponse({ error: "Customer is required" }, 400);
        }

        const { data: customerRecord, error: customerLookupError } = await supabase
          .from("customers")
          .select("id, user_id")
          .eq("id", customerId)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (customerLookupError) {
          console.error("Error validating customer purse topup:", customerLookupError);
          return jsonResponse({ error: "Failed to validate customer" }, 500);
        }

        if (!customerRecord || customerRecord.user_id !== authenticatedUserId) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
      } else {
        const { data: userRole, error: roleError } = await supabase
          .from("user_roles")
          .select("id, role, is_active")
          .eq("tenant_id", tenantId)
          .eq("user_id", authenticatedUserId)
          .eq("is_active", true)
          .maybeSingle();

        if (roleError) {
          console.error("Error validating payment initiator role:", roleError);
          return jsonResponse({ error: "Failed to validate payment initiator" }, 500);
        }

        if (!userRole) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
      }
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, country, currency")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return jsonResponse({ error: "Tenant not found" }, 404);
    }

    let payableAmount = amount;
    let appliedPromo: Record<string, unknown> | null = null;

    if (intentType === "messaging_credit_purchase") {
      const { data: promoData, error: promoError } = await (supabase.rpc as any)("get_tenant_sales_promo_summary", {
        p_tenant_id: tenantId,
        p_surface: "credits",
      });

      if (promoError) {
        console.error("Failed to load tenant promo summary:", promoError);
      } else if (promoData) {
        payableAmount = calculateDiscountedAmount(
          amount,
          promoData.discount_type,
          Number(promoData.discount_value || 0),
        );
        appliedPromo = {
          promo_code_id: promoData.promo_code_id,
          redemption_id: promoData.redemption_id,
          discount_type: promoData.discount_type,
          discount_value: promoData.discount_value,
          original_amount: amount,
          final_amount: payableAmount,
        };
      }
    }

    const isPaystackRegion = ["NG", "GH", "Nigeria", "Ghana"].includes(tenant.country) ||
                        ["NGN", "GHS"].includes(currency.toUpperCase());
    const usePaystack = preferredGateway 
      ? preferredGateway === "paystack" 
      : isPaystackRegion;

    const reference = `sm_${appointmentId?.substring(0, 8) || Date.now().toString().substring(0, 8)}_${Date.now()}`;

    const { data: paymentIntent, error: intentError } = await supabase
      .from("payment_intents")
      .insert({
        tenant_id: tenantId,
        appointment_id: appointmentId || null,
        amount: payableAmount,
        currency: currency.toUpperCase(),
        customer_email: customerEmail,
        customer_name: customerName,
        gateway: usePaystack ? "paystack" : "stripe",
        is_deposit: isDeposit || false,
        status: "pending",
        paystack_reference: usePaystack ? reference : null,
        intent_type: intentType,
        metadata: {
          appointment_ids: body.appointmentIds || [appointmentId],
          ...(appliedPromo ? { sales_promo: appliedPromo } : {}),
        },
      })
      .select("id")
      .single();

    if (intentError) {
      console.error("Error creating payment intent:", intentError);
    }

    let checkoutUrl: string;

    if (usePaystack) {
      if (!paystackSecretKey) {
        return jsonResponse({ error: "Paystack not configured" }, 500);
      }

      const amountInMinorUnits = Math.round(payableAmount * 100);

      const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: customerEmail,
          amount: amountInMinorUnits,
          currency: currency.toUpperCase(),
          reference: reference,
          callback_url: successUrl,
          metadata: {
            appointment_id: appointmentId || null,
            appointment_ids: body.appointmentIds || [appointmentId],
            appointment_id: appointmentId || null,
            payment_intent_id: paymentIntent?.id,
            tenant_id: tenantId,
            is_deposit: isDeposit || false,
            customer_name: customerName,
            intent_type: intentType,
            customer_id: customerId || null,
            invoice_id: invoiceId || null,
            credits: credits || null,
            promo_redemption_id: appliedPromo?.redemption_id || null,
            promo_code_id: appliedPromo?.promo_code_id || null,
          },
        }),
      });

      const paystackData = await paystackResponse.json();

      if (!paystackResponse.ok || !paystackData.status) {
        console.error("Paystack error:", paystackData);
        return jsonResponse({ error: paystackData.message || "Failed to initialize Paystack transaction" }, 400);
      }

      if (paymentIntent?.id) {
        await supabase
          .from("payment_intents")
          .update({
            paystack_access_code: paystackData.data.access_code,
            status: "processing",
          })
          .eq("id", paymentIntent.id);
      }

      checkoutUrl = paystackData.data.authorization_url;
    } else {
      if (!stripeSecretKey) {
        return jsonResponse({ error: "Stripe not configured" }, 500);
      }

      const amountInCents = Math.round(payableAmount * 100);

      const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "mode": "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": currency.toLowerCase(),
          "line_items[0][price_data][product_data][name]": description || "Appointment Payment",
          "line_items[0][price_data][unit_amount]": amountInCents.toString(),
          "line_items[0][quantity]": "1",
          "customer_email": customerEmail,
          "success_url": `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          "cancel_url": cancelUrl,
          "metadata[appointment_id]": appointmentId || "",
          "metadata[appointment_id]": appointmentId || "",
          "metadata[appointment_ids]": JSON.stringify(body.appointmentIds || (appointmentId ? [appointmentId] : [])),
          "metadata[payment_intent_id]": paymentIntent?.id || "",
          "metadata[tenant_id]": tenantId,
          "metadata[is_deposit]": isDeposit ? "true" : "false",
          "metadata[intent_type]": intentType,
          "metadata[customer_id]": customerId || "",
          "metadata[invoice_id]": invoiceId || "",
          "metadata[credits]": credits?.toString() || "",
          "metadata[promo_redemption_id]": String(appliedPromo?.redemption_id || ""),
          "metadata[promo_code_id]": String(appliedPromo?.promo_code_id || ""),
        }),
      });

      const stripeData = await stripeResponse.json();

      if (!stripeResponse.ok) {
        console.error("Stripe error:", stripeData);
        return jsonResponse({ error: stripeData.error?.message || "Failed to create Stripe session" }, 400);
      }

      if (paymentIntent?.id) {
        await supabase
          .from("payment_intents")
          .update({
            stripe_session_id: stripeData.id,
            status: "processing",
          })
          .eq("id", paymentIntent.id);
      }

      checkoutUrl = stripeData.url;
    }

    return jsonResponse({
      checkoutUrl,
      paymentUrl: checkoutUrl,
      gateway: usePaystack ? "paystack" : "stripe",
      paymentIntentId: paymentIntent?.id,
      reference: usePaystack ? reference : undefined,
      appliedPromo,
    }, 200);
  } catch (error) {
    console.error("Error creating payment session:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
