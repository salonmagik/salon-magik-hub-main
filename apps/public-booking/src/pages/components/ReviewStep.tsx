import { Calendar, Clock, User, Wallet, Gift, Package, Truck, MapPin, Info } from "lucide-react";
import { Separator } from "@ui/separator";
import { Badge } from "@ui/badge";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Label } from "@ui/label";
import { VoucherInput, type AppliedVoucher } from "@/components/VoucherInput";
import { CustomerPurseToggle } from "@/components/CustomerPurseToggle";
import { formatCurrency } from "@shared/currency";
import type { CartItem, GiftRecipient } from "@/hooks/useBookingCart";
import type { BookerInfo } from "./BookerInfoStep";

export type PaymentOption = "pay_now" | "pay_deposit";

interface ReviewStepProps {
  bookerInfo: BookerInfo;
  items: CartItem[];
  giftRecipients: Record<string, GiftRecipient>;
  salon: {
    id: string;
    currency: string;
    auto_confirm_bookings?: boolean;
    deposits_enabled?: boolean;
    default_deposit_percentage?: number;
  };
  paymentOption: PaymentOption;
  onPaymentOptionChange: (option: PaymentOption) => void;
  appliedVoucher: AppliedVoucher | null;
  onVoucherApplied: (voucher: AppliedVoucher | null) => void;
  purseAmount: number;
  onPurseApplied: (amount: number) => void;
  selectedCountryCode?: string | null;
  subtotal: number;
  voucherDiscount: number;
  afterVoucher: number;
  afterPurse: number;
  depositAmount: number;
  amountDueNow: number;
  amountDueAtSalon: number;
}

export function ReviewStep({
  bookerInfo,
  items,
  giftRecipients,
  salon,
  paymentOption,
  onPaymentOptionChange,
  appliedVoucher,
  onVoucherApplied,
  purseAmount,
  onPurseApplied,
  selectedCountryCode,
  subtotal,
  voucherDiscount,
  afterVoucher,
  afterPurse,
  depositAmount,
  amountDueNow,
  amountDueAtSalon,
}: ReviewStepProps) {
  const depositRequired = salon.deposits_enabled && depositAmount > 0;
  const requiresApproval = salon.auto_confirm_bookings === false;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-serif text-lg font-semibold mb-3">Order Summary</h3>
        <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {items.map((item) => {
            const recipient = item.isGift ? giftRecipients[item.id] : undefined;
            return (
              <div key={item.id} className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span className="uppercase tracking-wide">{item.type}</span>
                      {item.branchName && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {item.branchName}
                        </span>
                      )}
                      {item.scheduleMode === "leave_unscheduled" && (
                        <Badge variant="outline" className="rounded-full">Leave unscheduled</Badge>
                      )}
                      {item.isGift && (
                        <Badge className="gap-1 rounded-full bg-accent text-accent-foreground hover:bg-accent border-0 px-2 py-0">
                          <Gift className="h-3 w-3" />
                          Gift
                        </Badge>
                      )}
                      {item.type === "product" && item.fulfillmentType && (
                        <span className="inline-flex items-center gap-1">
                          {item.fulfillmentType === "pickup" ? <Package className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                          {item.fulfillmentType === "pickup" ? "Pickup" : "Delivery"}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-serif font-semibold whitespace-nowrap">
                    {formatCurrency(item.price * item.quantity, salon.currency)}
                  </span>
                </div>

                {item.scheduleMode === "schedule_now" && item.scheduledDate && item.scheduledTime && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {item.scheduledDate}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.scheduledTime}
                    </span>
                  </div>
                )}

                {recipient && (
                  <div className="text-xs text-muted-foreground">
                    Gift for {recipient.firstName} {recipient.lastName}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          Your Information
        </h3>
        <div className="text-sm text-muted-foreground">
          <p className="text-foreground font-medium">
            {bookerInfo.firstName} {bookerInfo.lastName}
          </p>
          <p>{bookerInfo.email}</p>
          {bookerInfo.phone && <p>{bookerInfo.phone}</p>}
          {bookerInfo.deliveryAddress.line1 && (
            <p className="pt-2">
              Delivery: {bookerInfo.deliveryAddress.line1}, {bookerInfo.deliveryAddress.city}, {bookerInfo.deliveryAddress.country}
            </p>
          )}
        </div>
      </div>

      <Separator />

      <VoucherInput
        tenantId={salon.id}
        currency={salon.currency}
        subtotal={subtotal}
        selectedLocationId={items[0]?.branchId}
        selectedCountryCode={selectedCountryCode}
        customerEmail={bookerInfo.email}
        onVoucherApplied={onVoucherApplied}
        appliedVoucher={appliedVoucher}
      />

      {bookerInfo.email && (
        <CustomerPurseToggle
          tenantId={salon.id}
          customerEmail={bookerInfo.email}
          currency={salon.currency}
          maxAmount={afterVoucher}
          onPurseApplied={onPurseApplied}
        />
      )}

      {afterPurse > 0 && !requiresApproval && (
        <div className="space-y-3">
          <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Payment Options
          </h3>

          <RadioGroup
            value={paymentOption}
            onValueChange={(value) => onPaymentOptionChange(value as PaymentOption)}
            className="space-y-2"
          >
            <label
              htmlFor="pay-now"
              className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${paymentOption === "pay_now" ? "border-[var(--brand-color)]" : "border-border"}`}
            >
              <RadioGroupItem value="pay_now" id="pay-now" />
              <span className="flex-1 text-sm">Pay in full now</span>
              <span className="font-serif font-semibold">{formatCurrency(afterPurse, salon.currency)}</span>
            </label>

            {depositRequired && (
              <label
                htmlFor="pay-deposit"
                className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${paymentOption === "pay_deposit" ? "border-[var(--brand-color)]" : "border-border"}`}
              >
                <RadioGroupItem value="pay_deposit" id="pay-deposit" />
                <span className="flex-1 text-sm">
                  Pay deposit now
                  <span className="block text-xs text-muted-foreground">
                    {Math.round((salon.default_deposit_percentage || 0))}% today, rest at the salon
                  </span>
                </span>
                <span className="font-serif font-semibold">{formatCurrency(depositAmount, salon.currency)}</span>
              </label>
            )}
          </RadioGroup>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>
              Paystack will open in a new tab to complete payment. If the payment page does not load, try Safari or disable strict browser privacy shields for the payment tab.
            </p>
          </div>
        </div>
      )}

      {requiresApproval && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
          <p className="font-medium">Booking approval required</p>
          <p className="mt-1 text-amber-900/90">
            This salon reviews bookings before payment. After you submit, the salon will accept, reschedule, or decline the request. If accepted, you will receive an invoice in your client portal and by email.
          </p>
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, salon.currency)}</span>
        </div>
        {voucherDiscount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>Voucher discount</span>
            <span>&minus;{formatCurrency(voucherDiscount, salon.currency)}</span>
          </div>
        )}
        {purseAmount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>Salon balance</span>
            <span>&minus;{formatCurrency(purseAmount, salon.currency)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-border">
          <span className="font-medium text-sm">{requiresApproval ? "Amount Due After Approval" : "Amount Due Now"}</span>
          <span className="font-serif text-xl font-semibold">{formatCurrency(requiresApproval ? afterPurse : amountDueNow, salon.currency)}</span>
        </div>
      </div>
    </div>
  );
}
