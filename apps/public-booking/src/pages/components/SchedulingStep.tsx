import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import { Label } from "@ui/label";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ui/accordion";
import { BookingTimePicker } from "@/components/BookingTimePicker";
import {
  useAvailableDays,
  useAvailableSlots,
  useBookingEligibleStaff,
  type PublicTenant,
  type PublicLocation,
  type CartItem,
} from "@/hooks";
import { cn } from "@shared/utils";

interface SchedulingStepProps {
  salon: PublicTenant;
  locations: PublicLocation[];
  items: CartItem[];
  onItemChange: (itemId: string, updates: Partial<CartItem>) => void;
}

function SchedulingItem({
  salon,
  locations,
  item,
  onItemChange,
  showAccordionTitle = false,
}: {
  salon: PublicTenant;
  locations: PublicLocation[];
  item: CartItem;
  onItemChange: (itemId: string, updates: Partial<CartItem>) => void;
  showAccordionTitle?: boolean;
}) {
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    item.scheduledDate ? parseISO(`${item.scheduledDate}T00:00:00`) : new Date(),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const eligibleLocations = useMemo(() => {
    if ((item.eligibleBranches?.length || 0) === 0) return locations;
    const branchIds = new Set((item.eligibleBranches || []).map((branch) => branch.id));
    const matchingLocations = locations.filter((location) => branchIds.has(location.id));

    if (matchingLocations.length > 0) {
      return matchingLocations;
    }

    const branchBackedLocations: PublicLocation[] = (item.eligibleBranches || [])
      .filter((branch) => Boolean(branch.opening_days?.length))
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        city: branch.city,
        country: branch.country_code,
        address: branch.address || null,
        opening_time: branch.opening_time || null,
        closing_time: branch.closing_time || null,
        opening_days: branch.opening_days || [],
        availability:
          branch.availability === "closed" ||
          branch.availability === "temporarily_unavailable"
            ? branch.availability
            : "open",
      }));

    if (branchBackedLocations.length > 0) {
      console.log("[public-booking] SchedulingStep using branch schedule metadata fallback", {
        itemId: item.id,
        itemName: item.name,
        branchIds: Array.from(branchIds),
      });
      return branchBackedLocations;
    }

    console.log("[public-booking] SchedulingStep falling back to unfiltered locations", {
      itemId: item.id,
      itemName: item.name,
      branchIds: Array.from(branchIds),
      availableLocationIds: locations.map((location) => location.id),
    });

    return locations;
  }, [item.eligibleBranches, item.id, item.name, locations]);

  const selectedLocation = eligibleLocations.find((location) => location.id === item.branchId);
  const selectedDate = item.scheduledDate ? parseISO(`${item.scheduledDate}T00:00:00`) : undefined;
  const serviceIds =
    item.type === "service" ? [item.itemId] : item.type === "package" ? item.serviceIds || [] : [];

  const { data: eligibleStaff = [], isLoading: staffLoading } = useBookingEligibleStaff({
    tenantId: salon.id,
    locationId: selectedLocation?.id,
    serviceIds,
    enabled:
      Boolean(selectedLocation?.id) &&
      Boolean(salon.allow_staff_selection || salon.require_staff_selection),
  });

  const { data: availableDays, isLoading: daysLoading } = useAvailableDays(
    salon.id,
    selectedLocation,
    calendarMonth,
    salon.slot_capacity_default || 1,
    item.durationMinutes || 0,
    salon.default_buffer_minutes || 0,
  );

  const { data: availableSlots, isLoading: slotsLoading } = useAvailableSlots(
    salon.id,
    selectedLocation,
    selectedDate,
    salon.slot_capacity_default || 1,
    30,
    item.durationMinutes || 0,
    salon.default_buffer_minutes || 0,
  );

  const availableDayKeys = new Set(
    (availableDays || [])
      .filter((day) => day.hasSlots)
      .map((day) => format(day.date, "yyyy-MM-dd")),
  );

  useEffect(() => {
    if (item.branchId || eligibleLocations.length !== 1) return;
    const onlyLocation = eligibleLocations[0];
    onItemChange(item.id, {
      branchId: onlyLocation.id,
      branchName: onlyLocation.name,
    });
  }, [eligibleLocations, item.branchId, item.id, onItemChange]);

  const isDateDisabled = (date: Date): boolean => {
    const today = startOfDay(new Date());
    if (date < today) return true;
    if (!selectedLocation?.opening_days) return true;
    const dayName = format(date, "EEEE").toLowerCase();
    if (!selectedLocation.opening_days.includes(dayName)) return true;
    if (!daysLoading && availableDays) {
      return !availableDayKeys.has(format(date, "yyyy-MM-dd"));
    }
    return false;
  };

  const content = (
    <div className="space-y-4">
      {showAccordionTitle && (
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {item.type === "package" ? "Package" : "Service"}
            {item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}
          </p>
        </div>
      )}

      {(eligibleLocations.length > 1 || !item.branchId) && (
        <div className="space-y-2">
          <Label>Service Branch</Label>
          <Select
            value={item.branchId ?? ""}
            onValueChange={(value) =>
              onItemChange(item.id, {
                branchId: value,
                scheduledDate: undefined,
                scheduledTime: undefined,
                selectedStaffId: undefined,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {eligibleLocations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name} - {location.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Select Date</Label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-10 w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
                disabled={!selectedLocation}
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
                onSelect={(date) => {
                  onItemChange(item.id, {
                    scheduledDate: date ? format(date, "yyyy-MM-dd") : undefined,
                    scheduledTime: undefined,
                  });
                  setDatePickerOpen(false);
                }}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                disabled={isDateDisabled}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Select Time</Label>
          <BookingTimePicker
            availableSlots={availableSlots}
            selectedTime={item.scheduledTime}
            onChange={(time) => onItemChange(item.id, { scheduledTime: time })}
            isLoading={slotsLoading}
            disabled={!selectedDate || !selectedLocation}
            placeholder={!selectedDate ? "Select date first" : "Select time"}
          />
        </div>
      </div>

      {Boolean(salon.allow_staff_selection || salon.require_staff_selection) && (
        <div className="space-y-2">
          <Label>
            Select Staff {salon.require_staff_selection ? "*" : "(Optional)"}
          </Label>
          <Select
            value={item.selectedStaffId || "__auto__"}
            onValueChange={(value) =>
              onItemChange(item.id, {
                selectedStaffId: value === "__auto__" ? undefined : value,
              })
            }
            disabled={!selectedLocation || staffLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={staffLoading ? "Loading staff..." : "Auto-assign best match"} />
            </SelectTrigger>
            <SelectContent>
              {!salon.require_staff_selection && (
                <SelectItem value="__auto__">Auto-assign best match</SelectItem>
              )}
              {eligibleStaff.map((staff) => {
                const initials = staff.fullName
                  .split(" ")
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <SelectItem key={staff.userId} value={staff.userId}>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-7 w-7 shrink-0 overflow-hidden rounded-full">
                        {staff.avatarUrl ? (
                          <img
                            src={staff.avatarUrl}
                            alt={staff.fullName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground">
                            {initials}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{staff.fullName}</span>
                        <span className="text-xs capitalize text-muted-foreground">{staff.role}</span>
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  return content;
}

export function SchedulingStep({
  salon,
  locations,
  items,
  onItemChange,
}: SchedulingStepProps) {
  if (items.length === 1) {
    return (
      <SchedulingItem
        salon={salon}
        locations={locations}
        item={items[0]}
        onItemChange={onItemChange}
      />
    );
  }

  return (
    <Accordion type="multiple" className="w-full space-y-3">
      {items.map((item, index) => (
        <AccordionItem key={item.id} value={item.id} className="rounded-xl border px-4">
          <AccordionTrigger>
            <div className="text-left">
              <p className="font-medium">
                {index + 1}. {item.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.branchName || "Select branch"}
                {item.scheduledDate && item.scheduledTime
                  ? ` · ${item.scheduledDate} at ${item.scheduledTime}`
                  : " · Schedule required"}
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <SchedulingItem
              salon={salon}
              locations={locations}
              item={item}
              onItemChange={onItemChange}
              showAccordionTitle={false}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
