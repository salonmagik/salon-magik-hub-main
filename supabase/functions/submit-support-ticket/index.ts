import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildFromAddress } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendEmail(resendApiKey: string | undefined, payload: Record<string, unknown>) {
  if (!resendApiKey) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("support email send failed", body);
  }
}

type AdminClient = ReturnType<typeof createClient>;

async function findAuthEmailsByIds(admin: AdminClient, userIds: string[]) {
  if (userIds.length === 0) return [];

  const resolved = new Map<string, string>();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw error;
    }

    for (const user of data.users) {
      if (userIds.includes(user.id) && user.email) {
        resolved.set(user.id, user.email);
      }
    }

    if (resolved.size === userIds.length || data.users.length < 1000) {
      break;
    }
  }

  return [...resolved.values()];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "support@salonmagik.com";
    const supportInbox = Deno.env.get("SUPPORT_EMAIL") || "support@salonmagik.com";
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { issueType, salonInQuestion, subject, body, sourceApp = "client_portal" } = await req.json();
    if (!issueType || !subject || !body) {
      return new Response(JSON.stringify({ error: "Issue type, subject, and body are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const tenantId =
      typeof salonInQuestion === "string" && salonInQuestion !== "platform" && salonInQuestion.trim()
        ? salonInQuestion
        : null;

    const { data: insertedTicket, error: insertError } = await admin
      .from("support_tickets")
      .insert({
        source_app: sourceApp,
        requester_user_id: authData.user.id,
        requester_email: authData.user.email ?? null,
        requester_phone: profile?.phone ?? null,
        tenant_id: tenantId,
        issue_type: issueType,
        subject,
        body,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    if (tenantId) {
      const { error: notificationError } = await admin.from("notifications").insert({
        tenant_id: tenantId,
        user_id: null,
        type: "support_ticket",
        title: `Support ticket opened: ${subject}`,
        description: body,
        entity_type: "support_ticket",
        entity_id: insertedTicket.id,
        urgent: false,
      });
      if (notificationError) {
        console.error("support ticket notification error", notificationError);
      }
    }

    const supportHtml = `
      <h2>New support ticket</h2>
      <p><strong>Ticket:</strong> ${insertedTicket.id}</p>
      <p><strong>From:</strong> ${authData.user.email ?? "Unknown"} ${profile?.phone ? `(${profile.phone})` : ""}</p>
      <p><strong>Issue type:</strong> ${issueType}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Body:</strong><br/>${String(body).replace(/\n/g, "<br/>")}</p>
    `;

    await sendEmail(resendApiKey, {
      from: buildFromAddress({ mode: "product", fromEmail }),
      to: [supportInbox],
      subject: `Support ticket: ${subject}`,
      html: supportHtml,
    });

    if (tenantId) {
      const { data: tenantUsers } = await admin
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", tenantId)
        .in("role", ["owner", "manager"]);

      const recipientIds = [...new Set((tenantUsers ?? []).map((user) => user.user_id).filter(Boolean))];
      if (recipientIds.length > 0) {
        const emails = await findAuthEmailsByIds(admin, recipientIds);
        if (emails.length > 0) {
          await sendEmail(resendApiKey, {
            from: buildFromAddress({ mode: "product", fromEmail }),
            to: emails,
            subject: `Customer support ticket: ${subject}`,
            html: supportHtml,
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ticketId: insertedTicket.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("submit-support-ticket error", error);
    return new Response(JSON.stringify({ error: "Failed to submit support ticket" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
