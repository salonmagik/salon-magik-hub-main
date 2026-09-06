import { createClient } from "npm:@supabase/supabase-js@2";
import { runLifecyclePass } from "./lifecycle.ts";
import { runChargePass } from "./charge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-recurring-billing-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("RECURRING_BILLING_SECRET");
    const providedSecret = req.headers.get("x-recurring-billing-secret");
    if (cronSecret && providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ordering is load-bearing: the lifecycle pass flips cancellation-pending
    // tenants whose date has arrived to `canceled` (and grace-expired
    // tenants to `suspended`) *before* the charge pass queries for due
    // tenants, so neither can be charged on their own transition day by a
    // race between the two passes.
    const lifecycleResults = await runLifecyclePass(req, supabase);
    const chargeResults = await runChargePass(req, supabase);

    return new Response(
      JSON.stringify({
        processed: lifecycleResults.length + chargeResults.length,
        lifecycle: lifecycleResults,
        charges: chargeResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("process-recurring-addon-billing error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
