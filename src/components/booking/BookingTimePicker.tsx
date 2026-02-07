import { Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SlotInfo {
  time: string;
  available: boolean;
  bookedCount: number;
}

interface BookingTimePickerProps {
  availableSlots?: SlotInfo[];
  selectedTime?: string;
  onChange: (time: string | undefined) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function BookingTimePicker({
  availableSlots,
  selectedTime,
  onChange,
  isLoading = false,
  disabled = false,
  placeholder = "Select time",
  className,
}: BookingTimePickerProps) {
  const availableTimes = availableSlots?.filter((s) => s.available) || [];

  return (
    <Select
      value={selectedTime}
      onValueChange={onChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={cn("h-10 w-full", className)}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={placeholder}>
            {selectedTime ? formatTimeDisplay(selectedTime) : placeholder}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {isLoading ? (
          <div className="p-2 text-sm text-muted-foreground text-center">
            Loading times...
          </div>
        ) : availableTimes.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground text-center">
            No times available
          </div>
        ) : (
          availableTimes.map((slot) => (
            <SelectItem key={slot.time} value={slot.time}>
              {formatTimeDisplay(slot.time)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
