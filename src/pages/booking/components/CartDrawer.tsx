import { useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Trash2, Minus, Plus, Gift, Calendar as CalendarIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBookingCart, useAvailableDays, type CartItem, type PublicLocation } from "@/hooks/booking";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onCheckout: () => void;
  tenantId?: string;
  locations?: PublicLocation[];
}

export function CartDrawer({ 
  open, 
  onOpenChange, 
  currency, 
  onCheckout,
  tenantId,
  locations = []
}: CartDrawerProps) {
  const { items, removeItem, updateItem, getTotal, getTotalDuration } = useBookingCart();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [openCalendarId, setOpenCalendarId] = useState<string | null>(null);

  const total = getTotal();
  const totalDuration = getTotalDuration();
  const defaultLocation = locations[0];

  // Get available days for the current month
  const { data: availableDays, isLoading: daysLoading } = useAvailableDays(
    tenantId,
    defaultLocation,
    currentMonth,
    1, // slot capacity
    totalDuration,
    15 // buffer minutes
  );

  const handleQuantityChange = (item: CartItem, delta: number) => {
    const newQuantity = item.quantity + delta;
    if (newQuantity <= 0) {
      removeItem(item.id);
    } else {
      updateItem(item.id, { quantity: newQuantity });
    }
  };

  const toggleGift = (item: CartItem) => {
    updateItem(item.id, { isGift: !item.isGift });
  };

  const handleSchedulingOptionChange = (item: CartItem, option: "schedule_now" | "leave_unscheduled") => {
    updateItem(item.id, { 
      schedulingOption: option,
      scheduledDate: undefined,
      scheduledTime: undefined
    });
  };

  const handleDateSelect = (itemId: string, date: Date | undefined) => {
    if (date) {
      updateItem(itemId, { 
        scheduledDate: format(date, "yyyy-MM-dd"),
        scheduledTime: undefined // Clear time when date changes
      });
    }
    setOpenCalendarId(null);
  };

  // Helper to check if a date is available
  const isDateAvailable = (date: Date): boolean => {
    if (!availableDays) return false;
    const dayInfo = availableDays.find(
      (d) => format(d.date, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
    return dayInfo?.available ?? false;
  };

  // Check if item is schedulable (service or package)
  const isSchedulable = (item: CartItem) => item.type === "service" || item.type === "package";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your Cart</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Your cart is empty</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {items.map((item) => (
                  <div key={item.id} className="space-y-3">
                    <div className="flex gap-3">
                      {/* Image */}
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          {item.type}
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-medium line-clamp-1">{item.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                {item.type}
                              </Badge>
                              {item.isGift && (
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <Gift className="h-3 w-3" />
                                  Gift
                                </Badge>
                              )}
                            </div>
                          </div>
                          <span className="font-semibold whitespace-nowrap">
                            {formatCurrency(item.price * item.quantity, currency)}
                          </span>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleQuantityChange(item, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleQuantityChange(item, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleGift(item)}
                            >
                              <Gift className={`h-4 w-4 ${item.isGift ? "text-primary" : ""}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Scheduling Options for Services/Packages */}
                    {isSchedulable(item) && (
                      <div className="pl-[76px] space-y-3">
                        <RadioGroup
                          value={item.schedulingOption || "schedule_now"}
                          onValueChange={(value) => 
                            handleSchedulingOptionChange(item, value as "schedule_now" | "leave_unscheduled")
                          }
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="schedule_now" id={`schedule-${item.id}`} />
                            <Label 
                              htmlFor={`schedule-${item.id}`} 
                              className="text-sm font-normal cursor-pointer flex items-center gap-2"
                            >
                              Schedule now
                              {item.schedulingOption === "schedule_now" && (
                                <Popover 
                                  open={openCalendarId === item.id}
                                  onOpenChange={(open) => setOpenCalendarId(open ? item.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "h-7 gap-1 text-xs",
                                        !item.scheduledDate && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarIcon className="h-3.5 w-3.5" />
                                      {item.scheduledDate 
                                        ? format(new Date(item.scheduledDate), "MMM d")
                                        : "Pick date"
                                      }
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={item.scheduledDate ? new Date(item.scheduledDate) : undefined}
                                      onSelect={(date) => handleDateSelect(item.id, date)}
                                      month={currentMonth}
                                      onMonthChange={setCurrentMonth}
                                      disabled={(date) => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        if (date < today) return true;
                                        return !isDateAvailable(date);
                                      }}
                                      modifiers={{
                                        available: (date) => isDateAvailable(date),
                                      }}
                                      modifiersClassNames={{
                                        available: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                                      }}
                                      className={cn("p-3 pointer-events-auto")}
                                      initialFocus
                                    />
                                    {daysLoading && (
                                      <div className="p-2 text-center text-xs text-muted-foreground">
                                        Loading availability...
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="leave_unscheduled" id={`unscheduled-${item.id}`} />
                            <Label 
                              htmlFor={`unscheduled-${item.id}`} 
                              className="text-sm font-normal cursor-pointer"
                            >
                              Leave unscheduled
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    <Separator />
                  </div>
                ))}
              </div>
            </ScrollArea>

            <SheetFooter className="flex-col gap-4 sm:flex-col">
              <div className="flex items-center justify-between w-full text-lg font-semibold">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
              <Button 
                className="w-full text-white border-0" 
                size="lg" 
                onClick={onCheckout}
                style={{ backgroundColor: 'var(--brand-color, hsl(220, 91%, 54%))' }}
              >
                Proceed to Checkout
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
