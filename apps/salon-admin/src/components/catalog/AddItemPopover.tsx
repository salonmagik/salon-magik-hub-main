import { useState } from "react";
import { Plus, Scissors, Package, ShoppingBag, Gift } from "lucide-react";
import { Button } from "@ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ui/popover";
import { cn } from "@shared/utils";

interface AddItemOption {
  label: string;
  icon: React.ElementType;
  type: "service" | "product" | "package" | "voucher";
}

const options: AddItemOption[] = [
  { label: "Add Service", icon: Scissors, type: "service" },
  { label: "Add Product", icon: ShoppingBag, type: "product" },
  { label: "Add Package", icon: Package, type: "package" },
  { label: "Add Voucher", icon: Gift, type: "voucher" },
];

interface AddItemPopoverProps {
  onSelect: (type: "service" | "product" | "package" | "voucher") => void;
}

export function AddItemPopover({ onSelect }: AddItemPopoverProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (type: "service" | "product" | "package" | "voucher") => {
    setOpen(false);
    onSelect(type);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() => handleSelect(option.type)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                "hover:bg-muted transition-colors text-left"
              )}
            >
              <Icon className="w-4 h-4 text-muted-foreground" />
              {option.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
