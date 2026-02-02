import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TimePickerProps {
  value?: string; // "HH:mm" format
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
  step = 15,
  className,
}: TimePickerProps) {
  const timeSlots = React.useMemo(() => generateTimeSlots(step), [step]);

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
          <SelectItem key={time} value={time}>
            {formatTimeDisplay(time)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
