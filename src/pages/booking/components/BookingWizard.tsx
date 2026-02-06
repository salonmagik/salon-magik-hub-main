import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar, User, CreditCard, CheckCircle, Gift, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useBookingCart, useDepositCalculation, type PublicTenant, type PublicLocation, type GiftRecipient } from "@/hooks/booking";
import { SchedulingStep } from "./SchedulingStep";
import { BookerInfoStep, type BookerInfo } from "./BookerInfoStep";
import { GiftRecipientsStep } from "./GiftRecipientsStep";
import { ReviewStep, type PaymentOption } from "./ReviewStep";
import { type AppliedVoucher } from "@/components/booking/VoucherInput";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BookingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salon: PublicTenant;
  locations: PublicLocation[];
}

type WizardStep = "scheduling" | "booker" | "gifts" | "review" | "confirmation";

export function BookingWizard({ open, onOpenChange, salon, locations }: BookingWizardProps) {
  const { items, getTotal, getTotalDuration, clearCart, getGiftItems } = useBookingCart();
  const [step, setStep] = useState<WizardStep>("scheduling");
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
  const [purseAmount, setPurseAmount] = useState(0);

  // Sync location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

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

  // Get effective first step
  const getFirstStep = (): WizardStep => {
    return shouldSkipScheduling ? "booker" : "scheduling";
  };

  // Step configuration
  const getStepConfig = () => {
    const steps: { key: WizardStep; label: string; icon: React.ReactNode }[] = [];

    if (!shouldSkipScheduling) {
      steps.push({ key: "scheduling", label: "Schedule", icon: <Calendar className="h-4 w-4" /> });
    }

    steps.push({ key: "booker", label: "Your Info", icon: <User className="h-4 w-4" /> });

    if (giftItems.length > 0) {
      steps.push({ key: "gifts", label: "Gift Recipients", icon: <Gift className="h-4 w-4" /> });
    }

    steps.push({ key: "review", label: "Review", icon: <CreditCard className="h-4 w-4" /> });
    steps.push({ key: "confirmation", label: "Confirmed", icon: <CheckCircle className="h-4 w-4" /> });

    return steps;
  };

  const steps = getStepConfig();

  const handleNext = () => {
    if (step === "scheduling") {
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
    if (step === "booker") {
      if (!shouldSkipScheduling) {
        setStep("scheduling");
      }
    } else if (step === "gifts") {
      setStep("booker");
    } else if (step === "review") {
      setStep(giftItems.length > 0 ? "gifts" : "booker");
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
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
          payAtSalon: paymentOption === "pay_at_salon",
          voucherCode: appliedVoucher?.code || null,
          voucherDiscount: voucherDiscount,
          purseAmount: purseAmount,
          depositAmount: paymentOption === "pay_deposit" ? depositAmount : 0,
        },
      });

      if (error) throw error;

      // If payment is required now, redirect to payment
      if (amountDueNow > 0 && data.appointmentId) {
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
          },
        });

        if (paymentResponse.data?.checkoutUrl) {
          toast({
            title: "Payment would be required",
            description: `Amount: ${formatCurrency(amountDueNow, salon.currency)}. Payment integration coming soon.`,
          });
        }
      }

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
      setStep(getFirstStep());
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
      setStep(getFirstStep());
    }
  }, [open, shouldSkipScheduling]);

  const currentStepIndex = steps.findIndex((s) => s.key === step);
  const isFirstStep = currentStepIndex === 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>

        {/* Steps Progress */}
        <div className="overflow-x-auto">
          <div className="flex items-center gap-3 px-6 py-4 min-w-max">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3 shrink-0">
                <div
                  className={`flex items-center gap-2 ${
                    step === s.key
                      ? "text-primary"
                      : currentStepIndex > i
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
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
                  <span className="text-sm font-medium whitespace-nowrap">{s.label}</span>
                </div>
                {i < steps.length - 1 && <div className="w-8 h-px bg-muted shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Step Content */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-4">
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
        </ScrollArea>

        {/* Footer Actions */}
        {step !== "confirmation" && (
          <>
            <Separator />
            <div className="p-6 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isFirstStep}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              {step === "review" ? (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="text-white border-0"
                  style={{ backgroundColor: "var(--brand-color)" }}
                >
                  {isSubmitting
                    ? "Submitting..."
                    : amountDueNow > 0
                    ? `Pay ${formatCurrency(amountDueNow, salon.currency)}`
                    : "Confirm Booking"}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="text-white border-0"
                  style={{ backgroundColor: "var(--brand-color)" }}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </>
        )}

        {step === "confirmation" && (
          <>
            <Separator />
            <div className="p-6">
              <Button
                className="w-full text-white border-0"
                onClick={handleClose}
                style={{ backgroundColor: "var(--brand-color)" }}
              >
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
