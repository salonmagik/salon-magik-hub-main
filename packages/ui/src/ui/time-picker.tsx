import { useMemo } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";

import { cn } from "@shared/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";

export interface TimePickerProps {
  value?: string; // "HH:mm" format
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Earliest selectable slot in HH:mm format. Earlier slots remain visible but disabled. */
  minTime?: string;
  step?: number; // Minutes between options (default 15)
  className?: string;
}

function generateTimeSlots(step: number = 15): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += step) {
      const hh = hour.toString().padStart(2, "0");
      const mm = minute.toString().padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  disabled = false,
  minTime,
  step = 15,
  className,
}: TimePickerProps): JSX.Element {
  const timeSlots = useMemo(() => generateTimeSlots(step), [step]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-10 w-full", className)}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={placeholder}>
            {value ? formatTimeDisplay(value) : placeholder}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {timeSlots.map((time) => (
          <SelectItem key={time} value={time} disabled={Boolean(minTime && time < minTime)}>
            {formatTimeDisplay(time)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Returns the next available time slot when `date` is today. Future dates do
 * not need a time floor, so they return undefined.
 */
export function getEarliestSelectableTime(date: Date | undefined, step = 15): string | undefined {
  if (!date) return undefined;

  const now = new Date();
  if (
    date.getFullYear() !== now.getFullYear() ||
    date.getMonth() !== now.getMonth() ||
    date.getDate() !== now.getDate()
  ) {
    return undefined;
  }

  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0);
  const roundedMinutes = Math.ceil(minutesSinceMidnight / step) * step;
  if (roundedMinutes >= 24 * 60) return "24:00";

  return format(new Date(2000, 0, 1, Math.floor(roundedMinutes / 60), roundedMinutes % 60), "HH:mm");
}
