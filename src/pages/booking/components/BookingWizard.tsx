import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar, Clock, User, CreditCard, CheckCircle, Gift, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookingCart, useAvailableSlots, type PublicTenant, type PublicLocation, type CartItem } from "@/hooks/booking";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BookingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salon: PublicTenant;
  locations: PublicLocation[];
}

type WizardStep = "schedule" | "customer" | "review" | "confirmation";

export function BookingWizard({ open, onOpenChange, salon, locations }: BookingWizardProps) {
  const { items, updateItem, getTotal, clearCart } = useBookingCart();
  const [step, setStep] = useState<WizardStep>("schedule");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingReference, setBookingReference] = useState<string | null>(null);

  // Schedule state
  const [selectedLocation, setSelectedLocation] = useState<PublicLocation | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);

  // Sync location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

  // Customer state
  const [customerInfo, setCustomerInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });

  // Gift recipient (for items marked as gifts)
  const [giftRecipients, setGiftRecipients] = useState<Record<string, {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    message: string;
    hideSender: boolean;
  }>>({});

  const { data: availableSlots, isLoading: slotsLoading } = useAvailableSlots(
    salon.id,
    selectedLocation,
    selectedDate,
    salon.slot_capacity_default || 1
  );

  const giftItems = items.filter((item) => item.isGift);
  const hasSchedulableItems = items.some((item) => item.type !== "product");

  const steps: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
    { key: "schedule", label: "Schedule", icon: <Calendar className="h-4 w-4" /> },
    { key: "customer", label: "Your Info", icon: <User className="h-4 w-4" /> },
    { key: "review", label: "Review", icon: <CreditCard className="h-4 w-4" /> },
    { key: "confirmation", label: "Confirmed", icon: <CheckCircle className="h-4 w-4" /> },
  ];

  const handleNext = () => {
    if (step === "schedule") {
      if (hasSchedulableItems && (!selectedDate || !selectedTime || !selectedLocation)) {
        toast({
          title: "Missing selection",
          description: "Please select a date, time, and location",
          variant: "destructive",
        });
        return;
      }
      setStep("customer");
    } else if (step === "customer") {
      if (!customerInfo.firstName || !customerInfo.lastName || !customerInfo.email) {
        toast({
          title: "Missing information",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }
      // Validate gift recipients
      for (const item of giftItems) {
        const recipient = giftRecipients[item.id];
        if (!recipient?.firstName || !recipient?.lastName || !recipient?.email) {
          toast({
            title: "Missing gift recipient",
            description: `Please fill in recipient details for "${item.name}"`,
            variant: "destructive",
          });
          return;
        }
      }
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "customer") setStep("schedule");
    else if (step === "review") setStep("customer");
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Call edge function to create booking
      const { data, error } = await supabase.functions.invoke("create-public-booking", {
        body: {
          tenantId: salon.id,
          locationId: selectedLocation?.id,
          scheduledDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : null,
          scheduledTime: selectedTime,
          customer: customerInfo,
          items: items.map((item) => ({
            ...item,
            giftRecipient: item.isGift ? giftRecipients[item.id] : undefined,
          })),
          payAtSalon: salon.pay_at_salon_enabled,
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
      setStep("schedule");
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      setCustomerInfo({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
      setGiftRecipients({});
      setBookingReference(null);
    }
    onOpenChange(false);
  };

  const updateGiftRecipient = (itemId: string, field: string, value: string | boolean) => {
    setGiftRecipients((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>

        {/* Steps Progress - Scrollable */}
        <div className="overflow-x-auto">
          <div className="flex items-center gap-3 px-6 py-4 min-w-max">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3 shrink-0">
                <div
                  className={`flex items-center gap-2 ${
                    step === s.key
                      ? "text-primary"
                      : steps.findIndex((x) => x.key === step) > i
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
                      step === s.key
                        ? "text-white border-transparent"
                        : steps.findIndex((x) => x.key === step) > i
                        ? "border-muted-foreground bg-muted"
                        : "border-muted"
                    }`}
                    style={step === s.key ? { backgroundColor: 'var(--brand-color)' } : undefined}
                  >
                    {s.icon}
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-8 h-px bg-muted shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Step Content */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-4">
            {/* Schedule Step */}
            {step === "schedule" && (
              <div className="space-y-6">
                {hasSchedulableItems ? (
                  <>
                    {/* Location Selection */}
                    {locations.length > 1 && (
                      <div className="space-y-2">
                        <Label>Select Location</Label>
                        <Select
                          value={selectedLocation?.id}
                          onValueChange={(id) =>
                            setSelectedLocation(locations.find((l) => l.id === id))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a location" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name} - {loc.city}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Date Selection */}
                    <div className="space-y-2">
                      <Label>Select Date</Label>
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date < new Date()}
                        className="rounded-md border"
                      />
                    </div>

                    {/* Time Selection */}
                    {selectedDate && (
                      <div className="space-y-2">
                        <Label>Select Time</Label>
                        {slotsLoading ? (
                          <div className="text-sm text-muted-foreground">Loading available times...</div>
                        ) : availableSlots && availableSlots.length > 0 ? (
                          <div className="grid grid-cols-4 gap-2">
                            {availableSlots
                              .filter((slot) => slot.available)
                              .map((slot) => (
                                <Button
                                  key={slot.time}
                                  variant={selectedTime === slot.time ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setSelectedTime(slot.time)}
                                >
                                  {slot.time}
                                </Button>
                              ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No available times for this date
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Your cart only contains products.</p>
                    <p className="text-sm mt-2">You can proceed to enter your details.</p>
                  </div>
                )}
              </div>
            )}

            {/* Customer Step */}
            {step === "customer" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input
                      value={customerInfo.firstName}
                      onChange={(e) =>
                        setCustomerInfo((prev) => ({ ...prev, firstName: e.target.value }))
                      }
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input
                      value={customerInfo.lastName}
                      onChange={(e) =>
                        setCustomerInfo((prev) => ({ ...prev, lastName: e.target.value }))
                      }
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="john@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="+1 234 567 8900"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes for the salon</Label>
                  <Textarea
                    value={customerInfo.notes}
                    onChange={(e) =>
                      setCustomerInfo((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Any special requests..."
                    rows={3}
                  />
                </div>

                {/* Gift Recipients */}
                {giftItems.length > 0 && (
                  <div className="space-y-4">
                    <Separator />
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Gift Recipients</h3>
                    </div>

                    {giftItems.map((item) => (
                      <div key={item.id} className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{item.name}</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Recipient First Name *</Label>
                            <Input
                              value={giftRecipients[item.id]?.firstName || ""}
                              onChange={(e) =>
                                updateGiftRecipient(item.id, "firstName", e.target.value)
                              }
                              placeholder="Jane"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Recipient Last Name *</Label>
                            <Input
                              value={giftRecipients[item.id]?.lastName || ""}
                              onChange={(e) =>
                                updateGiftRecipient(item.id, "lastName", e.target.value)
                              }
                              placeholder="Smith"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Recipient Email *</Label>
                          <Input
                            type="email"
                            value={giftRecipients[item.id]?.email || ""}
                            onChange={(e) =>
                              updateGiftRecipient(item.id, "email", e.target.value)
                            }
                            placeholder="jane@example.com"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Gift Message</Label>
                          <Textarea
                            value={giftRecipients[item.id]?.message || ""}
                            onChange={(e) =>
                              updateGiftRecipient(item.id, "message", e.target.value)
                            }
                            placeholder="A special message for the recipient..."
                            rows={2}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`hide-sender-${item.id}`}
                            checked={giftRecipients[item.id]?.hideSender || false}
                            onCheckedChange={(checked) =>
                              updateGiftRecipient(item.id, "hideSender", !!checked)
                            }
                          />
                          <Label htmlFor={`hide-sender-${item.id}`} className="text-sm">
                            Keep my identity anonymous
                          </Label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Review Step */}
            {step === "review" && (
              <div className="space-y-6">
                {/* Booking Details */}
                {hasSchedulableItems && selectedDate && selectedTime && (
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

                {/* Customer Info */}
                <div className="p-4 border rounded-lg space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Your Information
                  </h3>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      {customerInfo.firstName} {customerInfo.lastName}
                    </p>
                    <p>{customerInfo.email}</p>
                    {customerInfo.phone && <p>{customerInfo.phone}</p>}
                  </div>
                </div>

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
                            <Badge variant="secondary" className="text-xs">
                              Gift
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(item.price * item.quantity, salon.currency)}
                      </span>
                    </div>
                  ))}

                  <Separator />

                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(getTotal(), salon.currency)}</span>
                  </div>

                  {salon.pay_at_salon_enabled && (
                    <p className="text-sm text-muted-foreground text-center">
                      Payment will be collected at the salon
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Confirmation Step */}
            {step === "confirmation" && (
              <div className="text-center py-8 space-y-4">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
                <p className="text-muted-foreground">
                  Your booking has been successfully submitted.
                </p>
                {bookingReference && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Reference Number</p>
                    <p className="text-xl font-mono font-bold">{bookingReference}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  A confirmation email has been sent to {customerInfo.email}
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
                disabled={step === "schedule"}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              {step === "review" ? (
                <Button 
                  onClick={handleSubmit} 
                  disabled={isSubmitting}
                  className="text-white border-0"
                  style={{ backgroundColor: 'var(--brand-color)' }}
                >
                  {isSubmitting ? "Submitting..." : "Confirm Booking"}
                </Button>
              ) : (
                <Button 
                  onClick={handleNext}
                  className="text-white border-0"
                  style={{ backgroundColor: 'var(--brand-color)' }}
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
                style={{ backgroundColor: 'var(--brand-color)' }}
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
