import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createTenantNotification,
  getSalonRecipients,
  getTenantNotificationSettings,
  sendResendEmail,
} from "../_shared/salon-notifications.ts";
import { heading, paragraph, EMAIL_STYLES } from "../_shared/email-template.ts";
import {
  getPaystackKeyForCurrency,
  validateCurrencyMatch,
  determineEffectiveCurrency,
} from "../_shared/paystack-helpers.ts";

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
  // Purse-only payment fields
  processPursePayment?: boolean;
  pursePaymentCustomerId?: string;
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

function buildActionButton(url: string, label: string, variant: "primary" | "secondary" | "ghost" = "primary") {
  const styles =
    variant === "primary"
      ? `background:${EMAIL_STYLES.accentColor};color:${EMAIL_STYLES.primaryColor};border:1px solid ${EMAIL_STYLES.accentColor};`
      : variant === "secondary"
        ? `background:${EMAIL_STYLES.primaryLight};color:${EMAIL_STYLES.primaryColor};border:1px solid ${EMAIL_STYLES.primaryColor}33;`
        : `background:#ffffff;color:${EMAIL_STYLES.textColor};border:1px solid ${EMAIL_STYLES.borderColor};`;

  return `<a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;margin:0 8px 8px 0;font-family:${EMAIL_STYLES.fontFamily};${styles}">${label}</a>`;
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
      voucherCode,
      voucherDiscount: requestedVoucherDiscount = 0,
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
      processPursePayment = false,
      pursePaymentCustomerId,
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
      .select("id, name, online_booking_enabled, auto_confirm_bookings, currency, country, allow_staff_selection, require_staff_selection, auto_assign_staff, payment_setup_status")
      .eq("id", tenantId)
      .eq("online_booking_enabled", true)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Salon not found or booking not enabled" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Never trust catalog names, prices, availability, or package contents sent
    // by the browser. Voucher totals and payment amounts are derived from this
    // server-authoritative snapshot.
    for (const item of items) {
      if (!item.locationId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        return new Response(
          JSON.stringify({ error: "A valid branch and quantity are required for every item." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const catalogTable = item.type === "service"
        ? "services"
        : item.type === "package"
          ? "packages"
          : "products";
      const locationTable = item.type === "service"
        ? "service_locations"
        : item.type === "package"
          ? "package_locations"
          : "product_locations";
      const locationItemColumn = item.type === "service"
        ? "service_id"
        : item.type === "package"
          ? "package_id"
          : "product_id";

      const { data: catalogItem } = await supabase
        .from(catalogTable)
        .select("*")
        .eq("id", item.itemId)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle();
      const { data: locationItem } = await supabase
        .from(locationTable)
        .select("price_override, is_enabled")
        .eq("tenant_id", tenantId)
        .eq(locationItemColumn, item.itemId)
        .eq("location_id", item.locationId)
        .eq("is_enabled", true)
        .maybeSingle();

      if (!catalogItem || !locationItem) {
        return new Response(
          JSON.stringify({ error: `${item.name || "An item"} is no longer available at the selected branch.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const authoritativePrice = Number(locationItem.price_override ?? catalogItem.price);
      if (!Number.isFinite(authoritativePrice) || Math.abs(Number(item.price) - authoritativePrice) > 0.01) {
        return new Response(
          JSON.stringify({ error: `The price for ${catalogItem.name} changed. Review your booking and try again.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      item.name = catalogItem.name;
      item.price = authoritativePrice;
      if (item.type === "service") {
        item.durationMinutes = Number(catalogItem.duration_minutes || item.durationMinutes || 60);
      } else if (item.type === "product" && Number(catalogItem.stock_quantity) < item.quantity) {
        return new Response(
          JSON.stringify({ error: `There is not enough stock for ${catalogItem.name}.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } else if (item.type === "package") {
        const { data: packageItems } = await supabase
          .from("package_items")
          .select("service_id")
          .eq("package_id", item.itemId);
        item.serviceIds = (packageItems || []).map((entry) => entry.service_id);
        item.durationMinutes = Number(catalogItem.duration_minutes || item.durationMinutes || 60);
      }
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
    const salonAdminBaseUrl = Deno.env.get("SALON_ADMIN_BASE_URL") || "https://app.salonmagik.com/salon";
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let voucherDiscount = 0;
    let voucherBalanceAmount = 0;
    let appliedVoucherId: string | null = null;

    if (voucherCode) {
      const { data: voucher, error: voucherError } = await supabase
        .from("vouchers")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("code", voucherCode.trim().toUpperCase())
        .is("deleted_at", null)
        .maybeSingle();

      if (voucherError || !voucher) {
        return new Response(JSON.stringify({ error: "Voucher is invalid" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      if (
        !["active", "redeemed"].includes(voucher.status) ||
        Number(voucher.balance) <= 0 ||
        (voucher.starts_at && new Date(voucher.starts_at) > now) ||
        (voucher.expires_at && new Date(voucher.expires_at) <= now) ||
        Number(voucher.minimum_spend || 0) > totalAmount
      ) {
        return new Response(JSON.stringify({ error: "Voucher is not eligible for this booking" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (
        voucher.access_type === "private" &&
        (voucher.target_customer_id || voucher.claimed_by_customer_id) !== customerId
      ) {
        return new Response(JSON.stringify({ error: "This private voucher belongs to another customer" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (voucher.claimed_by_customer_id && voucher.claimed_by_customer_id !== customerId) {
        return new Response(JSON.stringify({ error: "This voucher has already been claimed" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const requestedLocations = [...new Set(items.map((item) => item.locationId).filter(Boolean))];
      const { data: enabledLocations } = await supabase
        .from("voucher_locations")
        .select("location_id")
        .eq("voucher_id", voucher.id)
        .eq("is_enabled", true)
        .in("location_id", requestedLocations);
      if ((enabledLocations || []).length !== requestedLocations.length) {
        return new Response(JSON.stringify({ error: "Voucher is not valid at the selected branch" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      appliedVoucherId = voucher.id;
      if (voucher.voucher_type === "gift") {
        const { error: claimError } = await supabase.rpc("claim_voucher_to_balance", {
          p_tenant_id: tenantId,
          p_customer_id: customerId,
          p_code: voucher.code,
        });
        if (claimError) {
          return new Response(JSON.stringify({ error: claimError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        voucherBalanceAmount = Math.min(Number(voucher.balance), totalAmount);
        voucherDiscount = voucherBalanceAmount;
      } else {
        const { count: totalRedemptions } = await supabase
          .from("voucher_redemptions")
          .select("*", { count: "exact", head: true })
          .eq("voucher_id", voucher.id)
          .eq("event_type", "redeem");
        const { count: customerRedemptions } = await supabase
          .from("voucher_redemptions")
          .select("*", { count: "exact", head: true })
          .eq("voucher_id", voucher.id)
          .eq("customer_id", customerId)
          .eq("event_type", "redeem");
        if (
          (voucher.max_redemptions && Number(totalRedemptions || 0) >= voucher.max_redemptions) ||
          Number(customerRedemptions || 0) >= Number(voucher.per_customer_limit || 1)
        ) {
          return new Response(JSON.stringify({ error: "Voucher redemption limit has been reached" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        voucherDiscount = voucher.discount_type === "percentage"
          ? Math.min(totalAmount, totalAmount * Math.min(Number(voucher.discount_value), 100) / 100)
          : Math.min(totalAmount, Number(voucher.discount_value));
      }

      if (Math.abs(Number(requestedVoucherDiscount || 0) - voucherDiscount) > 0.01) {
        return new Response(JSON.stringify({ error: "Voucher total changed. Review your booking and try again." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const promotionalDiscount = voucherBalanceAmount === 0 ? voucherDiscount : 0;
    const chargeableTotal = Math.max(0, totalAmount - promotionalDiscount);
    const reference = `BK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const createdAppointmentIds: string[] = [];
    const approvalRequired = tenant.auto_confirm_bookings === false;
    let allocatedPromotionDiscount = 0;

    for (const [itemIndex, item] of items.entries()) {
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
        voucher: appliedVoucherId
          ? {
            voucher_id: appliedVoucherId,
            discount_amount: voucherDiscount,
            stored_value_amount: voucherBalanceAmount,
          }
          : null,
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

      const rawLineTotal = item.price * item.quantity;
      const linePromotionDiscount = promotionalDiscount <= 0
        ? 0
        : itemIndex === items.length - 1
          ? promotionalDiscount - allocatedPromotionDiscount
          : Number(((rawLineTotal / totalAmount) * promotionalDiscount).toFixed(2));
      allocatedPromotionDiscount += linePromotionDiscount;
      const lineTotal = Math.max(0, Number((rawLineTotal - linePromotionDiscount).toFixed(2)));
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
          payment_status: "unpaid",
          confirmation_status: approvalRequired ? "pending" : "confirmed",
          approval_status: approvalRequired ? "pending" : "approved",
          approval_requested_at: approvalRequired ? new Date().toISOString() : null,
          customer_response_status: approvalRequired ? "pending" : "not_required",
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

    const selectedBalanceAmount = Number(
      splitPurseAmount && splitPurseAmount > 0
        ? splitPurseAmount
        : processPursePayment && paymentAmount
          ? paymentAmount
          : purseAmount || 0,
    );
    const totalBalanceReservation = Math.min(
      Math.max(0, voucherBalanceAmount + selectedBalanceAmount),
      chargeableTotal,
    );

    if (!approvalRequired && totalBalanceReservation > 0 && createdAppointmentIds[0]) {
      const { error: reservationError } = await supabase.rpc("reserve_customer_balance", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_appointment_id: createdAppointmentIds[0],
        p_amount: totalBalanceReservation,
      });
      if (reservationError) {
        throw new Error(`Failed to reserve salon balance: ${reservationError.message}`);
      }

      const perAppointmentBalance = totalBalanceReservation / createdAppointmentIds.length;
      for (const appointmentId of createdAppointmentIds) {
        const { data: appointment } = await supabase
          .from("appointments")
          .select("amount_paid, total_amount")
          .eq("id", appointmentId)
          .single();
        const nextPaid = Number(appointment?.amount_paid || 0) + perAppointmentBalance;
        await supabase
          .from("appointments")
          .update({
            amount_paid: nextPaid,
            purse_amount_used: perAppointmentBalance,
            payment_status: nextPaid >= Number(appointment?.total_amount || 0) ? "fully_paid" : "deposit_paid",
          })
          .eq("id", appointmentId);
      }
    }

    if (appliedVoucherId && voucherDiscount > 0 && voucherBalanceAmount === 0) {
      await supabase.from("voucher_redemptions").insert({
        tenant_id: tenantId,
        voucher_id: appliedVoucherId,
        customer_id: customerId,
        appointment_id: createdAppointmentIds[0] || null,
        event_type: "redeem",
        amount: voucherBalanceAmount,
        discount_amount: voucherDiscount,
      });
    }

    const primaryAppointmentId = createdAppointmentIds[0] ?? null;
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const bookingSummaryHtml = renderBookingSummary(items, tenant.currency || "USD");
    const paymentLine = approvalRequired
      ? paragraph("This booking requires salon approval before payment. If accepted, we will send an invoice to your email and client portal.")
      : paragraph("Payment status: pending checkout completion.");
    const hasServiceLikeItems = items.some((item) => item.type === "service" || item.type === "package");
    const hasProductOnlyItems = items.every((item) => item.type === "product");
    const isSingleReviewItem = items.length === 1;
    const reviewBaseUrl = `${salonAdminBaseUrl.replace(/\/$/, "")}/appointments?tab=unconfirmed&bookingRef=${encodeURIComponent(reference)}`;
    const reviewActionsHtml = approvalRequired
      ? isSingleReviewItem && hasServiceLikeItems
        ? `
          <div style="margin:24px 0 8px;">
            ${buildActionButton(`${reviewBaseUrl}&approvalAction=approve`, "Accept")}
            ${buildActionButton(`${reviewBaseUrl}&approvalAction=reschedule`, "Reschedule", "secondary")}
            ${buildActionButton(`${reviewBaseUrl}&approvalAction=decline`, "Decline", "ghost")}
          </div>
        `
        : isSingleReviewItem && hasProductOnlyItems
          ? `
            <div style="margin:24px 0 8px;">
              ${buildActionButton(`${reviewBaseUrl}&approvalAction=approve`, "Accept")}
              ${buildActionButton(`${reviewBaseUrl}&approvalAction=decline`, "Decline", "ghost")}
            </div>
          `
          : `
            <div style="margin:24px 0 8px;">
              ${buildActionButton(`${reviewBaseUrl}&approvalAction=review`, "Review order")}
            </div>
          `
      : "";

    await createTenantNotification(supabase, {
      tenantId,
      title: approvalRequired ? "Booking requires confirmation" : "New Booking",
      description: `${customerFullName} placed a booking for ${itemCount} ${itemCount === 1 ? "item" : "items"} (${reference}).`,
      entityId: primaryAppointmentId,
      urgent: approvalRequired,
    });

    if (customer.email) {
      await sendResendEmail({
        resendApiKey,
        fromEmail: resendFromEmail,
        to: [customer.email],
        subject: approvalRequired ? `Booking review started at ${tenant.name}` : `Booking received at ${tenant.name}`,
        salonName: tenant.name,
        htmlContent:
          heading(approvalRequired ? "Your booking is awaiting review" : "Your booking is in") +
          paragraph(`Hi ${customer.firstName},`) +
          paragraph(`We’ve received your booking with <strong>${tenant.name}</strong>.`) +
          paragraph(`<strong>Booking reference:</strong> ${reference}`) +
          paymentLine +
          `<div style="margin: 24px 0;">${bookingSummaryHtml}</div>` +
          (promotionalDiscount > 0
            ? paragraph(`<strong>Voucher discount:</strong> -${tenant.currency || "USD"} ${promotionalDiscount.toFixed(2)}`)
            : "") +
          paragraph(`<strong>Total:</strong> ${tenant.currency || "USD"} ${chargeableTotal.toFixed(2)}`),
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
          subject: approvalRequired ? `Booking approval required at ${tenant.name}` : `New booking at ${tenant.name}`,
          salonName: tenant.name,
          htmlContent:
            heading(approvalRequired ? "Booking approval required" : "New booking received") +
            paragraph(`<strong>Customer:</strong> ${customerFullName}`) +
            paragraph(`<strong>Booking reference:</strong> ${reference}`) +
            (promotionalDiscount > 0
              ? paragraph(`<strong>Voucher discount:</strong> -${tenant.currency || "USD"} ${promotionalDiscount.toFixed(2)}`)
              : "") +
            paragraph(`<strong>Total:</strong> ${tenant.currency || "USD"} ${chargeableTotal.toFixed(2)}`) +
            `<div style="margin: 24px 0;">${bookingSummaryHtml}</div>` +
            reviewActionsHtml,
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

    if (!approvalRequired && createPaymentSession && paymentAmount && paymentAmount > 0) {
      try {
        console.log("Creating payment session...");
        const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

        // Determine effective currency with fallback
        const effectiveCurrency = determineEffectiveCurrency(paymentCurrency, tenant.currency);

        if (!effectiveCurrency) {
          return new Response(
            JSON.stringify({ error: "Currency is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate currency consistency
        const currencyValidation = validateCurrencyMatch(tenant.currency, effectiveCurrency);
        if (!currencyValidation.isValid) {
          return new Response(
            JSON.stringify({ error: currencyValidation.error }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Determine gateway based on preference or region
        const isPaystackRegion = ["NG", "GH", "Nigeria", "Ghana"].includes(tenant.country || "") ||
          ["NGN", "GHS"].includes(effectiveCurrency.toUpperCase());
        const usePaystack = preferredPaymentGateway
          ? preferredPaymentGateway === "paystack"
          : isPaystackRegion;

        // Get currency-specific Paystack key if needed
        let paystackSecretKey: string | null = null;
        if (usePaystack) {
          const paystackKeyResult = getPaystackKeyForCurrency(effectiveCurrency);
          if (paystackKeyResult.error || !paystackKeyResult.key) {
            return new Response(
              JSON.stringify({
                error: paystackKeyResult.error || "Paystack not configured for this currency"
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          paystackSecretKey = paystackKeyResult.key;
        }

        console.log("Payment gateway selection:", {
          usePaystack,
          isPaystackRegion,
          preferredPaymentGateway,
          hasPaystackKey: !!paystackSecretKey,
          hasStripeKey: !!stripeSecretKey,
          tenantCountry: tenant.country,
          effectiveCurrency
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

        if (usePaystack && tenant.payment_setup_status !== 'ready') {
          return new Response(
            JSON.stringify({
              error: "The salon is not ready to accept online payments at this time. Please contact them or try again later."
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let storeSubaccountCode: string | null = null;
        // let customerChargedAmount = paymentAmount;
        // let processingFeeAmount = 0;
        // const processingFeeRate = 0.01;

        if (usePaystack) {
          const { data: payoutDest } = await supabase
            .from("salon_payout_destinations")
            .select("paystack_subaccount_code")
            .eq("tenant_id", tenantId)
            .eq("is_default", true)
            .single();

          if (payoutDest?.paystack_subaccount_code) {
            storeSubaccountCode = payoutDest.paystack_subaccount_code;
            // processingFeeAmount = parseFloat((paymentAmount * processingFeeRate).toFixed(2));
            // customerChargedAmount = paymentAmount + processingFeeAmount;
          }
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
            currency: effectiveCurrency.toUpperCase(),
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

          console.log("Creating Paystack transaction with split payment metadata:", {
            splitPurseAmount,
            splitCustomerId,
            hasMetadata: !!(splitPurseAmount && splitCustomerId)
          });

          const paystackPayload: any = {
            email: customer.email,
            amount: amountInMinorUnits,
            currency: effectiveCurrency.toUpperCase(),
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
              service_amount: paymentAmount,
              // processing_fee_rate: processingFeeRate,
              // processing_fee_amount: processingFeeAmount,
              // customer_charged_amount: customerChargedAmount,
              store_subaccount_code: storeSubaccountCode || "",
            },
          };

          if (storeSubaccountCode) {
            paystackPayload.subaccount = storeSubaccountCode;
          }

          console.log('Paystack payment initiation', paystackPayload)

          const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${paystackSecretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(paystackPayload),
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
              errorMessage = `This payment method doesn't support ${effectiveCurrency.toUpperCase()}. Please contact the salon for alternative payment options.`;
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

    // Process purse-only payment if requested (mimics webhook behavior for security and idempotency)
    if (!approvalRequired && processPursePayment && pursePaymentCustomerId && paymentAmount && paymentAmount > 0) {
      console.log(`Processing purse-only payment: ${paymentAmount} for customer ${pursePaymentCustomerId}`);

      try {
        const primaryAppointmentId = createdAppointmentIds[0];
        const idempotencyKey = `purse_only_${primaryAppointmentId}_${Date.now()}`;

        // Update appointments to fully_paid status
        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            payment_status: "fully_paid",
            amount_paid: totalBalanceReservation / createdAppointmentIds.length,
            purse_amount_used: totalBalanceReservation / createdAppointmentIds.length,
            updated_at: new Date().toISOString(),
          })
          .in("id", createdAppointmentIds);

        if (updateError) {
          console.error("Error updating appointment payment status:", updateError);
        }

        // Create transaction record
        const { error: transactionError } = await supabase.from("transactions").insert({
          tenant_id: tenantId,
          customer_id: pursePaymentCustomerId,
          appointment_id: primaryAppointmentId,
          type: "payment",
          amount: totalBalanceReservation,
          currency: tenant.currency,
          method: "purse",
          provider: "internal",
          provider_reference: idempotencyKey,
          status: "completed",
        });

        if (transactionError) {
          console.error("Error creating transaction record:", transactionError);
        }

        // Send appointment notification (same as webhook does)
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-appointment-notification`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              appointmentId: primaryAppointmentId,
              action: "scheduled",
            }),
          });
        } catch (emailError) {
          console.error("Error sending appointment notification:", emailError);
        }

      } catch (purseError) {
        console.error("Exception processing purse payment:", purseError);
        throw purseError; // Re-throw to return error to client
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
        requiresApproval: approvalRequired,
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
