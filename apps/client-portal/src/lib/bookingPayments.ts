import { supabase } from "@/lib/supabase";

interface StartClientBookingPaymentInput {
  tenantId: string;
  appointmentIds: string[];
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export async function startClientBookingPayment(input: StartClientBookingPaymentInput) {
  const primaryAppointmentId = input.appointmentIds[0];
  if (!primaryAppointmentId) {
    throw new Error("No appointment selected for payment");
  }

  const { data, error } = await supabase.functions.invoke("create-payment-session", {
    body: {
      tenantId: input.tenantId,
      appointmentId: primaryAppointmentId,
      appointmentIds: input.appointmentIds,
      amount: input.amount,
      currency: input.currency,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      description: input.description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      preferredGateway: "paystack",
      intentType: "appointment_payment",
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to create payment session");
  }

  const checkoutUrl = data?.checkoutUrl || data?.paymentUrl;
  if (!checkoutUrl) {
    throw new Error("Payment URL not received");
  }

  window.location.href = checkoutUrl;
}
