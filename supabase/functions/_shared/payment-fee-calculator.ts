/** Booking fees and salon wallet share. All collections settle to the platform. */

export interface BookingChargeInput {
  /** True price owed for the service, in major currency units (e.g. naira, not kobo). */
  servicePrice: number;
  /** Salon Magik's platform service charge, as a percent (e.g. 0.5 for 0.5%). */
  platformServiceChargePercent: number;
  /** Salon Magik's separate, always-customer-facing fee, as a percent. */
  customerFacingFeePercent: number;
  /** If true, the salon's own platform service charge is billed to the customer instead of deducted from the salon's share. */
  serviceChargeBorneByCustomer: boolean;
}

export interface BookingChargeResult {
  /** Amount to send as `amount` on /transaction/initialize, major units. */
  amountToChargePaystack: number;
  /** Amount credited to the salon wallet after platform fees. */
  salonNetAmount: number;
  /** Salon Magik's cut of the true service price. */
  platformServiceChargeAmount: number;
  /** Salon Magik's separate customer-facing fee amount. */
  customerFacingFeeAmount: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeBookingCharge(input: BookingChargeInput): BookingChargeResult {
  const servicePrice = Math.max(0, Number(input.servicePrice) || 0);

  const platformServiceChargeAmount = roundMoney(
    (servicePrice * Math.max(0, Number(input.platformServiceChargePercent) || 0)) / 100,
  );
  const customerFacingFeeAmount = roundMoney(
    (servicePrice * Math.max(0, Number(input.customerFacingFeePercent) || 0)) / 100,
  );

  const amountToChargePaystack = input.serviceChargeBorneByCustomer
    ? roundMoney(servicePrice + platformServiceChargeAmount + customerFacingFeeAmount)
    : roundMoney(servicePrice + customerFacingFeeAmount);

  const salonNetAmount = input.serviceChargeBorneByCustomer
    ? servicePrice
    : roundMoney(servicePrice - platformServiceChargeAmount);


  return {
    amountToChargePaystack,
    salonNetAmount,
    platformServiceChargeAmount,
    customerFacingFeeAmount,
  };
}

export async function getPaymentFeeSettings(
  supabase: { from: (table: string) => any },
): Promise<{ defaultPlatformServiceChargePercent: number; customerFacingFeePercent: number }> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "payment_fee_settings")
    .maybeSingle();

  if (error) {
    console.error("Failed to load payment_fee_settings, using defaults:", error);
  }

  const value = (data?.value || {}) as Record<string, unknown>;
  return {
    defaultPlatformServiceChargePercent: Number(value.default_platform_service_charge_percentage ?? 0.5),
    customerFacingFeePercent: Number(value.customer_facing_fee_percentage ?? 0.5),
  };
}
