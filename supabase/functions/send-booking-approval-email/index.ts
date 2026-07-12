import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFromAddress,
  wrapEmailTemplate,
  heading,
  paragraph,
  createButton,
  createInfoBox,
  createAlertBox,
  smallText,
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type EmailAction = "reschedule_proposed" | "declined" | "partially_declined";

interface RequestBody {
  appointmentIds: string[];
  action: EmailAction;
  message?: string | null;
}

type AppointmentRecord = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  booking_reference: string | null;
  proposed_start: string | null;
  proposed_end: string | null;
  proposed_message: string | null;
  approval_reason: string | null;
  tenant: {
    id: string;
    name: string | null;
    currency: string | null;
    logo_url: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  customer: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  services: Array<{ service_name: string | null }> | null;
  products: Array<{ product_name: string | null; quantity: number | null }> | null;
};

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "Time to be confirmed";
  const startDate = new Date(start);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(startDate);
  const startTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(startDate);

  if (!end) return `${date} at ${startTime}`;

  const endTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(end));

  return `${date} · ${startTime} to ${endTime}`;
}

function describeItems(appointments: AppointmentRecord[]) {
  return appointments
    .map((appointment) => {
      const serviceNames = (appointment.services || [])
        .map((service) => service.service_name)
        .filter(Boolean);
      const productNames = (appointment.products || [])
        .map((product) => {
          if (!product.product_name) return null;
          const quantity = Number(product.quantity || 0);
          return quantity > 1 ? `${product.product_name} x${quantity}` : product.product_name;
        })
        .filter(Boolean);

      const allNames = [...serviceNames, ...productNames];
      if (allNames.length === 0) return "Booking item";
      return allNames.join(", ");
    })
    .join("<br />");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const clientPortalBase =
      (Deno.env.get("CLIENT_PORTAL_URL") ||
        Deno.env.get("MANAGE_BOOKINGS_URL") ||
        Deno.env.get("BASE_URL") ||
        "https://app.salonmagik.com").replace(/\/+$/, "");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body: RequestBody = await req.json();

    if (!body.action || !Array.isArray(body.appointmentIds) || body.appointmentIds.length === 0) {
      return new Response(JSON.stringify({ error: "appointmentIds and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(`
        id,
        tenant_id,
        customer_id,
        booking_reference,
        proposed_start,
        proposed_end,
        proposed_message,
        approval_reason,
        tenant:tenants(id, name, currency, logo_url, email, phone),
        customer:customers(id, full_name, email),
        services:appointment_services(service_name),
        products:appointment_products(product_name, quantity)
      `)
      .in("id", body.appointmentIds);

    if (error) throw error;
    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ error: "No appointments found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedAppointments = appointments as unknown as AppointmentRecord[];
    const primary = normalizedAppointments[0];
    const customer = primary.customer;
    const tenant = primary.tenant;

    if (!customer?.email) {
      return new Response(JSON.stringify({ error: "Customer email not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookingUrl = `${clientPortalBase}/bookings/${primary.id}`;
    const itemDescription = describeItems(normalizedAppointments);
    const customerFirstName = customer.full_name?.split(" ")[0] || "there";
    const contactHref = tenant?.email
      ? `mailto:${tenant.email}`
      : tenant?.phone
        ? `tel:${tenant.phone}`
        : null;

    let subject = "";
    let content = "";

    if (body.action === "reschedule_proposed") {
      subject = `New time proposed for your booking at ${tenant?.name || "your salon"}`;
      content = `
        ${heading("A new time has been proposed")}
        ${paragraph(`Hi ${customerFirstName},`)}
        ${paragraph(`${tenant?.name || "The salon"} reviewed your request and proposed a new booking time. Review it in your client portal and choose whether to accept it.`)}
        ${createInfoBox(`
          <p style="margin: 0 0 8px 0;"><strong>Items:</strong><br />${itemDescription}</p>
          <p style="margin: 0;"><strong>Proposed time:</strong> ${formatDateRange(primary.proposed_start, primary.proposed_end)}</p>
        `)}
        ${primary.proposed_message ? createAlertBox(primary.proposed_message, "info") : ""}
        ${createButton("Review booking", bookingUrl)}
        ${contactHref ? smallText(`Need help instead? Contact the salon directly: <a href="${contactHref}">${contactHref.replace(/^mailto:|^tel:/, "")}</a>`) : ""}
      `;
    } else {
      const declinedItems = normalizedAppointments
        .map((appointment) => {
          const itemNames = describeItems([appointment]);
          const reason = appointment.approval_reason || body.message || "The salon could not confirm this item as requested.";
          return `<li style="margin-bottom: 8px;"><strong>${itemNames}</strong><br /><span style="color: #4b5563;">${reason}</span></li>`;
        })
        .join("");

      subject =
        body.action === "partially_declined"
          ? `Update on your booking at ${tenant?.name || "your salon"}`
          : `Your booking could not be confirmed at ${tenant?.name || "your salon"}`;

      content = `
        ${heading(body.action === "partially_declined" ? "Some items were not approved" : "Your booking request was declined")}
        ${paragraph(`Hi ${customerFirstName},`)}
        ${paragraph(
          body.action === "partially_declined"
            ? `${tenant?.name || "The salon"} approved part of your request and declined the items below. Any accepted items will be invoiced separately in your client portal.`
            : `${tenant?.name || "The salon"} could not confirm your booking request as submitted. The declined items are listed below.`,
        )}
        ${createInfoBox(`<ul style="padding-left: 20px; margin: 0;">${declinedItems}</ul>`)}
        ${body.message ? createAlertBox(body.message, "warning") : ""}
        ${createButton("View booking details", bookingUrl)}
        ${contactHref ? smallText(`Need to discuss another option? Contact the salon directly: <a href="${contactHref}">${contactHref.replace(/^mailto:|^tel:/, "")}</a>`) : ""}
      `;
    }

    const html = wrapEmailTemplate(content, {
      mode: "salon",
      salonName: tenant?.name || "Salon",
      salonLogoUrl: tenant?.logo_url || undefined,
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: buildFromAddress({
          fromEmail,
          mode: "salon",
          salonName: tenant?.name || "Salon",
        }),
        to: customer.email,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("send-booking-approval-email resend error:", errorText);
      throw new Error("Failed to send booking approval email");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-booking-approval-email error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
