import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@shared/utils";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ui/popover";

export interface DateRangePreset {
  label: string;
  getRange: () => { from: Date; to: Date };
}

export interface DateRangePickerProps {
  from?: Date;
  to?: Date;
  onChange: (range: { from: Date; to: Date }) => void;
  presets?: DateRangePreset[];
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

function isSameDay(a?: Date, b?: Date): boolean {
  if (!a || !b) return false;
  return format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");
}

export function DateRangePicker({
  from,
  to,
  onChange,
  presets = [],
  placeholder = "Pick a date range",
  className,
  align = "start",
}: DateRangePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(
    from ? { from, to } : undefined
  );
  // 2 months on wider screens, 1 on mobile so the popover never overflows.
  const [months, setMonths] = useState(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMonths(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(from ? { from, to } : undefined);
    setOpen(next);
  };

  const label = from
    ? to && !isSameDay(from, to)
      ? `${format(from, "MMM d")} to ${format(to, "MMM d, yyyy")}`
      : format(from, "MMM d, yyyy")
    : placeholder;

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setDraft(range);
    // Only commit once a full range (both ends) is chosen.
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to });
      setOpen(false);
    }
  };

  const applyPreset = (preset: DateRangePreset) => {
    const range = preset.getRange();
    setDraft(range);
    onChange(range);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 justify-start gap-2 text-left font-normal",
            !from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex flex-col sm:flex-row">
          {presets.length > 0 && (
            <div className="flex gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          <Calendar
            mode="range"
            selected={draft}
            onSelect={handleCalendarSelect}
            defaultMonth={from}
            numberOfMonths={months}
            initialFocus
            className="pointer-events-auto"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
