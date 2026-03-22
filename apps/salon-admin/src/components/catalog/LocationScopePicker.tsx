import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { cn } from "@shared/utils";
import type { ManageableLocationOption } from "@/hooks/useManageableLocations";

interface LocationScopePickerProps {
  locations: ManageableLocationOption[];
  selectedLocationIds: string[];
  onChange: (locationIds: string[]) => void;
  disabled?: boolean;
}

export function LocationScopePicker({
  locations,
  selectedLocationIds,
  onChange,
  disabled = false,
}: LocationScopePickerProps) {
  return (
    <div className="space-y-2">
      <Label>
        Branches <span className="text-destructive">*</span>
      </Label>
      <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
        {locations.map((location) => {
          const checked = selectedLocationIds.includes(location.id);
          return (
            <label
              key={location.id}
              className={cn(
                "flex items-start gap-2 rounded px-2 py-1.5 text-sm",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/60",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => {
                  if (disabled) return;
                  if (next) {
                    onChange(Array.from(new Set([...selectedLocationIds, location.id])));
                    return;
                  }
                  onChange(selectedLocationIds.filter((id) => id !== location.id));
                }}
              />
              <span className="leading-tight">
                {location.name}
                {location.city ? ` (${location.city})` : ""}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
