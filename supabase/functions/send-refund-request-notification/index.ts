// Called by the client portal right after request_customer_refund (a plain
// SQL RPC) succeeds. That RPC can insert the in-app notification itself, but
// it can't send email -- Resend needs a Deno edge-function environment -- so
// this function exists purely to fetch the data that RPC didn't return
// (tenant branding, customer contact) and send the "requested" pair of
// refund emails via the shared helper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendRefundEmails } from "../_shared/refund-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(payload: Record<string, unknown>, status = 200) {
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const { transactionId, amount, reason } = await req.json();
    if (!transactionId || !Number.isFinite(amount) || amount <= 0 || !reason?.trim()) {
      return json({ error: "Missing or invalid transactionId/amount/reason" }, 400);
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: transaction } = await serviceSupabase
      .from("transactions")
      .select("tenant_id, customer_id, currency")
      .eq("id", transactionId)
      .maybeSingle();

    if (!transaction) {
      return json({ error: "Transaction not found" }, 404);
    }

    const [{ data: tenant }, { data: customer }] = await Promise.all([
      serviceSupabase.from("tenants").select("name, logo_url, currency").eq("id", transaction.tenant_id).maybeSingle(),
      transaction.customer_id
        ? serviceSupabase.from("customers").select("full_name, email, user_id").eq("id", transaction.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // The requester must be the customer the transaction belongs to -- this
    // function only sends mail, but it still shouldn't let an authenticated
    // stranger trigger a refund-request email about someone else's purchase.
    if (!customer || customer.user_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    await sendRefundEmails(serviceSupabase, {
      mode: "requested",
      tenantId: transaction.tenant_id,
      tenantName: tenant?.name || "Our Salon",
      tenantLogoUrl: tenant?.logo_url ?? null,
      customerEmail: customer?.email ?? null,
      customerName: customer?.full_name || "Valued Customer",
      amount,
      currency: tenant?.currency || transaction.currency,
      reason: reason.trim(),
      fromEmail: Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com",
    });

    return json({ success: true });
  } catch (error) {
    console.error("send-refund-request-notification error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
