import { Calendar, Clock, User, Wallet, Gift, Package, Truck, MapPin } from "lucide-react";
import { Separator } from "@ui/separator";
import { Badge } from "@ui/badge";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Label } from "@ui/label";
import { VoucherInput, type AppliedVoucher } from "@/components/VoucherInput";
import { CustomerPurseToggle } from "@/components/CustomerPurseToggle";
import { formatCurrency } from "@shared/currency";
import type { CartItem, GiftRecipient } from "@/hooks/useBookingCart";
import type { BookerInfo } from "./BookerInfoStep";

export type PaymentOption = "pay_now" | "pay_deposit" | "pay_at_salon";

interface ReviewStepProps {
  bookerInfo: BookerInfo;
  items: CartItem[];
  giftRecipients: Record<string, GiftRecipient>;
  salon: {
    id: string;
    currency: string;
    pay_at_salon_enabled?: boolean;
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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-semibold">Order Summary</h3>
        {items.map((item) => {
          const recipient = item.isGift ? giftRecipients[item.id] : undefined;
          return (
            <div key={item.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="uppercase">{item.type}</span>
                    {item.branchName && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {item.branchName}
                      </span>
                    )}
                    {item.scheduleMode === "leave_unscheduled" && (
                      <Badge variant="outline">Leave unscheduled</Badge>
                    )}
                    {item.scheduleMode === "schedule_now" && item.scheduledDate && item.scheduledTime && (
                      <Badge variant="secondary">
                        {item.scheduledDate} at {item.scheduledTime}
                      </Badge>
                    )}
                    {item.isGift && (
                      <Badge variant="secondary" className="gap-1">
                        <Gift className="h-3 w-3" />
                        Gift
                      </Badge>
                    )}
                    {item.type === "product" && item.fulfillmentType && (
                      <Badge variant="outline" className="gap-1">
                        {item.fulfillmentType === "pickup" ? (
                          <>
                            <Package className="h-3 w-3" />
                            Pickup
                          </>
                        ) : (
                          <>
                            <Truck className="h-3 w-3" />
                            Delivery
                          </>
                        )}
                      </Badge>
                    )}
                  </div>
                </div>
                <span className="font-semibold">
                  {formatCurrency(item.price * item.quantity, salon.currency)}
                </span>
              </div>

              {item.scheduleMode === "schedule_now" && item.scheduledDate && item.scheduledTime && (
                <div className="text-sm text-muted-foreground flex flex-wrap gap-3">
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
                <div className="text-sm text-muted-foreground">
                  Gift for {recipient.firstName} {recipient.lastName}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-2">
          <User className="h-4 w-4" />
          Your Information
        </h3>
        <div className="text-sm text-muted-foreground">
          <p>
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

      {afterPurse > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Payment Options
          </h3>

          <RadioGroup
            value={paymentOption}
            onValueChange={(value) => onPaymentOptionChange(value as PaymentOption)}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2 rounded-lg border p-3">
              <RadioGroupItem value="pay_now" id="pay-now" />
              <Label htmlFor="pay-now" className="flex-1 cursor-pointer">
                Pay now
              </Label>
              <span className="font-medium">{formatCurrency(afterPurse, salon.currency)}</span>
            </div>

            {depositRequired && (
              <div className="flex items-center space-x-2 rounded-lg border p-3">
                <RadioGroupItem value="pay_deposit" id="pay-deposit" />
                <Label htmlFor="pay-deposit" className="flex-1 cursor-pointer">
                  Pay deposit now
                </Label>
                <span className="font-medium">{formatCurrency(depositAmount, salon.currency)}</span>
              </div>
            )}

            {salon.pay_at_salon_enabled && (
              <div className="flex items-center space-x-2 rounded-lg border p-3">
                <RadioGroupItem value="pay_at_salon" id="pay-at-salon" />
                <Label htmlFor="pay-at-salon" className="flex-1 cursor-pointer">
                  Pay at salon
                </Label>
                <span className="font-medium">{formatCurrency(amountDueAtSalon, salon.currency)}</span>
              </div>
            )}
          </RadioGroup>
        </div>
      )}

      <Separator />

      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotal, salon.currency)}</span>
        </div>
        {voucherDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Voucher Discount</span>
            <span>-{formatCurrency(voucherDiscount, salon.currency)}</span>
          </div>
        )}
        {purseAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Store Credit</span>
            <span>-{formatCurrency(purseAmount, salon.currency)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Amount Due Now</span>
          <span>{formatCurrency(amountDueNow, salon.currency)}</span>
        </div>
      </div>
    </div>
  );
}
