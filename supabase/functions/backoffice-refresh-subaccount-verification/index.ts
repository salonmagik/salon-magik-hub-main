import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Paystack doesn't push subaccount verification changes to us, so this is a
// pull: batch-check every subaccount we haven't yet confirmed verified,
// and record what Paystack reports right now. Bounded per run so a large
// backlog can't turn one page load into hundreds of API calls.
const MAX_CHECKS_PER_RUN = 40;

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

    const { data: pending, error: pendingError } = await adminClient
      .from("salon_payout_destinations")
      .select("id, currency, paystack_subaccount_code")
      .eq("paystack_subaccount_verified", false)
      .not("paystack_subaccount_code", "is", null)
      .limit(MAX_CHECKS_PER_RUN);

    if (pendingError) {
      console.error("Failed to load pending subaccount verifications:", pendingError);
      return json({ error: "Failed to load payout destinations" }, 500);
    }

    let checked = 0;
    let nowVerified = 0;
    const errors: string[] = [];

    for (const dest of pending || []) {
      const { key, error: keyError } = getPaystackKeyForCurrency(dest.currency);
      if (keyError || !key) {
        errors.push(`${dest.id}: ${keyError || "no key for currency"}`);
        continue;
      }

      try {
        const res = await fetch(`https://api.paystack.co/subaccount/${dest.paystack_subaccount_code}`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const data = await res.json();
        checked += 1;

        if (!res.ok || !data.status) {
          errors.push(`${dest.id}: ${data.message || `HTTP ${res.status}`}`);
          continue;
        }

        const isVerified = Boolean(data.data?.is_verified);
        await adminClient
          .from("salon_payout_destinations")
          .update({
            paystack_subaccount_verified: isVerified,
            paystack_subaccount_verification_checked_at: new Date().toISOString(),
          })
          .eq("id", dest.id);

        if (isVerified) nowVerified += 1;
      } catch (err) {
        errors.push(`${dest.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return json({ checked, nowVerified, remaining: (pending || []).length - checked, errors });
  } catch (err) {
    console.error("backoffice-refresh-subaccount-verification error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
