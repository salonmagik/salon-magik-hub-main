import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as OTPAuth from "npm:otpauth@9.2.2";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type, x-backoffice-access-token",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
		const token = typeof body?.token === "string" ? body.token : "";
		const bodyAccessToken =
			typeof body?.accessToken === "string" ? body.accessToken : "";

    const authHeader = req.headers.get("Authorization");
    const customTokenHeader = req.headers.get("x-backoffice-access-token");
		const bearerToken = authHeader?.startsWith("Bearer ")
			? authHeader.slice("Bearer ".length).trim()
			: null;
		const accessToken =
			bodyAccessToken.trim() || customTokenHeader?.trim() || bearerToken;

		if (!accessToken) {
			return new Response(
				JSON.stringify({ valid: false, error: "Unauthorized" }),
				{
					status: 401,
					headers: { "Content-Type": "application/json", ...corsHeaders },
				},
			);
		}

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

    const {
			data: { user },
			error: userError,
		} = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      return new Response(
				JSON.stringify({
					valid: false,
					error: userError?.message || "Unauthorized",
				}),
				{
					status: 401,
					headers: { "Content-Type": "application/json", ...corsHeaders },
				},
			);
    }

    if (!token || token.length !== 6) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid token format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get the backoffice user's TOTP secret
    const { data: backofficeUser, error: boError } = await supabaseClient
      .from("backoffice_users")
      .select("totp_secret, totp_enabled")
      .eq("user_id", user.id)
      .single();

    if (boError || !backofficeUser?.totp_secret || !backofficeUser.totp_enabled) {
      return new Response(
        JSON.stringify({ valid: false, error: "TOTP not configured" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify TOTP using proper RFC 6238 algorithm
    const totp = new OTPAuth.TOTP({
      issuer: "SalonMagik",
      label: user.email || "BackOffice",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(backofficeUser.totp_secret),
    });

    // Validate with 1-step window for clock drift tolerance (±30 seconds)
    const delta = totp.validate({ token, window: 1 });
    const isValid = delta !== null;

    if (!isValid) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid code" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("TOTP verification error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
