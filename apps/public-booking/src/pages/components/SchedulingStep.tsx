import { useState } from "react";
import { format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import { Label } from "@ui/label";
import { Checkbox } from "@ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { BookingTimePicker } from "@/components/BookingTimePicker";
import { useAvailableDays, useAvailableSlots, type PublicTenant, type PublicLocation } from "@/hooks";
import { cn } from "@shared/utils";
import type { BookingEligibleStaff } from "@/hooks";

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
  allowStaffSelection?: boolean;
  requireStaffSelection?: boolean;
  eligibleStaff?: BookingEligibleStaff[];
  selectedStaffId?: string;
  onStaffChange?: (staffUserId: string | undefined) => void;
  staffLoading?: boolean;
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
  allowStaffSelection = false,
  requireStaffSelection = false,
  eligibleStaff = [],
  selectedStaffId,
  onStaffChange,
  staffLoading = false,
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

  const availableDayKeys = new Set(
    (availableDays || [])
      .filter((day) => day.hasSlots)
      .map((day) => format(day.date, "yyyy-MM-dd"))
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
    // Disable days that have no available slots once availability has loaded
    if (!daysLoading && availableDays) {
      return !availableDayKeys.has(format(date, "yyyy-MM-dd"));
    }
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

      {/* Location Selection */}
      {locations.length > 1 && (
        <div className="space-y-2">
          <Label>{leaveUnscheduled ? "Preferred Location" : "Select Location"}</Label>
          <Select
            value={selectedLocation?.id}
            onValueChange={(id) => {
              const loc = locations.find((l) => l.id === id);
              if (loc) {
                onLocationChange(loc);
                onDateChange(undefined);
                onTimeChange(undefined);
                onStaffChange?.(undefined);
              }
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
          {leaveUnscheduled && (
            <p className="text-xs text-muted-foreground">
              We'll attach this booking to your preferred branch so the salon can schedule you correctly.
            </p>
          )}
        </div>
      )}

      {!leaveUnscheduled && (
        <>
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
              {!daysLoading && availableDays && availableDayKeys.size === 0 && (
                <p className="text-xs text-muted-foreground">
                  No booking dates are currently available for this location.
                </p>
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
              {!slotsLoading && selectedDate && (availableSlots?.length || 0) === 0 && (
                <p className="text-xs text-muted-foreground">
                  No times are available for this date. Choose another date or leave the booking unscheduled.
                </p>
              )}
            </div>
          </div>

          {/* Staff Selection */}
          {allowStaffSelection && onStaffChange && (
            <div className="space-y-2">
              <Label>
                Select Staff {requireStaffSelection ? "*" : "(Optional)"}
              </Label>
              <Select
                value={selectedStaffId}
                onValueChange={(value) => onStaffChange(value === "__auto__" ? undefined : value)}
                disabled={staffLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? "Loading staff..." : "Auto-assign best match"} />
                </SelectTrigger>
                <SelectContent>
                  {!requireStaffSelection && (
                    <SelectItem value="__auto__">Auto-assign best match</SelectItem>
                  )}
                  {eligibleStaff.map((staff) => (
                    <SelectItem key={staff.userId} value={staff.userId}>
                      {staff.fullName} ({staff.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!staffLoading && eligibleStaff.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No eligible staff is configured for this location and service selection.
                </p>
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
