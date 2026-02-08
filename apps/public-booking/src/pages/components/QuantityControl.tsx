import { Minus, Plus } from "lucide-react";
import { Button } from "@ui/button";

interface QuantityControlProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: "sm" | "default";
}

export function QuantityControl({
  quantity,
  onIncrement,
  onDecrement,
  size = "default",
}: QuantityControlProps) {
  const buttonSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs w-6" : "text-sm w-8";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className={buttonSize}
        onClick={onDecrement}
      >
        <Minus className={iconSize} />
      </Button>
      <span className={`text-center font-medium ${textSize}`}>{quantity}</span>
      <Button
        variant="outline"
        size="icon"
        className={buttonSize}
        onClick={onIncrement}
      >
        <Plus className={iconSize} />
      </Button>
    </div>
  );
}
