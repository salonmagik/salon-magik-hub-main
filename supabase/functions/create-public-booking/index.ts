import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CartItem {
  id: string;
  type: "service" | "package" | "product";
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  durationMinutes?: number;
  schedulingOption: string;
  isGift: boolean;
  giftRecipient?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    message?: string;
    hideSender: boolean;
  };
}

interface BookingRequest {
  tenantId: string;
  locationId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    notes?: string;
  };
  items: CartItem[];
  payAtSalon?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: BookingRequest = await req.json();
    const { tenantId, locationId, scheduledDate, scheduledTime, customer, items, payAtSalon } = body;

    // Validate required fields
    if (!tenantId || !customer.email || !customer.firstName || !customer.lastName || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify tenant exists and has online booking enabled
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, online_booking_enabled, auto_confirm_bookings, currency")
      .eq("id", tenantId)
      .eq("online_booking_enabled", true)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Salon not found or booking not enabled" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find or create customer
    const customerFullName = `${customer.firstName} ${customer.lastName}`;
    
    let { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", customer.email)
      .maybeSingle();

    let customerId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          full_name: customerFullName,
          email: customer.email,
          phone: customer.phone || null,
        })
        .select("id")
        .single();

      if (customerError || !newCustomer) {
        console.error("Error creating customer:", customerError);
        return new Response(
          JSON.stringify({ error: "Failed to create customer" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      customerId = newCustomer.id;
    }

    // Calculate totals
    let totalAmount = 0;
    let totalDuration = 0;
    
    for (const item of items) {
      totalAmount += item.price * item.quantity;
      if (item.type !== "product" && item.durationMinutes) {
        totalDuration += item.durationMinutes * item.quantity;
      }
    }

    // Parse scheduled start time
    let scheduledStart: string | null = null;
    let scheduledEnd: string | null = null;

    if (scheduledDate && scheduledTime && locationId) {
      scheduledStart = `${scheduledDate}T${scheduledTime}:00`;
      // Add duration to get end time
      const startDate = new Date(scheduledStart);
      const endDate = new Date(startDate.getTime() + totalDuration * 60 * 1000);
      scheduledEnd = endDate.toISOString();
    }

    // Generate reference number
    const reference = `BK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Check for gift items
    const hasGifts = items.some((item) => item.isGift);

    // Create appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        location_id: locationId || null,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        is_unscheduled: !scheduledStart,
        is_gifted: hasGifts,
        status: tenant.auto_confirm_bookings ? "scheduled" : "scheduled",
        payment_status: payAtSalon ? "pay_at_salon" : "unpaid",
        total_amount: totalAmount,
        notes: customer.notes || null,
      })
      .select("id")
      .single();

    if (appointmentError || !appointment) {
      console.error("Error creating appointment:", appointmentError);
      return new Response(
        JSON.stringify({ error: "Failed to create appointment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add services and products to appointment
    const serviceItems = items.filter((item) => item.type === "service" || item.type === "package");
    const productItems = items.filter((item) => item.type === "product");

    // Insert appointment services
    if (serviceItems.length > 0) {
      const servicesToInsert = serviceItems.map((item) => ({
        appointment_id: appointment.id,
        service_id: item.type === "service" ? item.itemId : null,
        package_id: item.type === "package" ? item.itemId : null,
        service_name: item.name,
        duration_minutes: item.durationMinutes || 60,
        price: item.price,
        status: "scheduled",
      }));

      const { error: servicesError } = await supabase
        .from("appointment_services")
        .insert(servicesToInsert);

      if (servicesError) {
        console.error("Error adding services:", servicesError);
      }
    }

    // Insert appointment products
    if (productItems.length > 0) {
      const productsToInsert = productItems.map((item) => ({
        appointment_id: appointment.id,
        product_id: item.itemId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        fulfillment_status: "pending",
      }));

      const { error: productsError } = await supabase
        .from("appointment_products")
        .insert(productsToInsert);

      if (productsError) {
        console.error("Error adding products:", productsError);
      }
    }

    // Create notification for salon
    await supabase.from("notifications").insert({
      tenant_id: tenantId,
      type: "new_booking",
      title: "New Booking",
      description: `${customerFullName} booked ${items.length} item(s) for ${new Intl.NumberFormat("en-US", { style: "currency", currency: tenant.currency }).format(totalAmount)}`,
      entity_type: "appointment",
      entity_id: appointment.id,
      urgent: false,
    });

    // TODO: Send confirmation email to customer

    return new Response(
      JSON.stringify({
        success: true,
        reference,
        appointmentId: appointment.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing booking:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
