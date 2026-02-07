import { useState } from "react";
import { format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingTimePicker } from "@/components/booking/BookingTimePicker";
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
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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

  // Check if a day is a closed day (salon not open)
  const isClosedDay = (date: Date): boolean => {
    if (!selectedLocation?.opening_days) return false;
    const dayName = format(date, "EEEE").toLowerCase();
    return !selectedLocation.opening_days.includes(dayName);
  };

  // Determine if date should be disabled
  const isDateDisabled = (date: Date): boolean => {
    const today = startOfDay(new Date());
    // Disable past dates
    if (date < today) return true;
    // Disable closed days
    if (isClosedDay(date)) return true;
    return false;
  };

  const handleDateSelect = (date: Date | undefined) => {
    onDateChange(date);
    setDatePickerOpen(false);
    // Clear time when date changes
    if (date) {
      onTimeChange(undefined);
    }
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

          {/* Date and Time Selection - Compact Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Pick a date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    disabled={isDateDisabled}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {daysLoading && (
                <p className="text-xs text-muted-foreground">Loading availability...</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Select Time</Label>
              <BookingTimePicker
                availableSlots={availableSlots}
                selectedTime={selectedTime}
                onChange={onTimeChange}
                isLoading={slotsLoading}
                disabled={!selectedDate}
                placeholder={!selectedDate ? "Select date first" : "Select time"}
              />
            </div>
          </div>
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
