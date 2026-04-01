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
    } = body;

    if (!tenantId || !customer.email || !customer.firstName || !customer.lastName || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, online_booking_enabled, auto_confirm_bookings, currency, allow_staff_selection, require_staff_selection, auto_assign_staff")
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

    const emailMatches = (tenantCustomers || []).filter(
      (row) => row.status !== "deleted" && normalizedEmail && normalizeEmail(row.email) === normalizedEmail,
    );
    const phoneMatches = (tenantCustomers || []).filter(
      (row) => row.status !== "deleted" && normalizedPhone && normalizePhone(row.phone) === normalizedPhone,
    );
    const matchedIds = [...new Set([...emailMatches, ...phoneMatches].map((row) => row.id))];

    if (matchedIds.length > 1) {
      return new Response(
        JSON.stringify({ error: "A customer conflict was found for this email or phone number. Please contact the salon." }),
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

    return new Response(
      JSON.stringify({
        success: true,
        reference,
        appointmentId: createdAppointmentIds[0],
        appointmentIds: createdAppointmentIds,
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
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
