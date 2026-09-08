import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { updatePaystackSubaccount } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// settlement_schedule on salon_payout_destinations is a write-once snapshot
// of what was sent to Paystack at subaccount *creation* time — nothing
// pushes an update to Paystack when it changes afterward. That's exactly
// what happened on 2026-09-06 (20260906160000_payout_mode_on_demand_only.sql):
// every tenant's payout_mode flipped to 'on_demand' in our own database, but
// subaccounts created earlier with settlement_schedule: "auto" are still
// sitting on Paystack auto-settling today, regardless of what our database
// now says. This is a pull-the-other-way push: batch-update every
// out-of-date subaccount on Paystack to "manual", then mirror that back
// into our own column — the same shape as
// backoffice-refresh-subaccount-verification's existing pull loop, just
// pushing instead of pulling.
const MAX_UPDATES_PER_RUN = 40;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: bo } = await adminClient
      .from("backoffice_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bo) return json({ error: "Forbidden" }, 403);

    const { data: stale, error: staleError } = await adminClient
      .from("salon_payout_destinations")
      .select("id, currency, paystack_subaccount_code, settlement_schedule")
      .not("paystack_subaccount_code", "is", null)
      .neq("settlement_schedule", "manual")
      .limit(MAX_UPDATES_PER_RUN);

    if (staleError) {
      console.error("Failed to load stale settlement schedules:", staleError);
      return json({ error: "Failed to load payout destinations" }, 500);
    }

    let updated = 0;
    const errors: string[] = [];

    for (const dest of stale || []) {
      try {
        // updatePaystackSubaccount resolves the currency's Paystack key
        // internally and throws if one isn't configured — caught below, no
        // need to pre-check it here too.
        await updatePaystackSubaccount(dest.currency, dest.paystack_subaccount_code!, {
          settlement_schedule: "manual",
        });

        await adminClient
          .from("salon_payout_destinations")
          .update({ settlement_schedule: "manual" })
          .eq("id", dest.id);

        updated += 1;
      } catch (err) {
        errors.push(`${dest.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // The full backlog can be larger than MAX_UPDATES_PER_RUN — for a
    // one-time backfill the operator needs to know whether to click "Sync"
    // again, not just how this batch went.
    const { count: totalRemaining } = await adminClient
      .from("salon_payout_destinations")
      .select("id", { count: "exact", head: true })
      .not("paystack_subaccount_code", "is", null)
      .neq("settlement_schedule", "manual");

    return json({ updated, remaining: totalRemaining ?? 0, errors });
  } catch (err) {
    console.error("sync-subaccount-settlement-schedule error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
