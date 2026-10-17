import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate, EMAIL_STYLES } from "../_shared/email-template.ts";
import { requireTenantMembership, resolveRequestActor } from "../_shared/request-auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Derived server-side from the product row's own fulfillment_status plus the
// parent appointment's booking_metadata.line_item.fulfillment_type -- never
// trusted from the request -- so a client bug can't send a customer a
// wrongly-worded "delivered" email for a pickup order, or vice versa.
type FulfillmentAction = "ready_for_pickup" | "ready_for_delivery" | "picked_up" | "delivered";

interface NotificationRequest {
  productId: string;
}

const P = EMAIL_STYLES.primaryColor;
const T = EMAIL_STYLES.textMuted;
const S = EMAIL_STYLES.surfaceColor;
const F = EMAIL_STYLES.fontFamily;

function infoBox(rows: string): string {
  return `<div style="background:${S};border-radius:10px;padding:20px 24px;margin:24px 0;border-left:4px solid ${P};font-family:${F};font-size:15px;line-height:1.6;color:${EMAIL_STYLES.textColor};">${rows}</div>`;
}
function row(label: string, value: string): string {
  return `<p style="margin:0 0 8px;font-family:${F};"><strong>${label}:</strong> ${value}</p>`;
}
function heading(text: string): string {
  return `<h2 style="color:${P};margin:0 0 20px;font-size:24px;font-weight:700;font-family:${F};">${text}</h2>`;
}
function para(text: string): string {
  return `<p style="color:${T};font-size:16px;line-height:1.7;margin:0 0 16px;font-family:${F};">${text}</p>`;
}

const defaultTemplates: Record<FulfillmentAction, { subject: string; body: string }> = {
  ready_for_pickup: {
    subject: "Your order is ready for pickup at {{salon_name}}",
    body: `
      ${heading("Ready for pickup!")}
      ${para("Hi {{customer_name}},")}
      ${para("Your order from <strong>{{salon_name}}</strong> is ready for pickup.")}
      ${infoBox(`
        ${row("Product", "{{product_name}}")}
        ${row("Quantity", "{{quantity}}")}
        ${row("Total", "{{total_amount}}")}
        ${row("Pickup location", "{{location}}")}
      `)}
      ${para("Swing by whenever suits you — we'll have it ready at the counter.")}
    `,
  },
  ready_for_delivery: {
    subject: "Your order is on its way from {{salon_name}}",
    body: `
      ${heading("Out for delivery!")}
      ${para("Hi {{customer_name}},")}
      ${para("Your order from <strong>{{salon_name}}</strong> is on its way to you.")}
      ${infoBox(`
        ${row("Product", "{{product_name}}")}
        ${row("Quantity", "{{quantity}}")}
        ${row("Total", "{{total_amount}}")}
        ${row("Delivering to", "{{delivery_address}}")}
      `)}
      ${para("We'll let you know once it's delivered.")}
    `,
  },
  picked_up: {
    subject: "Order picked up — thank you for shopping at {{salon_name}}",
    body: `
      ${heading("Order picked up")}
      ${para("Hi {{customer_name}},")}
      ${para("Thanks for picking up your order from <strong>{{salon_name}}</strong>.")}
      ${infoBox(`
        ${row("Product", "{{product_name}}")}
        ${row("Quantity", "{{quantity}}")}
        ${row("Total", "{{total_amount}}")}
      `)}
      ${para("We hope you enjoy it, and we look forward to seeing you again soon!")}
    `,
  },
  delivered: {
    subject: "Your order has been delivered — {{salon_name}}",
    body: `
      ${heading("Order delivered")}
      ${para("Hi {{customer_name}},")}
      ${para("Your order from <strong>{{salon_name}}</strong> has been delivered.")}
      ${infoBox(`
        ${row("Product", "{{product_name}}")}
        ${row("Quantity", "{{quantity}}")}
        ${row("Total", "{{total_amount}}")}
        ${row("Delivered to", "{{delivery_address}}")}
      `)}
      ${para("We hope you enjoy it, and we look forward to seeing you again soon!")}
    `,
  },
};

const actionToTemplateType: Record<FulfillmentAction, string> = {
  ready_for_pickup: "product_ready_for_pickup",
  ready_for_delivery: "product_ready_for_delivery",
  picked_up: "product_picked_up",
  delivered: "product_delivered",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const actorResult = await resolveRequestActor(req, {
      supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceKey,
      corsHeaders,
    });
    if ("response" in actorResult) return actorResult.response;

    const { productId }: NotificationRequest = await req.json();
    if (!productId) {
      throw new Error("Missing required field: productId");
    }

    const { data: product, error: productError } = await supabase
      .from("appointment_products")
      .select(`
        *,
        appointment:appointments!appointment_products_appointment_id_fkey(
          id,
          tenant_id,
          booking_metadata,
          customer:customers!appointments_customer_id_fkey(id, full_name, email),
          location:locations(name, address, city),
          tenant:tenants!tenant_id(name, currency, logo_url, banner_urls, plan)
        )
      `)
      .eq("id", productId)
      .single();

    if (productError || !product) {
      console.error("Failed to fetch product:", JSON.stringify(productError));
      throw new Error(`Product order not found: ${productError?.message || "unknown"}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appointment = (product as any).appointment as {
      id: string;
      tenant_id: string;
      booking_metadata: { line_item?: { fulfillment_type?: string | null }; delivery_address?: { line1?: string; city?: string; country?: string } | null } | null;
      customer: { id: string; full_name: string; email: string | null } | null;
      location: { name: string; address: string | null; city: string | null } | null;
      tenant: { name: string; currency: string; logo_url: string | null; banner_urls: string[] | null; plan: string } | null;
    } | null;

    if (!appointment) {
      console.error("Appointment not found for product:", product.id);
      throw new Error("Appointment not found for this product order");
    }

    const membershipError = await requireTenantMembership(
      supabase,
      actorResult.actor,
      [appointment.tenant_id],
      corsHeaders,
    );
    if (membershipError) return membershipError;

    const fulfillmentType = appointment.booking_metadata?.line_item?.fulfillment_type === "delivery" ? "delivery" : "pickup";
    const action: FulfillmentAction | null =
      product.fulfillment_status === "ready"
        ? (fulfillmentType === "delivery" ? "ready_for_delivery" : "ready_for_pickup")
        : product.fulfillment_status === "fulfilled"
          ? (fulfillmentType === "delivery" ? "delivered" : "picked_up")
          : null;

    if (!action) {
      return new Response(
        JSON.stringify({ success: false, message: `No notification for status "${product.fulfillment_status}"` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const customerEmail = appointment.customer?.email;
    if (!customerEmail) {
      console.log("No customer email found, skipping notification");
      return new Response(
        JSON.stringify({ success: false, message: "No customer email" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const tenant = appointment.tenant;
    const templateType = actionToTemplateType[action];
    const { data: customTemplate } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("tenant_id", appointment.tenant_id)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .single();

    const template = customTemplate
      ? { subject: customTemplate.subject, body: customTemplate.body_html }
      : defaultTemplates[action];

    const currency = tenant?.currency || "GHS";
    const totalAmount = `${currency} ${Number(product.total_price).toFixed(2)}`;
    const locationText = appointment.location
      ? `${appointment.location.name}${appointment.location.address ? `, ${appointment.location.address}` : ""}${appointment.location.city ? `, ${appointment.location.city}` : ""}`
      : "N/A";
    const deliveryAddr = appointment.booking_metadata?.delivery_address;
    const deliveryAddressText = deliveryAddr
      ? [deliveryAddr.line1, deliveryAddr.city, deliveryAddr.country].filter(Boolean).join(", ")
      : "N/A";

    let emailSubject = template.subject;
    let emailBody = template.body;

    const replacements: Record<string, string> = {
      "{{customer_name}}": appointment.customer?.full_name || "Valued Customer",
      "{{salon_name}}": tenant?.name || "Our Salon",
      "{{product_name}}": product.product_name,
      "{{quantity}}": String(product.quantity),
      "{{total_amount}}": totalAmount,
      "{{location}}": locationText,
      "{{delivery_address}}": deliveryAddressText,
    };

    for (const [key, value] of Object.entries(replacements)) {
      emailSubject = emailSubject.replace(new RegExp(key, "g"), value);
      emailBody = emailBody.replace(new RegExp(key, "g"), value);
    }

    const salonName = tenant?.name || "Our Salon";
    const fullEmailHtml = wrapEmailTemplate(emailBody, {
      mode: "salon",
      salonName,
      salonLogoUrl: tenant?.logo_url ?? undefined,
      salonBannerUrl: tenant?.banner_urls?.[0] ?? undefined,
    });

    const fromAddress = buildFromAddress({ mode: "salon", salonName, fromEmail });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [customerEmail],
        subject: emailSubject,
        html: fullEmailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailData);
      const errorKind = emailResponse.status === 401 || emailResponse.status === 403
        ? "auth"
        : emailResponse.status === 422
          ? "recipient"
          : "provider";
      const errorMessage = `${errorKind}: ${emailData.message || "Failed to send email"}`;
      await supabase.from("message_logs").insert({
        tenant_id: appointment.tenant_id,
        customer_id: appointment.customer?.id,
        channel: "email",
        template_type: templateType,
        recipient: customerEmail,
        subject: emailSubject,
        status: "failed",
        provider: "resend",
        initiated_by: "system",
        credits_used: 0,
        error_message: errorMessage.slice(0, 1000),
      });
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("Fulfillment notification sent:", emailData);

    await supabase.from("message_logs").insert({
      tenant_id: appointment.tenant_id,
      customer_id: appointment.customer?.id,
      channel: "email",
      template_type: templateType,
      recipient: customerEmail,
      subject: emailSubject,
      status: "sent",
      sent_at: new Date().toISOString(),
      provider: "resend",
      initiated_by: "system",
      credits_used: 0,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in send-fulfillment-notification function:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
