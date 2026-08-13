/**
 * Booking-payment fee math, confirmed against a real Paystack test-mode
 * transaction (see payments-rails plan, Step 3) before being written here.
 *
 * Confirmed empirically: Paystack's own card-processing fee is computed and
 * added on top of whatever `amount` we send, automatically, whenever the
 * transaction carries a subaccount (default bearer is "customer" — the
 * platform never has to compute or pass that fee itself). What we DO have to
 * control ourselves is how `amount` (the pre-Paystack-fee total) splits
 * between the salon's subaccount and Salon Magik, via the `transaction_charge`
 * parameter on /transaction/initialize — passing it overrides the
 * subaccount's stored percentage_charge for that one transaction, which is
 * what lets a flat "customer-facing fee" sit on top without also being
 * re-split by the subaccount's own percentage.
 */

export interface BookingChargeInput {
  /** True price owed for the service, in major currency units (e.g. naira, not kobo). */
  servicePrice: number;
  /** Salon Magik's platform service charge, as a percent (e.g. 0.5 for 0.5%). */
  platformServiceChargePercent: number;
  /** Salon Magik's separate, always-customer-facing fee, as a percent. */
  customerFacingFeePercent: number;
  /** If true, the salon's own platform service charge is billed to the customer instead of deducted from the salon's share. */
  serviceChargeBorneByCustomer: boolean;
  /** Whether this booking has a usable destination subaccount to split with. */
  hasSubaccount: boolean;
}

export interface BookingChargeResult {
  /** Amount to send as `amount` on /transaction/initialize, major units. */
  amountToChargePaystack: number;
  /** Amount to send as `transaction_charge` on /transaction/initialize, minor units. Omit the param entirely when this is 0. */
  transactionChargeMinor: number;
  /** What the salon's subaccount will net from this transaction (excludes Paystack's own card fee, which never touches the split). */
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

  if (!input.hasSubaccount) {
    // Nothing to split — the whole amount already lands in Salon Magik's
    // main account, so there's no separate "salon share" to protect and no
    // customer-facing fee to layer on top of it.
    return {
      amountToChargePaystack: servicePrice,
      transactionChargeMinor: 0,
      salonNetAmount: 0,
      platformServiceChargeAmount: 0,
      customerFacingFeeAmount: 0,
    };
  }

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

  const transactionChargeMinor = Math.round((amountToChargePaystack - salonNetAmount) * 100);

  return {
    amountToChargePaystack,
    transactionChargeMinor,
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
