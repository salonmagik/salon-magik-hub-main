import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";
import { requireTenantRole } from "../_shared/tenant-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckoutRequest {
  tenantId: string;
  successUrl: string;
  cancelUrl: string;
  billingCycle?: "monthly" | "annual";
}

/**
 * The actual checkout logic, factored out from the serve() handler below so
 * it can be driven directly by a test with an injected Supabase client and a
 * fake authenticated user (see index.test.ts) — representative of the
 * `.single()` -> requireTenantRole fix applied across the other nine
 * owner-gated functions (AD-5).
 */
export async function handleCreateCheckoutSession(
  req: Request,
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">,
): Promise<Response> {
  const { tenantId, successUrl, cancelUrl, billingCycle = "monthly" }: CheckoutRequest = await req.json();
  if (!tenantId || !successUrl || !cancelUrl) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: tenantId, successUrl, cancelUrl" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Only owners may initiate subscription checkout
  const membership = await requireTenantRole(
    supabase,
    user.id,
    tenantId,
    ["owner"],
    { error: "Only owners can manage billing" },
    corsHeaders,
  );
  if (!membership.ok) return membership.response!;

  // Load tenant — need currency and plan slug
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, currency, plan")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    return new Response(
      JSON.stringify({ error: "Tenant not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const currency = (tenant.currency || "NGN").toUpperCase();

  // Resolve Paystack secret key for this currency
  const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
  if (!paystackKey) {
    return new Response(
      JSON.stringify({ error: keyError || `Paystack not configured for currency ${currency}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // List price for this plan + currency combination. Paystack plan codes
  // (paystack_plan_code_monthly/_annual) are kept in sync purely for
  // reporting on Paystack's dashboard (see sync-paystack-plan-pricing) —
  // no checkout path sends a `plan` code to Paystack any more, so no
  // Paystack-native Subscription is ever created here (see AD-9/AD-8).
  let localPlanAmount: number = 0; // the amount to be paid stored in our records
  let planId: string | null = null;
  if (tenant.plan) {
    const { data: planRow } = await supabase
      .from("plans")
      .select("id")
      .eq("slug", tenant.plan)
      .maybeSingle();

    planId = planRow?.id ?? null;
    if (planRow?.id) {
      const { data: pricingRow } = await supabase
        .from("plan_pricing")
        .select("annual_price, monthly_price")
        .eq("plan_id", planRow.id)
        .eq("currency", currency)
        .is("valid_until", null)
        .maybeSingle();
      localPlanAmount = billingCycle === "annual"
        ? (pricingRow?.annual_price ?? 0)
        : (pricingRow?.monthly_price ?? 0);
    }
  }

  const isChain = tenant.plan?.toLowerCase() === "chain";
  const isAnnual = billingCycle === "annual";

  // Chain-annual is only available once its annual per-location pricing
  // model is fully configured for this currency (AD-8) — never a code
  // flag, so this check disappears the moment backoffice enters real
  // pricing rather than needing a follow-up deploy.
  if (isChain && isAnnual) {
    if (!planId) {
      return new Response(
        JSON.stringify({ error: `Annual billing isn't available for the Chain plan in ${currency} yet.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: chainAnnualQuote, error: chainAnnualError } = await supabase.rpc("compute_chain_price", {
      p_plan_id: planId,
      p_currency: currency,
      p_total_locations: 1,
      p_billing_cycle: "annual",
    });
    const chainAnnualTotal = chainAnnualQuote?.[0]?.total_price;
    if (chainAnnualError || chainAnnualTotal === null || chainAnnualTotal === undefined) {
      return new Response(
        JSON.stringify({ error: `Annual billing isn't available for the Chain plan in ${currency} yet.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    localPlanAmount = chainAnnualTotal;
  }

  // Any active subscription-surface promo discount applies to the first charge.
  let discount = 0;
  if (localPlanAmount > 0) {
    const { data: discountValue } = await supabase.rpc("get_active_subscription_promo_discount", {
      p_tenant_id: tenantId,
      p_amount: localPlanAmount,
    });
    discount = Number(discountValue || 0);
  }
  const chargeAmount = Math.max(localPlanAmount - discount, 0);

  // Build Paystack transaction initialization payload. Every plan and
  // cycle — Chain-annual included — is self-managed: no `plan` code is
  // ever sent, so Paystack never creates its own recurring Subscription
  // object (that fixed-price engine is what let tier upgrades silently
  // keep billing the old price forever — see compute_tenant_recurring_total,
  // and separately meant nothing ever monitored whether Paystack's own
  // renewals succeeded or failed). Instead this is a one-time transaction
  // that captures a reusable card authorization; the saved card is charged
  // the server-computed total every cycle by
  // process-recurring-addon-billing — every 30 days for monthly, every
  // 365 for annual (see getNextBillingAt).
  const paystackBody: Record<string, unknown> = {
    email: user.email,
    callback_url: successUrl,
    metadata: {
      tenant_id: tenantId,
      tenant_name: tenant.name,
      cancel_action: cancelUrl,
      intent: "subscription_activation",
      billing_cycle: isAnnual ? "annual" : "monthly",
      discount_applied: discount,
    },
  };

  if (chargeAmount > 0) {
    paystackBody.amount = Math.round(chargeAmount * 100);
    paystackBody.currency = currency;
  } else {
    // No price configured yet — fall back to a small authorization charge.
    // Amount in lowest unit (kobo / pesewas): 100 = ₦1 / GH₵1.
    paystackBody.amount = 100;
    paystackBody.currency = currency;
    console.warn(
      `No plan price for tenant ${tenantId} (plan: ${tenant.plan}, currency: ${currency}). Falling back to ₦1/GH₵1 authorization.`,
    );
  }

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paystackBody),
  });

  const paystackData = await paystackRes.json();

  if (!paystackRes.ok || !paystackData.status) {
    console.error("Paystack initialization error:", paystackData);
    return new Response(
      JSON.stringify({ error: paystackData.message || "Failed to initialize payment" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ url: paystackData.data.authorization_url }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return await handleCreateCheckoutSession(req, supabase, user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("create-checkout-session error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
