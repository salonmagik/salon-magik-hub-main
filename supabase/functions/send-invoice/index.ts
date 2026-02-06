import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 32px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">${tenant?.name || "Salon"}</h1>
        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Invoice</p>
      </div>
      
      <!-- Invoice Details -->
      <div style="padding: 32px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
          <div>
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Invoice Number</p>
            <p style="margin: 0; font-weight: 600; color: #111827;">${invoice.invoice_number}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Date</p>
            <p style="margin: 0; font-weight: 600; color: #111827;">${new Date(invoice.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        
        <div style="margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Bill To</p>
          <p style="margin: 0; font-weight: 600; color: #111827;">${customer.full_name}</p>
          <p style="margin: 4px 0 0 0; color: #6b7280;">${customer.email}</p>
        </div>
        
        <!-- Line Items -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Description</th>
              <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Qty</th>
              <th style="padding: 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Price</th>
              <th style="padding: 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>
        
        <!-- Totals -->
        <div style="border-top: 2px solid #e5e7eb; padding-top: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Subtotal</span>
            <span style="font-weight: 500;">${formatCurrency(invoice.subtotal, currency)}</span>
          </div>
          ${invoice.discount > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Discount</span>
            <span style="font-weight: 500; color: #10b981;">-${formatCurrency(invoice.discount, currency)}</span>
          </div>
          ` : ""}
          ${invoice.tax > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Tax</span>
            <span style="font-weight: 500;">${formatCurrency(invoice.tax, currency)}</span>
          </div>
          ` : ""}
          <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span style="font-size: 18px; font-weight: 600;">Total</span>
            <span style="font-size: 18px; font-weight: 600; color: #7c3aed;">${formatCurrency(invoice.total, currency)}</span>
          </div>
        </div>
        
        ${invoice.notes ? `
        <div style="margin-top: 24px; padding: 16px; background: #f9fafb; border-radius: 8px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Notes</p>
          <p style="margin: 0; color: #374151;">${invoice.notes}</p>
        </div>
        ` : ""}
      </div>
      
      <!-- Footer -->
      <div style="padding: 24px 32px; background: #f9fafb; text-align: center;">
        <p style="margin: 0; font-size: 14px; color: #6b7280;">Thank you for your business!</p>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">Powered by Salon Magik</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
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
