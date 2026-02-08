import { Package, Truck } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Label } from "@ui/label";

interface FulfillmentToggleProps {
  value?: "pickup" | "delivery";
  onChange: (value: "pickup" | "delivery") => void;
}

export function FulfillmentToggle({ value, onChange }: FulfillmentToggleProps) {
  return (
    <RadioGroup
      value={value || "pickup"}
      onValueChange={(v) => onChange(v as "pickup" | "delivery")}
      className="flex gap-3"
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
        <Label
          htmlFor="pickup"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-xs transition-colors ${
            value === "pickup" || !value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted"
          }`}
        >
          <Package className="h-3 w-3" />
          Pickup
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="delivery" id="delivery" className="sr-only" />
        <Label
          htmlFor="delivery"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-xs transition-colors ${
            value === "delivery"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted"
          }`}
        >
          <Truck className="h-3 w-3" />
          Delivery
        </Label>
      </div>
    </RadioGroup>
  );
}
