import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  wrapEmailTemplate,
  paragraph,
  heading,
  createButton,
  smallText,
  getSenderName,
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvoiceEmailData {
  invoiceId: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { invoiceId }: InvoiceEmailData = await req.json();

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: "invoiceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        customers (id, full_name, email),
        tenants (id, name, currency),
        invoice_line_items (*)
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = invoice.customers as { full_name: string; email: string } | null;
    const tenant = invoice.tenants as { name: string; currency: string } | null;
    const lineItems = invoice.invoice_line_items as Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;

    if (!customer?.email) {
      return new Response(
        JSON.stringify({ error: "Customer email not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format currency
    const formatCurrency = (amount: number, currency: string) => {
      const symbols: Record<string, string> = {
        USD: "$",
        NGN: "₦",
        GHS: "₵",
        GBP: "£",
        EUR: "€",
      };
      const symbol = symbols[currency] || currency + " ";
      return `${symbol}${Number(amount).toFixed(2)}`;
    };

    const currency = tenant?.currency || "USD";

    // Generate HTML invoice
    const lineItemsHtml = lineItems
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unit_price, currency)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.total_price, currency)}</td>
        </tr>
      `
      )
      .join("");

    const content = `
      ${heading(`Invoice ${invoice.invoice_number}`)}
      ${paragraph(`Hi ${customer.full_name},`)}
      ${paragraph(`Here is your invoice from <strong>${tenant?.name || "Salon"}</strong>.`)}
      ${paragraph(`Total: <strong>${formatCurrency(invoice.total, currency)}</strong>`)}
      ${createButton("View & pay invoice", invoice.payment_link || `${Deno.env.get("APP_URL") || ""}/invoices/${invoice.id}`)}
      ${smallText("If you have any questions, reply to this email and we’ll help.")} 
    `;

    const emailHtml = wrapEmailTemplate(content, {
      mode: "salon",
      salonName: tenant?.name || "Salon",
      salonLogoUrl: tenant?.logo_url || undefined,
    });

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${getSenderName({ mode: "salon", salonName: tenant?.name || "Salon" }).replace(/[<>"\n\r]/g, "").trim()} <${fromEmail}>`,
        to: customer.email,
        subject: `Invoice ${invoice.invoice_number} from ${tenant?.name || "Salon"}`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend error:", errorText);
      throw new Error("Failed to send email");
    }

    // Update invoice status
    await supabase
      .from("invoices")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", invoiceId);

    // Log the message
    await supabase.from("message_logs").insert({
      tenant_id: invoice.tenant_id,
      customer_id: invoice.customer_id,
      template_type: "invoice",
      channel: "email",
      recipient: customer.email,
      subject: `Invoice ${invoice.invoice_number}`,
      status: "sent",
      credits_used: 1,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Invoice sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending invoice:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
