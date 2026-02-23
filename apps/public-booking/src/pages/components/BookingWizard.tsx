import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar, User, CreditCard, CheckCircle, Gift, ChevronLeft, ChevronRight, ShoppingCart, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Separator } from "@ui/separator";
import { useBookingCart, useDepositCalculation, type PublicTenant, type PublicLocation, type GiftRecipient } from "@/hooks";
import { CartStep } from "./CartStep";
import { SchedulingStep } from "./SchedulingStep";
import { BookerInfoStep, type BookerInfo } from "./BookerInfoStep";
import { GiftRecipientsStep } from "./GiftRecipientsStep";
import { ReviewStep, type PaymentOption } from "./ReviewStep";
import { PaymentStep, type PaymentGateway, type PaymentMode } from "./PaymentStep";
import { type AppliedVoucher } from "@/components/VoucherInput";
import { formatCurrency } from "@shared/currency";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";

interface BookingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salon: PublicTenant;
  locations: PublicLocation[];
}

type WizardStep = "cart" | "scheduling" | "booker" | "gifts" | "review" | "payment" | "confirmation";

export function BookingWizard({ open, onOpenChange, salon, locations }: BookingWizardProps) {
  const { items, getTotal, getTotalDuration, clearCart, getGiftItems, getItemCount } = useBookingCart();
  const [step, setStep] = useState<WizardStep>("cart");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingReference, setBookingReference] = useState<string | null>(null);

  // Schedule state
  const [selectedLocation, setSelectedLocation] = useState<PublicLocation | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [leaveUnscheduled, setLeaveUnscheduled] = useState(false);

  // Customer state
  const [bookerInfo, setBookerInfo] = useState<BookerInfo>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });

  // Gift recipients
  const [giftRecipients, setGiftRecipients] = useState<Record<string, GiftRecipient>>({});

  // Payment state
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("pay_at_salon");
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway>("stripe");
  const [purseAmount, setPurseAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("card");
  const [purseBalance, setPurseBalance] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [splitPurseAmount, setSplitPurseAmount] = useState(0);
  const [splitCardAmount, setSplitCardAmount] = useState(0);

  // Sync location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

  // Fetch customer purse balance when email is available
  useEffect(() => {
    const fetchPurseBalance = async () => {
      if (!bookerInfo.email || !salon.id) return;

      try {
        // Look up customer by email and tenant
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", salon.id)
          .eq("email", bookerInfo.email)
          .maybeSingle();

        if (customerError || !customer) {
          setPurseBalance(0);
          setCustomerId(null);
          return;
        }

        setCustomerId(customer.id);

        // Get purse balance
        const { data: purse } = await supabase
          .from("customer_purses")
          .select("balance")
          .eq("tenant_id", salon.id)
          .eq("customer_id", customer.id)
          .maybeSingle();

        setPurseBalance(purse?.balance || 0);
      } catch (err) {
        console.error("Error fetching purse balance:", err);
        setPurseBalance(0);
        setCustomerId(null);
      }
    };

    fetchPurseBalance();
  }, [bookerInfo.email, salon.id]);

  const totalDuration = getTotalDuration();
  const giftItems = getGiftItems();
  const hasSchedulableItems = items.some((item) => item.type !== "product");

  // Calculate deposit
  const depositCalc = useDepositCalculation(
    items,
    salon.deposits_enabled ? (salon.default_deposit_percentage || 0) : 0
  );

  // Calculate final amounts
  const subtotal = getTotal();
  const voucherDiscount = appliedVoucher?.discountAmount || 0;
  const afterVoucher = Math.max(0, subtotal - voucherDiscount);
  const afterPurse = Math.max(0, afterVoucher - purseAmount);
  const depositAmount = Math.min(depositCalc.depositAmount, afterPurse);

  const amountDueNow =
    afterPurse === 0
      ? 0
      : paymentOption === "pay_now"
      ? afterPurse
      : paymentOption === "pay_deposit"
      ? depositAmount
      : 0;

  const amountDueAtSalon = afterPurse - amountDueNow;

  // Determine if we should skip scheduling step
  const shouldSkipScheduling = !hasSchedulableItems;

  // Step configuration - always include cart as first step
  const getStepConfig = () => {
    const steps: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
      { key: "cart", label: "Your Cart", icon: <ShoppingCart className="h-4 w-4" /> },
    ];

    if (!shouldSkipScheduling) {
      steps.push({ key: "scheduling", label: "Schedule", icon: <Calendar className="h-4 w-4" /> });
    }

    steps.push({ key: "booker", label: "Your Info", icon: <User className="h-4 w-4" /> });

    if (giftItems.length > 0) {
      steps.push({ key: "gifts", label: "Recipients", icon: <Gift className="h-4 w-4" /> });
    }

    steps.push({ key: "review", label: "Review", icon: <CreditCard className="h-4 w-4" /> });
    
    // Add payment step if payment is required
    if (amountDueNow > 0) {
      steps.push({ key: "payment", label: "Payment", icon: <Wallet className="h-4 w-4" /> });
    }
    
    steps.push({ key: "confirmation", label: "Done", icon: <CheckCircle className="h-4 w-4" /> });

    return steps;
  };

  const steps = getStepConfig();

  const handleNext = () => {
    if (step === "cart") {
      if (items.length === 0) {
        toast({
          title: "Cart is empty",
          description: "Please add items to your cart before proceeding",
          variant: "destructive",
        });
        return;
      }
      // Check fulfillment type for products
      const productsWithoutFulfillment = items.filter(
        (item) => item.type === "product" && !item.fulfillmentType
      );
      if (productsWithoutFulfillment.length > 0) {
        toast({
          title: "Select fulfillment",
          description: "Please select Pickup or Delivery for all products",
          variant: "destructive",
        });
        return;
      }
      setStep(shouldSkipScheduling ? "booker" : "scheduling");
    } else if (step === "scheduling") {
      if (!leaveUnscheduled && hasSchedulableItems && (!selectedDate || !selectedTime || !selectedLocation)) {
        toast({
          title: "Missing selection",
          description: "Please select a date, time, and location, or choose to leave unscheduled",
          variant: "destructive",
        });
        return;
      }
      setStep("booker");
    } else if (step === "booker") {
      if (!bookerInfo.firstName || !bookerInfo.lastName || !bookerInfo.email) {
        toast({
          title: "Missing information",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(bookerInfo.email)) {
        toast({
          title: "Invalid email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return;
      }
      // Go to gifts step if there are gift items, otherwise review
      setStep(giftItems.length > 0 ? "gifts" : "review");
    } else if (step === "gifts") {
      // Validate gift recipients
      for (const item of giftItems) {
        const recipient = giftRecipients[item.id];
        if (!recipient?.firstName || !recipient?.lastName || !recipient?.email || !recipient?.phone) {
          toast({
            title: "Missing gift recipient",
            description: `Please fill in all recipient details for "${item.name}"`,
            variant: "destructive",
          });
          return;
        }
      }
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "cart") {
      onOpenChange(false); // Close modal
    } else if (step === "scheduling") {
      setStep("cart");
    } else if (step === "booker") {
      setStep(shouldSkipScheduling ? "cart" : "scheduling");
    } else if (step === "gifts") {
      setStep("booker");
    } else if (step === "review") {
      setStep(giftItems.length > 0 ? "gifts" : "booker");
    } else if (step === "payment") {
      setStep("review");
    }
  };

  // Called from review step to proceed to payment
  const handleProceedToPayment = () => {
    if (amountDueNow > 0) {
      setStep("payment");
    } else {
      handleSubmitBooking();
    }
  };

  // Handler for payment mode changes from PaymentStep
  const handlePaymentModeChange = (mode: PaymentMode, purseAmt: number, cardAmt: number) => {
    setPaymentMode(mode);
    setSplitPurseAmount(purseAmt);
    setSplitCardAmount(cardAmt);
  };

  // Called from payment step to submit with payment
  const handlePaymentSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Handle pay with purse only
      if (paymentMode === "purse") {
        if (!customerId) {
          throw new Error("Customer not found");
        }

        // Call edge function to create booking
        const { data, error } = await supabase.functions.invoke("create-public-booking", {
          body: {
            tenantId: salon.id,
            locationId: selectedLocation?.id,
            scheduledDate: leaveUnscheduled ? null : selectedDate ? format(selectedDate, "yyyy-MM-dd") : null,
            scheduledTime: leaveUnscheduled ? null : selectedTime,
            customer: bookerInfo,
            isUnscheduled: leaveUnscheduled,
            items: items.map((item) => ({
              ...item,
              giftRecipient: item.isGift ? giftRecipients[item.id] : undefined,
            })),
            payAtSalon: false,
            voucherCode: appliedVoucher?.code || null,
            voucherDiscount: voucherDiscount,
            purseAmount: 0, // Don't apply purse through booking, we'll debit directly
            depositAmount: paymentOption === "pay_deposit" ? depositAmount : 0,
          },
        });

        if (error) throw error;

        const appointmentId = data.appointmentId;
        const amountToDebit = amountDueNow;

        // Debit customer purse directly via RPC
        const { data: ledgerData, error: debitError } = await supabase.rpc("debit_customer_purse_for_booking" as any, {
          p_tenant_id: salon.id,
          p_customer_id: customerId,
          p_appointment_id: appointmentId,
          p_amount: amountToDebit,
          p_currency: salon.currency,
          p_idempotency_key: `booking_purse_${appointmentId}_${Date.now()}`,
        });

        if (debitError) {
          console.error("Purse debit failed:", debitError);
          throw new Error("Failed to debit purse balance: " + debitError.message);
        }

        // Update appointment to mark as paid
        await supabase
          .from("appointments")
          .update({
            payment_status: "fully_paid",
            amount_paid: amountToDebit,
          })
          .eq("id", appointmentId);

        setBookingReference(data.reference || "CONFIRMED");
        setStep("confirmation");
        clearCart();
        return;
      }

      // Handle split payment
      if (paymentMode === "split") {
        if (!customerId) {
          throw new Error("Customer not found");
        }

        // Call edge function to create booking
        const { data, error } = await supabase.functions.invoke("create-public-booking", {
          body: {
            tenantId: salon.id,
            locationId: selectedLocation?.id,
            scheduledDate: leaveUnscheduled ? null : selectedDate ? format(selectedDate, "yyyy-MM-dd") : null,
            scheduledTime: leaveUnscheduled ? null : selectedTime,
            customer: bookerInfo,
            isUnscheduled: leaveUnscheduled,
            items: items.map((item) => ({
              ...item,
              giftRecipient: item.isGift ? giftRecipients[item.id] : undefined,
            })),
            payAtSalon: false,
            voucherCode: appliedVoucher?.code || null,
            voucherDiscount: voucherDiscount,
            purseAmount: 0, // Don't apply purse through booking, we'll debit directly
            depositAmount: paymentOption === "pay_deposit" ? depositAmount : 0,
          },
        });

        if (error) throw error;

        const appointmentId = data.appointmentId;

        // Debit customer purse for the purse portion
        const { error: debitError } = await supabase.rpc("debit_customer_purse_for_booking" as any, {
          p_tenant_id: salon.id,
          p_customer_id: customerId,
          p_appointment_id: appointmentId,
          p_amount: splitPurseAmount,
          p_currency: salon.currency,
          p_idempotency_key: `booking_split_purse_${appointmentId}_${Date.now()}`,
        });

        if (debitError) {
          console.error("Purse debit failed:", debitError);
          throw new Error("Failed to debit purse balance: " + debitError.message);
        }

        // Create payment session for card portion
        const paymentResponse = await supabase.functions.invoke("create-payment-session", {
          body: {
            tenantId: salon.id,
            appointmentId: appointmentId,
            amount: splitCardAmount,
            currency: salon.currency,
            customerEmail: bookerInfo.email,
            customerName: `${bookerInfo.firstName} ${bookerInfo.lastName}`,
            description: `Booking Payment (${formatCurrency(splitPurseAmount, salon.currency)} from purse)`,
            isDeposit: false,
            successUrl: window.location.href,
            cancelUrl: window.location.href,
            preferredGateway: selectedGateway,
          },
        });

        if (paymentResponse.data?.checkoutUrl) {
          window.location.href = paymentResponse.data.checkoutUrl;
          return;
        }
      }

      // Handle card payment only (original flow)
      if (paymentMode === "card") {
        // Call edge function to create booking
        const { data, error } = await supabase.functions.invoke("create-public-booking", {
          body: {
            tenantId: salon.id,
            locationId: selectedLocation?.id,
            scheduledDate: leaveUnscheduled ? null : selectedDate ? format(selectedDate, "yyyy-MM-dd") : null,
            scheduledTime: leaveUnscheduled ? null : selectedTime,
            customer: bookerInfo,
            isUnscheduled: leaveUnscheduled,
            items: items.map((item) => ({
              ...item,
              giftRecipient: item.isGift ? giftRecipients[item.id] : undefined,
            })),
            payAtSalon: false,
            voucherCode: appliedVoucher?.code || null,
            voucherDiscount: voucherDiscount,
            purseAmount: purseAmount,
            depositAmount: paymentOption === "pay_deposit" ? depositAmount : 0,
          },
        });

        if (error) throw error;

        // Redirect to selected payment gateway
        const paymentResponse = await supabase.functions.invoke("create-payment-session", {
          body: {
            tenantId: salon.id,
            appointmentId: data.appointmentId,
            amount: amountDueNow,
            currency: salon.currency,
            customerEmail: bookerInfo.email,
            customerName: `${bookerInfo.firstName} ${bookerInfo.lastName}`,
            description: paymentOption === "pay_deposit" ? "Booking Deposit" : "Booking Payment",
            isDeposit: paymentOption === "pay_deposit",
            successUrl: window.location.href,
            cancelUrl: window.location.href,
            preferredGateway: selectedGateway,
          },
        });

        if (paymentResponse.data?.checkoutUrl) {
          window.location.href = paymentResponse.data.checkoutUrl;
          return;
        }
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      toast({
        title: "Payment failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Called when no payment required or pay at salon
  const handleSubmitBooking = async () => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-public-booking", {
        body: {
          tenantId: salon.id,
          locationId: selectedLocation?.id,
          scheduledDate: leaveUnscheduled ? null : selectedDate ? format(selectedDate, "yyyy-MM-dd") : null,
          scheduledTime: leaveUnscheduled ? null : selectedTime,
          customer: bookerInfo,
          isUnscheduled: leaveUnscheduled,
          items: items.map((item) => ({
            ...item,
            giftRecipient: item.isGift ? giftRecipients[item.id] : undefined,
          })),
          payAtSalon: paymentOption === "pay_at_salon",
          voucherCode: appliedVoucher?.code || null,
          voucherDiscount: voucherDiscount,
          purseAmount: purseAmount,
          depositAmount: paymentOption === "pay_deposit" ? depositAmount : 0,
        },
      });

      if (error) throw error;

      setBookingReference(data.reference || "CONFIRMED");
      setStep("confirmation");
      clearCart();
    } catch (err: any) {
      console.error("Booking error:", err);
      toast({
        title: "Booking failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step === "confirmation") {
      setStep("cart");
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      setLeaveUnscheduled(false);
      setBookerInfo({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
      setGiftRecipients({});
      setBookingReference(null);
      setAppliedVoucher(null);
      setPurseAmount(0);
      setPaymentOption("pay_at_salon");
    }
    onOpenChange(false);
  };

  // Reset step when opening
  useEffect(() => {
    if (open) {
      setStep("cart");
    }
  }, [open]);

  const currentStepIndex = steps.findIndex((s) => s.key === step);
  const isCartStep = step === "cart";

  const brandColor = salon.brand_color || "#2563EB";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-2xl h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 gap-0"
        style={{ "--brand-color": brandColor } as React.CSSProperties}
      >
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Complete Checkout</DialogTitle>
        </DialogHeader>

        {/* Steps Progress - hidden scrollbar, reduced padding */}
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 min-w-max">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2 shrink-0">
                <div
                  className={`flex items-center gap-1.5 ${
                    step === s.key
                      ? "text-primary"
                      : currentStepIndex > i
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center border-2 shrink-0 ${
                      step === s.key
                        ? "text-white border-transparent"
                        : currentStepIndex > i
                        ? "border-muted-foreground bg-muted"
                        : "border-muted"
                    }`}
                    style={step === s.key ? { backgroundColor: "var(--brand-color)" } : undefined}
                  >
                    {s.icon}
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap">{s.label}</span>
                </div>
                {i < steps.length - 1 && <div className="w-6 h-px bg-muted shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Step Content - scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-4">
            {step === "cart" && (
              <CartStep 
                currency={salon.currency} 
                onBrowse={handleClose}
              />
            )}

            {step === "scheduling" && (
              <SchedulingStep
                salon={salon}
                locations={locations}
                selectedLocation={selectedLocation}
                onLocationChange={setSelectedLocation}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                selectedTime={selectedTime}
                onTimeChange={setSelectedTime}
                leaveUnscheduled={leaveUnscheduled}
                onLeaveUnscheduledChange={setLeaveUnscheduled}
                totalDuration={totalDuration}
              />
            )}

            {step === "booker" && (
              <BookerInfoStep info={bookerInfo} onChange={setBookerInfo} />
            )}

            {step === "gifts" && (
              <GiftRecipientsStep
                giftItems={giftItems}
                recipients={giftRecipients}
                onRecipientsChange={setGiftRecipients}
              />
            )}

            {step === "review" && (
              <ReviewStep
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                selectedLocation={selectedLocation}
                leaveUnscheduled={leaveUnscheduled}
                bookerInfo={bookerInfo}
                items={items}
                giftRecipients={giftRecipients}
                salon={{
                  id: salon.id,
                  currency: salon.currency,
                  pay_at_salon_enabled: salon.pay_at_salon_enabled,
                  deposits_enabled: salon.deposits_enabled,
                  default_deposit_percentage: salon.default_deposit_percentage,
                }}
                paymentOption={paymentOption}
                onPaymentOptionChange={setPaymentOption}
                appliedVoucher={appliedVoucher}
                onVoucherApplied={setAppliedVoucher}
                purseAmount={purseAmount}
                onPurseApplied={setPurseAmount}
                subtotal={subtotal}
                voucherDiscount={voucherDiscount}
                afterVoucher={afterVoucher}
                afterPurse={afterPurse}
                depositAmount={depositAmount}
                amountDueNow={amountDueNow}
                amountDueAtSalon={amountDueAtSalon}
              />
            )}

            {step === "payment" && (
              <PaymentStep
                amountDue={amountDueNow}
                currency={salon.currency}
                country={salon.country || "US"}
                onGatewaySelect={setSelectedGateway}
                onSubmit={handlePaymentSubmit}
                isSubmitting={isSubmitting}
                brandColor={brandColor}
                purseBalance={purseBalance}
                customerId={customerId || undefined}
                customerEmail={bookerInfo.email}
                tenantId={salon.id}
                onPaymentModeChange={handlePaymentModeChange}
              />
            )}

            {step === "confirmation" && (
              <div className="text-center py-8 space-y-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
                <p className="text-muted-foreground">Your booking has been successfully submitted.</p>
                {bookingReference && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Reference Number</p>
                    <p className="text-xl font-mono font-bold">{bookingReference}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  A confirmation email has been sent to {bookerInfo.email}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        {step !== "confirmation" && step !== "payment" && (
          <div className="border-t bg-background shrink-0">
            <div className="p-4 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {isCartStep ? "Close" : "Back"}
              </Button>

              {step === "review" ? (
                <Button
                  onClick={handleProceedToPayment}
                  disabled={isSubmitting}
                  className="border-0"
                  style={{ 
                    backgroundColor: "var(--brand-color)",
                    color: "var(--brand-foreground, white)",
                  }}
                >
                  {isSubmitting
                    ? "Submitting..."
                    : amountDueNow > 0
                    ? "Continue to Payment"
                    : "Confirm Booking"}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={step === "cart" && items.length === 0}
                  className="border-0"
                  style={{ 
                    backgroundColor: "var(--brand-color)",
                    color: "var(--brand-foreground, white)",
                  }}
                >
                  Continue
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "confirmation" && (
          <div className="border-t bg-background p-4 shrink-0">
            <Button
              className="w-full text-white border-0"
              onClick={handleClose}
              style={{ backgroundColor: "var(--brand-color)" }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
