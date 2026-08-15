import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildReceiptPdf, type ReceiptLineItem } from "../_shared/pdf-receipt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  appointmentId: string;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    if (!body.appointmentId) {
      return new Response(JSON.stringify({ error: "appointmentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select(`
        id, tenant_id, customer_id, scheduled_start, total_amount, deposit_amount,
        purse_amount_used, amount_paid, payment_status,
        services:appointment_services(service_name, price, duration_minutes, created_at),
        products:appointment_products(product_name, quantity, total_price),
        customer:customers!appointments_customer_id_fkey(id, user_id, full_name, email, phone),
        tenant:tenants(id, name, currency),
        location:locations(name, address, city)
      `)
      .eq("id", body.appointmentId)
      .single();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caller must be either the customer this booking belongs to, or an
    // active staff member of the tenant — same ownership check pattern as
    // respond-booking-reschedule, plus a tenant-staff allowance so an owner
    // can pull a copy on a customer's behalf (per the approved design).
    const customer = appointment.customer as unknown as { id: string; user_id: string | null; full_name: string; email: string | null; phone: string | null } | null;
    const isOwningCustomer = Boolean(customer?.user_id && customer.user_id === user.id);

    let isTenantStaff = false;
    if (!isOwningCustomer) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("id")
        .eq("tenant_id", appointment.tenant_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      isTenantStaff = Boolean(roleRow);
    }

    if (!isOwningCustomer && !isTenantStaff) {
      return new Response(JSON.stringify({ error: "Not authorized to view this receipt" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenant = appointment.tenant as unknown as { id: string; name: string; currency: string } | null;
    const location = appointment.location as unknown as { name: string | null; address: string | null; city: string | null } | null;
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reuse the invoice_number an invoice row already auto-created on
    // booking payment (payment-webhook-processor.ts) — fall back to
    // generating one on the fly for older/offline bookings that predate it.
    const { data: invoiceRow } = await admin
      .from("invoices")
      .select("invoice_number")
      .eq("appointment_id", appointment.id)
      .maybeSingle();

    let reference = invoiceRow?.invoice_number as string | undefined;
    if (!reference) {
      const { data: generated } = await admin.rpc("generate_invoice_number", { _tenant_id: appointment.tenant_id });
      reference = (generated as string) || appointment.id;
    }

    const { data: transaction } = await admin
      .from("transactions")
      .select("method, provider, provider_reference, paystack_reference, created_at")
      .eq("appointment_id", appointment.id)
      .eq("type", "payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currency = tenant.currency || "USD";
    const services = (appointment.services as { service_name: string; price: number; duration_minutes: number }[]) || [];
    const products = (appointment.products as { product_name: string; quantity: number; total_price: number }[]) || [];

    const lineItems: ReceiptLineItem[] = [
      ...services.map((s) => ({ label: s.service_name, sublabel: `${s.duration_minutes} min`, amount: Number(s.price) })),
      ...products.map((p) => ({ label: p.product_name, sublabel: `Qty: ${p.quantity}`, amount: Number(p.total_price) })),
    ];

    const deductions: ReceiptLineItem[] = [];
    if (Number(appointment.purse_amount_used) > 0) {
      deductions.push({ label: "Store credit applied", amount: Number(appointment.purse_amount_used) });
    }

    const methodLabels: Record<string, string> = {
      card: "Card",
      mobile_money: "Mobile Money",
      cash: "Cash",
      pos: "POS",
      transfer: "Transfer",
      purse: "Store credit",
    };
    const paymentLines: string[] = [];
    if (transaction?.created_at) paymentLines.push(formatDateTime(transaction.created_at));
    if (transaction?.method) {
      const methodLabel = methodLabels[transaction.method] || transaction.method;
      paymentLines.push(transaction.provider ? `${methodLabel} via ${transaction.provider}` : methodLabel);
    }
    const gatewayRef = transaction?.provider_reference || transaction?.paystack_reference;
    if (gatewayRef) paymentLines.push(`Ref: ${gatewayRef}`);

    const billedToLines: string[] = [];
    if (customer?.email) billedToLines.push(customer.email);
    if (customer?.phone) billedToLines.push(customer.phone);

    const isFullyPaid = Number(appointment.amount_paid) >= Number(appointment.total_amount);
    const locationLine = location?.name ? `${location.name}${location.city ? `, ${location.city}` : ""}` : undefined;

    const pdfBytes = await buildReceiptPdf({
      brand: "salon",
      brandName: tenant.name,
      brandSubtitle: locationLine,
      reference,
      billedToName: customer?.full_name || "Guest",
      billedToLines,
      paymentLines,
      lineItems,
      deductions,
      total: Number(appointment.amount_paid),
      currency,
      statusLabel: isFullyPaid ? "PAID IN FULL" : "PARTIALLY PAID",
      statusTone: isFullyPaid ? "success" : "pending",
      footerThanks: `Thank you for choosing ${tenant.name}.`,
      footerLines: [
        [tenant.name, location?.address, location?.city].filter(Boolean).join(" · "),
        "© 2026 Salon Magik — a product of The Gray Avenue LTD. All rights reserved.",
      ].filter(Boolean),
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${reference}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("generate-booking-receipt error:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
