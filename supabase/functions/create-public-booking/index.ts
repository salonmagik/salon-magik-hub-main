import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  createTenantNotification,
  getSalonRecipients,
  getTenantNotificationSettings,
  sendResendEmail,
} from "../_shared/salon-notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DeliveryAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  deliveryNotes?: string;
}

interface GiftRecipient {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
  hideSender: boolean;
  address?: DeliveryAddress;
}

interface CartItem {
  id: string;
  type: "service" | "package" | "product";
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  durationMinutes?: number;
  scheduleMode?: "schedule_now" | "leave_unscheduled";
  scheduledDate?: string;
  scheduledTime?: string;
  selectedStaffId?: string | null;
  isGift: boolean;
  fulfillmentType?: "pickup" | "delivery";
  giftRecipient?: GiftRecipient;
  locationId?: string;
  locationName?: string;
  serviceIds?: string[];
}

interface BookingRequest {
  tenantId: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    notes?: string;
    deliveryAddress?: DeliveryAddress;
  };
  items: CartItem[];
  payAtSalon?: boolean;
  voucherCode?: string | null;
  voucherDiscount?: number;
  purseAmount?: number;
  depositAmount?: number;
  giftsBelongToSamePerson?: boolean;
  // Payment session creation fields (optional)
  createPaymentSession?: boolean;
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentDescription?: string;
  paymentIsDeposit?: boolean;
  paymentSuccessUrl?: string;
  paymentCancelUrl?: string;
  preferredPaymentGateway?: "stripe" | "paystack";
  // Split payment fields
  splitPurseAmount?: number;
  splitCustomerId?: string;
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

function normalizePhone(phone?: string | null) {
  return phone?.replace(/[^\d]/g, "") || "";
}

function isDeliveryAddressComplete(address?: DeliveryAddress) {
  return Boolean(address?.line1?.trim() && address?.city?.trim() && address?.country?.trim());
}

function formatLineSchedule(item: CartItem) {
  if (item.type === "product") {
    return item.fulfillmentType === "delivery" ? "Delivery" : "Pickup at salon";
  }

  if (item.scheduleMode === "leave_unscheduled") {
    return "Leave unscheduled";
  }

  if (item.scheduledDate && item.scheduledTime) {
    return `${item.scheduledDate} at ${item.scheduledTime}`;
  }

  return "Schedule pending";
}

function renderBookingSummary(items: CartItem[], currency: string) {
  return items
    .map((item) => {
      const branchName = item.locationName || "Main branch";
      const quantityText = item.quantity > 1 ? ` x${item.quantity}` : "";
      const fulfillment = item.type === "product"
        ? `<div><strong>Fulfillment:</strong> ${item.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}</div>`
        : "";
      const staff = item.selectedStaffId ? `<div><strong>Staff selected:</strong> Assigned by salon preference</div>` : "";

      return `
        <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin: 0 0 12px 0;">
          <div style="font-weight: 600; margin-bottom: 6px;">${item.name}${quantityText}</div>
          <div><strong>Type:</strong> ${item.type}</div>
          <div><strong>Branch:</strong> ${branchName}</div>
          <div><strong>When:</strong> ${formatLineSchedule(item)}</div>
          ${fulfillment}
          ${staff}
          <div><strong>Amount:</strong> ${currency} ${(item.price * item.quantity).toFixed(2)}</div>
        </div>
      `;
    })
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: BookingRequest = await req.json();
    const {
      tenantId,
      customer,
      items,
      payAtSalon,
      voucherDiscount = 0,
      purseAmount = 0,
      depositAmount = 0,
      giftsBelongToSamePerson = true,
      createPaymentSession = false,
      paymentAmount,
      paymentCurrency,
      paymentDescription,
      paymentIsDeposit = false,
      paymentSuccessUrl,
      paymentCancelUrl,
      preferredPaymentGateway,
      splitPurseAmount,
      splitCustomerId,
    } = body;

    console.log("Payment session params:", { 
      createPaymentSession, 
      paymentAmount, 
      paymentCurrency, 
      preferredPaymentGateway,
      paymentSuccessUrl 
    });

    if (!tenantId || !customer.email || !customer.firstName || !customer.lastName || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, online_booking_enabled, auto_confirm_bookings, currency, country, allow_staff_selection, require_staff_selection, auto_assign_staff")
      .eq("id", tenantId)
      .eq("online_booking_enabled", true)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Salon not found or booking not enabled" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customerFullName = `${customer.firstName} ${customer.lastName}`;
    const normalizedEmail = normalizeEmail(customer.email);
    const normalizedPhone = normalizePhone(customer.phone);

    const { data: tenantCustomers, error: tenantCustomersError } = await supabase
      .from("customers")
      .select("id, email, phone, status")
      .eq("tenant_id", tenantId);

    if (tenantCustomersError) throw tenantCustomersError;

    // Use AND matching: both email AND phone must match to consider it the same customer
    // This prevents false matches when phone numbers are reused or shared
    const matches = (tenantCustomers || []).filter(
      (row) => {
        if (row.status === "deleted") return false;
        
        // Both email and phone must be present in both the new booking and existing customer
        const hasEmail = normalizedEmail && row.email;
        const hasPhone = normalizedPhone && row.phone;
        
        // Skip if either email or phone is missing from either side
        if (!hasEmail || !hasPhone) return false;
        
        // Both must match
        const emailMatch = normalizeEmail(row.email) === normalizedEmail;
        const phoneMatch = normalizePhone(row.phone) === normalizedPhone;
        
        return emailMatch && phoneMatch;
      }
    );

    const matchedIds = [...new Set(matches.map((row) => row.id))];

    if (matchedIds.length > 1) {
      return new Response(
        JSON.stringify({ error: "A customer conflict was found for this email and phone number. Please contact the salon." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let customerId: string;
    if (matchedIds.length === 1) {
      customerId = matchedIds[0];
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          full_name: customerFullName,
          email: normalizedEmail,
          phone: customer.phone?.trim() || null,
        })
        .select("id")
        .single();

      if (customerError || !newCustomer) {
        return new Response(
          JSON.stringify({ error: customerError?.message || "Failed to create customer" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      customerId = newCustomer.id;
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const reference = `BK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const createdAppointmentIds: string[] = [];

    for (const item of items) {
      if (!item.locationId) {
        return new Response(
          JSON.stringify({ error: `Please select a branch for ${item.name}.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if ((item.type === "service" || item.type === "package") && item.scheduleMode !== "leave_unscheduled") {
        if (!item.scheduledDate || !item.scheduledTime) {
          return new Response(
            JSON.stringify({ error: `Please schedule ${item.name} before continuing.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (item.type === "product" && item.fulfillmentType === "delivery" && !item.isGift && !isDeliveryAddressComplete(customer.deliveryAddress)) {
        return new Response(
          JSON.stringify({ error: `Please enter a delivery address for ${item.name}.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (item.type === "product" && item.fulfillmentType === "delivery" && item.isGift && !isDeliveryAddressComplete(item.giftRecipient?.address)) {
        return new Response(
          JSON.stringify({ error: `Please enter the gift delivery address for ${item.name}.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let scheduledStart: string | null = null;
      let scheduledEnd: string | null = null;

      if ((item.type === "service" || item.type === "package") && item.scheduleMode !== "leave_unscheduled") {
        scheduledStart = `${item.scheduledDate}T${item.scheduledTime}:00`;
        const startDate = new Date(scheduledStart);
        const endDate = new Date(startDate.getTime() + (item.durationMinutes || 60) * 60 * 1000);
        scheduledEnd = endDate.toISOString();
      }

      const windowCheckStart = scheduledStart ? new Date(scheduledStart).toISOString() : new Date().toISOString();
      const windowCheckEnd =
        scheduledEnd ||
        new Date(new Date(windowCheckStart).getTime() + Math.max(item.durationMinutes || 1, 1) * 60 * 1000).toISOString();

      const { data: activeWindow } = await (supabase as any)
        .from("branch_unavailability_windows")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("location_id", item.locationId)
        .is("ended_at", null)
        .lte("starts_at", windowCheckEnd)
        .or(`ends_at.is.null,ends_at.gte.${windowCheckStart}`)
        .limit(1)
        .maybeSingle();

      if (activeWindow) {
        return new Response(
          JSON.stringify({ error: `${item.locationName || "This branch"} is temporarily unavailable for ${item.name}.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let assignedStaffId: string | null = null;
      const serviceIds = item.type === "service" ? [item.itemId] : item.type === "package" ? item.serviceIds || null : null;
      if ((item.type === "service" || item.type === "package") && item.locationId) {
        const { data: eligibleStaffRows } = await supabase.rpc("list_public_booking_eligible_staff", {
          p_tenant_id: tenantId,
          p_location_id: item.locationId,
          p_service_ids: serviceIds && serviceIds.length > 0 ? serviceIds : null,
        });

        const eligibleStaff = (eligibleStaffRows || []) as Array<{ user_id: string }>;
        if (item.selectedStaffId) {
          if (!tenant.allow_staff_selection) {
            return new Response(
              JSON.stringify({ error: "Staff selection is not enabled for this booking site" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (!eligibleStaff.some((staff) => staff.user_id === item.selectedStaffId)) {
            return new Response(
              JSON.stringify({ error: `Selected staff member is not eligible for ${item.name}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          assignedStaffId = item.selectedStaffId;
        } else if (tenant.require_staff_selection && item.scheduleMode !== "leave_unscheduled") {
          return new Response(
            JSON.stringify({ error: `Staff selection is required for ${item.name}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else if (tenant.auto_assign_staff && eligibleStaff.length > 0 && item.scheduleMode !== "leave_unscheduled") {
          assignedStaffId = eligibleStaff[0].user_id;
        }
      }

      const recipient = item.isGift ? item.giftRecipient : null;
      const deliveryAddress =
        item.type === "product" && item.fulfillmentType === "delivery"
          ? item.isGift
            ? recipient?.address || null
            : customer.deliveryAddress || null
          : null;

      const bookingMetadata = {
        source: "public_booking",
        booking_reference: reference,
        line_item: {
          id: item.id,
          type: item.type,
          item_id: item.itemId,
          name: item.name,
          quantity: item.quantity,
          fulfillment_type: item.fulfillmentType || null,
          branch_id: item.locationId,
          branch_name: item.locationName || null,
          schedule_mode: item.scheduleMode || null,
        },
        gift: item.isGift
          ? {
              recipient,
              shared_recipient: giftsBelongToSamePerson,
            }
          : null,
        delivery_address: deliveryAddress,
      };

      const lineTotal = item.price * item.quantity;
      const { data: appointment, error: appointmentError } = await supabase
        .from("appointments")
        .insert({
          tenant_id: tenantId,
          customer_id: customerId,
          location_id: item.locationId,
          assigned_staff_id: assignedStaffId,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          is_unscheduled: !scheduledStart,
          is_gifted: item.isGift,
          status: "scheduled",
          payment_status: payAtSalon ? "pay_at_salon" : "unpaid",
          total_amount: lineTotal,
          notes: customer.notes || null,
          booking_reference: reference,
          booking_metadata: bookingMetadata,
        })
        .select("id")
        .single();

      if (appointmentError || !appointment) {
        console.error("Error creating appointment:", appointmentError);
        return new Response(
          JSON.stringify({ error: `Failed to create appointment for ${item.name}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      createdAppointmentIds.push(appointment.id);

      if (item.type === "service" || item.type === "package") {
        const { error: servicesError } = await supabase.from("appointment_services").insert({
          appointment_id: appointment.id,
          service_id: item.type === "service" ? item.itemId : null,
          package_id: item.type === "package" ? item.itemId : null,
          service_name: item.name,
          duration_minutes: item.durationMinutes || 60,
          price: item.price,
          status: "scheduled",
        });

        if (servicesError) console.error("Error adding appointment service:", servicesError);
      }

      if (item.type === "product") {
        const { error: productsError } = await supabase.from("appointment_products").insert({
          appointment_id: appointment.id,
          product_id: item.itemId,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          fulfillment_status: "pending",
        });
        if (productsError) console.error("Error adding appointment product:", productsError);
      }

    }

    const primaryAppointmentId = createdAppointmentIds[0] ?? null;
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const bookingSummaryHtml = renderBookingSummary(items, tenant.currency || "USD");
    const paymentLine = payAtSalon
      ? `<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Payment will be completed at the salon.</p>`
      : `<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Payment status: pending checkout completion.</p>`;

    await createTenantNotification(supabase, {
      tenantId,
      title: "New Booking",
      description: `${customerFullName} placed a booking for ${itemCount} ${itemCount === 1 ? "item" : "items"} (${reference}).`,
      entityId: primaryAppointmentId,
      urgent: false,
    });

    if (customer.email) {
      await sendResendEmail({
        resendApiKey,
        fromEmail: resendFromEmail,
        to: [customer.email],
        subject: `Booking received at ${tenant.name}`,
        salonName: tenant.name,
        htmlContent: `
          <h2 style="color: #2563EB; margin-bottom: 16px;">Your booking is in</h2>
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${customer.firstName},</p>
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">We’ve received your booking with <strong>${tenant.name}</strong>.</p>
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Booking reference:</strong> ${reference}</p>
          ${paymentLine}
          <div style="margin: 24px 0;">
            ${bookingSummaryHtml}
          </div>
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Total:</strong> ${tenant.currency || "USD"} ${totalAmount.toFixed(2)}</p>
        `,
      });
    }

    const notificationSettings = await getTenantNotificationSettings(supabase, tenantId);
    if (notificationSettings.email_new_bookings) {
      const recipients = await getSalonRecipients(supabase, tenantId, ["owner", "manager"]);
      if (recipients.length > 0) {
        await sendResendEmail({
          resendApiKey,
          fromEmail: resendFromEmail,
          to: recipients.map((recipient) => recipient.email),
          subject: `New booking at ${tenant.name}`,
          salonName: tenant.name,
          htmlContent: `
            <h2 style="color: #2563EB; margin-bottom: 16px;">New booking received</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Customer:</strong> ${customerFullName}</p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Booking reference:</strong> ${reference}</p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Total:</strong> ${tenant.currency || "USD"} ${totalAmount.toFixed(2)}</p>
            <div style="margin: 24px 0;">
              ${bookingSummaryHtml}
            </div>
          `,
        });
      }
    }

    // Optionally create payment session for online payment
    let checkoutUrl: string | null = null;
    let paymentGateway: string | null = null;

    console.log("Checking payment session creation condition:", {
      createPaymentSession,
      paymentAmount,
      check: createPaymentSession && paymentAmount && paymentAmount > 0
    });

    if (createPaymentSession && paymentAmount && paymentAmount > 0) {
      try {
        console.log("Creating payment session...");
        const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
        const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
        
        // Determine gateway based on preference or region
        const isPaystackRegion = ["NG", "GH", "Nigeria", "Ghana"].includes(tenant.country || "") ||
                            ["NGN", "GHS"].includes((paymentCurrency || tenant.currency || "USD").toUpperCase());
        const usePaystack = preferredPaymentGateway 
          ? preferredPaymentGateway === "paystack" 
          : isPaystackRegion;

        console.log("Payment gateway selection:", {
          usePaystack,
          isPaystackRegion,
          preferredPaymentGateway,
          hasPaystackKey: !!paystackSecretKey,
          hasStripeKey: !!stripeSecretKey,
          tenantCountry: tenant.country,
          paymentCurrency: paymentCurrency || tenant.currency
        });

      // Validate that we have the required secret key for the selected gateway
      if (usePaystack && !paystackSecretKey) {
        return new Response(
          JSON.stringify({ 
            error: "Paystack payment is not configured. Please contact the salon or try a different payment method." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!usePaystack && !stripeSecretKey) {
        console.error("Stripe key not configured but Stripe was selected");
        return new Response(
          JSON.stringify({ 
            error: "Stripe payment is not configured. Please contact the salon or try a different payment method." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const primaryAppointmentId = createdAppointmentIds[0];
      const sessionReference = `sm_${primaryAppointmentId.substring(0, 8)}_${Date.now()}`;
      
      // Store payment intent
      const { data: paymentIntent, error: paymentIntentError } = await supabase
        .from("payment_intents")
        .insert({
          tenant_id: tenantId,
          appointment_id: primaryAppointmentId,
          amount: paymentAmount,
          currency: (paymentCurrency || tenant.currency || "USD").toUpperCase(),
          customer_email: customer.email,
          customer_name: `${customer.firstName} ${customer.lastName}`,
          gateway: usePaystack ? "paystack" : "stripe",
          is_deposit: paymentIsDeposit,
          status: "pending",
          paystack_reference: usePaystack ? sessionReference : null,
          intent_type: "appointment_payment",
          metadata: {
            appointment_ids: createdAppointmentIds,
          },
        })
        .select("id")
        .single();

      if (paymentIntentError) {
        console.error("Failed to create payment intent:", paymentIntentError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to create payment record. Please try again." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (usePaystack && paystackSecretKey) {
        // Create Paystack transaction
        const amountInMinorUnits = Math.round(paymentAmount * 100);
        const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: customer.email,
            amount: amountInMinorUnits,
            currency: (paymentCurrency || tenant.currency || "USD").toUpperCase(),
            reference: sessionReference,
            callback_url: paymentSuccessUrl,
            metadata: {
              appointment_id: primaryAppointmentId,
              appointment_ids: createdAppointmentIds,
              payment_intent_id: paymentIntent?.id,
              tenant_id: tenantId,
              is_deposit: paymentIsDeposit,
              customer_name: `${customer.firstName} ${customer.lastName}`,
              intent_type: "appointment_payment",
              ...(splitPurseAmount && splitCustomerId ? {
                split_purse_amount: splitPurseAmount.toString(),
                split_customer_id: splitCustomerId,
              } : {}),
            },
          }),
        });

        const paystackData = await paystackResponse.json();
        console.log("Paystack API response:", { 
          ok: paystackResponse.ok, 
          status: paystackResponse.status,
          data: paystackData 
        });
        
        if (paystackResponse.ok && paystackData.status) {
          // Update payment intent with access code
          if (paymentIntent?.id) {
            await supabase
              .from("payment_intents")
              .update({
                paystack_access_code: paystackData.data.access_code,
                status: "processing",
              })
              .eq("id", paymentIntent.id);
          }
          checkoutUrl = paystackData.data.authorization_url;
          paymentGateway = "paystack";
        } else {
          console.error("Paystack payment initialization failed:", paystackData);
          
          // Provide user-friendly error messages
          let errorMessage = paystackData.message || "Unknown error";
          if (paystackData.code === "unsupported_currency") {
            errorMessage = `This payment method doesn't support ${(paymentCurrency || tenant.currency || "NGN").toUpperCase()}. Please contact the salon for alternative payment options.`;
          }
          
          return new Response(
            JSON.stringify({ 
              error: errorMessage
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (!usePaystack && stripeSecretKey) {
        // Create Stripe checkout session
        const amountInCents = Math.round(paymentAmount * 100);
        const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            "mode": "payment",
            "payment_method_types[0]": "card",
            "line_items[0][price_data][currency]": (paymentCurrency || tenant.currency || "USD").toLowerCase(),
            "line_items[0][price_data][product_data][name]": paymentDescription || "Booking Payment",
            "line_items[0][price_data][unit_amount]": amountInCents.toString(),
            "line_items[0][quantity]": "1",
            "customer_email": customer.email,
            "success_url": `${paymentSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
            "cancel_url": paymentCancelUrl || paymentSuccessUrl || "",
            "metadata[appointment_id]": primaryAppointmentId,
            "metadata[appointment_ids]": JSON.stringify(createdAppointmentIds),
            "metadata[payment_intent_id]": paymentIntent?.id || "",
            "metadata[tenant_id]": tenantId,
            "metadata[is_deposit]": paymentIsDeposit ? "true" : "false",
            "metadata[intent_type]": "appointment_payment",
            ...(splitPurseAmount && splitCustomerId ? {
              "metadata[split_purse_amount]": splitPurseAmount.toString(),
              "metadata[split_customer_id]": splitCustomerId,
            } : {}),
          }),
        });

        const stripeData = await stripeResponse.json();
        console.log("Stripe API response:", { 
          ok: stripeResponse.ok, 
          status: stripeResponse.status,
          data: stripeData 
        });
        
        if (stripeResponse.ok) {
          // Update payment intent with session ID
          if (paymentIntent?.id) {
            await supabase
              .from("payment_intents")
              .update({
                stripe_session_id: stripeData.id,
                status: "processing",
              })
              .eq("id", paymentIntent.id);
          }
          checkoutUrl = stripeData.url;
          paymentGateway = "stripe";
        } else {
          console.error("Stripe payment session creation failed:", stripeData);
          return new Response(
            JSON.stringify({ 
              error: `Payment initialization failed: ${stripeData.error?.message || "Unknown error"}` 
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      } catch (paymentError) {
        console.error("Payment session creation error:", paymentError);
        const errorMessage = paymentError instanceof Error ? paymentError.message : "Failed to create payment session";
        return new Response(
          JSON.stringify({ 
            error: `Payment session creation failed: ${errorMessage}` 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference,
        appointmentId: createdAppointmentIds[0],
        appointmentIds: createdAppointmentIds,
        checkoutUrl,
        paymentGateway,
        totals: {
          subtotal: totalAmount,
          voucherDiscount,
          purseAmount,
          depositAmount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error processing booking:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error details:", { message: errorMessage, stack: errorStack });
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorStack 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
