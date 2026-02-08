import { format } from "date-fns";
import { Calendar, Clock, User, Wallet, Gift, Package, Truck } from "lucide-react";
import { Separator } from "@ui/separator";
import { Badge } from "@ui/badge";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Label } from "@ui/label";
import { VoucherInput, type AppliedVoucher } from "@/components/VoucherInput";
import { CustomerPurseToggle } from "@/components/CustomerPurseToggle";
import { formatCurrency } from "@shared/currency";
import type { CartItem, GiftRecipient } from "@/hooks/useBookingCart";
import type { PublicLocation } from "@/hooks";
import type { BookerInfo } from "./BookerInfoStep";

export type PaymentOption = "pay_now" | "pay_deposit" | "pay_at_salon";

interface ReviewStepProps {
  // Appointment details
  selectedDate?: Date;
  selectedTime?: string;
  selectedLocation?: PublicLocation;
  leaveUnscheduled: boolean;
  
  // Customer info
  bookerInfo: BookerInfo;
  
  // Cart items
  items: CartItem[];
  giftRecipients: Record<string, GiftRecipient>;
  
  // Salon config
  salon: {
    id: string;
    currency: string;
    pay_at_salon_enabled?: boolean;
    deposits_enabled?: boolean;
    default_deposit_percentage?: number;
  };
  
  // Payment state
  paymentOption: PaymentOption;
  onPaymentOptionChange: (option: PaymentOption) => void;
  appliedVoucher: AppliedVoucher | null;
  onVoucherApplied: (voucher: AppliedVoucher | null) => void;
  purseAmount: number;
  onPurseApplied: (amount: number) => void;
  
  // Calculated amounts
  subtotal: number;
  voucherDiscount: number;
  afterVoucher: number;
  afterPurse: number;
  depositAmount: number;
  amountDueNow: number;
  amountDueAtSalon: number;
}

export function ReviewStep({
  selectedDate,
  selectedTime,
  selectedLocation,
  leaveUnscheduled,
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
  subtotal,
  voucherDiscount,
  afterVoucher,
  afterPurse,
  depositAmount,
  amountDueNow,
  amountDueAtSalon,
}: ReviewStepProps) {
  const giftItems = items.filter((item) => item.isGift);
  const depositRequired = salon.deposits_enabled && depositAmount > 0;

  return (
    <div className="space-y-6">
      {/* Booking Details */}
      {!leaveUnscheduled && selectedDate && selectedTime && (
        <div className="p-4 border rounded-lg space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Appointment Details
          </h3>
          <div className="text-sm text-muted-foreground">
            <p>{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
            <p className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {selectedTime}
            </p>
            {selectedLocation && (
              <p>
                {selectedLocation.name}, {selectedLocation.city}
              </p>
            )}
          </div>
        </div>
      )}

      {leaveUnscheduled && (
        <div className="p-4 border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">
            📅 Unscheduled booking - you'll schedule your appointment after checkout
          </p>
        </div>
      )}

      {/* Customer Info */}
      <div className="p-4 border rounded-lg space-y-2">
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
        </div>
      </div>

      {/* Gift Recipients Summary */}
      {giftItems.length > 0 && (
        <div className="p-4 border rounded-lg space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Gift Recipients
          </h3>
          {giftItems.map((item) => {
            const recipient = giftRecipients[item.id];
            return (
              <div key={item.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {item.name}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <span>
                    {recipient?.firstName} {recipient?.lastName}
                  </span>
                  {recipient?.hideSender && (
                    <Badge variant="outline" className="text-xs">
                      Anonymous
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Items */}
      <div className="space-y-3">
        <h3 className="font-semibold">Order Summary</h3>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div>
              <p className="font-medium">{item.name}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Qty: {item.quantity}</span>
                {item.isGift && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Gift className="h-3 w-3" />
                    Gift
                  </Badge>
                )}
                {item.type === "product" && item.fulfillmentType && (
                  <Badge variant="outline" className="text-xs gap-1">
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
        ))}
      </div>

      <Separator />

      {/* Voucher Input */}
      <VoucherInput
        tenantId={salon.id}
        currency={salon.currency}
        subtotal={subtotal}
        onVoucherApplied={onVoucherApplied}
        appliedVoucher={appliedVoucher}
      />

      {/* Customer Purse Toggle */}
      {bookerInfo.email && (
        <CustomerPurseToggle
          tenantId={salon.id}
          customerEmail={bookerInfo.email}
          currency={salon.currency}
          maxAmount={afterVoucher}
          onPurseApplied={onPurseApplied}
        />
      )}

      {/* Payment Options */}
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
            {salon.pay_at_salon_enabled && (
              <div className="flex items-center space-x-3 p-3 border rounded-lg">
                <RadioGroupItem value="pay_at_salon" id="pay_at_salon" />
                <Label htmlFor="pay_at_salon" className="flex-1 cursor-pointer">
                  <span className="font-medium">Pay at Salon</span>
                  <p className="text-xs text-muted-foreground">
                    Pay when you arrive for your appointment
                  </p>
                </Label>
              </div>
            )}

            {depositRequired && (
              <div className="flex items-center space-x-3 p-3 border rounded-lg">
                <RadioGroupItem value="pay_deposit" id="pay_deposit" />
                <Label htmlFor="pay_deposit" className="flex-1 cursor-pointer">
                  <span className="font-medium">
                    Pay Deposit ({formatCurrency(depositAmount, salon.currency)})
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Secure your booking with a deposit
                  </p>
                </Label>
              </div>
            )}

            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <RadioGroupItem value="pay_now" id="pay_now" />
              <Label htmlFor="pay_now" className="flex-1 cursor-pointer">
                <span className="font-medium">
                  Pay in Full ({formatCurrency(afterPurse, salon.currency)})
                </span>
                <p className="text-xs text-muted-foreground">Complete payment now</p>
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Purse fully covers - no payment options needed */}
      {afterPurse === 0 && purseAmount > 0 && (
        <div className="p-4 border rounded-lg bg-primary/5 text-center">
          <p className="text-sm font-medium text-primary">
            ✓ Your store credit covers the full amount
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            No additional payment required
          </p>
        </div>
      )}

      <Separator />

      {/* Price Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, salon.currency)}</span>
        </div>

        {voucherDiscount > 0 && (
          <div className="flex items-center justify-between text-sm text-primary">
            <span>Voucher Discount</span>
            <span>-{formatCurrency(voucherDiscount, salon.currency)}</span>
          </div>
        )}

        {purseAmount > 0 && (
          <div className="flex items-center justify-between text-sm text-primary">
            <span>Store Credit</span>
            <span>-{formatCurrency(purseAmount, salon.currency)}</span>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between font-semibold">
          <span>Due Now</span>
          <span>{formatCurrency(amountDueNow, salon.currency)}</span>
        </div>

        {amountDueAtSalon > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Due at Salon</span>
            <span>{formatCurrency(amountDueAtSalon, salon.currency)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
