import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAvailableDays, useAvailableSlots, type PublicTenant, type PublicLocation } from "@/hooks/booking";
import { cn } from "@/lib/utils";

interface SchedulingStepProps {
  salon: PublicTenant;
  locations: PublicLocation[];
  selectedLocation: PublicLocation | undefined;
  onLocationChange: (location: PublicLocation) => void;
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  selectedTime: string | undefined;
  onTimeChange: (time: string | undefined) => void;
  leaveUnscheduled: boolean;
  onLeaveUnscheduledChange: (value: boolean) => void;
  totalDuration: number;
}

export function SchedulingStep({
  salon,
  locations,
  selectedLocation,
  onLocationChange,
  selectedDate,
  onDateChange,
  selectedTime,
  onTimeChange,
  leaveUnscheduled,
  onLeaveUnscheduledChange,
  totalDuration,
}: SchedulingStepProps) {
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Get available days for calendar dots
  const { data: availableDays, isLoading: daysLoading } = useAvailableDays(
    salon.id,
    selectedLocation,
    calendarMonth,
    salon.slot_capacity_default || 1,
    totalDuration,
    15
  );

  const { data: availableSlots, isLoading: slotsLoading } = useAvailableSlots(
    salon.id,
    selectedLocation,
    leaveUnscheduled ? undefined : selectedDate,
    salon.slot_capacity_default || 1,
    30,
    totalDuration,
    15
  );

  const isDateAvailable = (date: Date): boolean => {
    if (!availableDays) return false;
    const dayInfo = availableDays.find(
      (d) => format(d.date, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
    return dayInfo?.available ?? false;
  };

  return (
    <div className="space-y-6">
      {/* Leave Unscheduled Option */}
      <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30">
        <Checkbox
          id="leave-unscheduled"
          checked={leaveUnscheduled}
          onCheckedChange={(checked) => {
            onLeaveUnscheduledChange(!!checked);
            if (checked) {
              onDateChange(undefined);
              onTimeChange(undefined);
            }
          }}
        />
        <div className="space-y-1">
          <Label htmlFor="leave-unscheduled" className="cursor-pointer font-medium">
            Leave unscheduled
          </Label>
          <p className="text-xs text-muted-foreground">
            Book now and schedule your appointment later
          </p>
        </div>
      </div>

      {!leaveUnscheduled && (
        <>
          {/* Location Selection */}
          {locations.length > 1 && (
            <div className="space-y-2">
              <Label>Select Location</Label>
              <Select
                value={selectedLocation?.id}
                onValueChange={(id) => {
                  const loc = locations.find((l) => l.id === id);
                  if (loc) onLocationChange(loc);
                }}
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
            <div className="flex justify-center w-full">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={onDateChange}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return date < today;
                }}
                modifiers={{
                  available: (date) => isDateAvailable(date),
                }}
                modifiersClassNames={{
                  available:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                }}
                className={cn("rounded-md border pointer-events-auto w-full max-w-[350px]")}
              />
            </div>
            {daysLoading && (
              <p className="text-xs text-muted-foreground text-center">Loading availability...</p>
            )}
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
                        onClick={() => onTimeChange(slot.time)}
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
      )}

      {/* Duration Estimate */}
      {totalDuration > 0 && (
        <p className="text-sm text-muted-foreground">
          Estimated duration: {totalDuration} minutes
        </p>
      )}
    </div>
  );
}
