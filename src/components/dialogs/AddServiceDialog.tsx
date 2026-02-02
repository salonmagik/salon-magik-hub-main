import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Scissors, Clock, DollarSign, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paymentOptions = [
  {
    value: "full",
    label: "Full payment only",
    description: "Collect the entire amount online.",
  },
  {
    value: "deposit",
    label: "Deposit only",
    description: "Collect a deposit online; remainder in person.",
  },
  {
    value: "both",
    label: "Full or deposit",
    description: "Let customers choose full or deposit.",
  },
];

const colorOptions = [
  "#604DD9",
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#06B6D4",
];

export function AddServiceDialog({ open, onOpenChange }: AddServiceDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    currency: "GHS",
    duration: "60",
    paymentOption: "full",
    buffer: "15",
    color: "#604DD9",
    description: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Save service
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Scissors className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Add Service</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Create a new service offering
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name & Category Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Service Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Haircut & Style"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.category}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, category: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hair">Hair</SelectItem>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="styling">Styling</SelectItem>
                  <SelectItem value="nails">Nails</SelectItem>
                  <SelectItem value="skin">Skin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price, Currency, Duration Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>
                Price <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-9 pr-12"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, price: e.target.value }))
                  }
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  GHS
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, currency: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GHS">Ghanaian Cedi</SelectItem>
                  <SelectItem value="NGN">Nigerian Naira</SelectItem>
                  <SelectItem value="USD">US Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Duration (minutes) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="pl-9"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, duration: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
          </div>

          {/* Payment Options */}
          <div className="space-y-2">
            <Label>Payment options</Label>
            <p className="text-xs text-muted-foreground">
              Choose whether customers pay in full or a deposit online.
            </p>
            <RadioGroup
              value={formData.paymentOption}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, paymentOption: v }))
              }
              className="grid grid-cols-3 gap-3 mt-2"
            >
              {paymentOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-lg border cursor-pointer transition-all",
                    formData.paymentOption === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={option.value} />
                    <span className="text-sm font-medium">{option.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    {option.description}
                  </p>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Buffer & Color Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Buffer (minutes)</Label>
              <Input
                type="number"
                value={formData.buffer}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, buffer: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-lg border"
                  style={{ backgroundColor: formData.color }}
                />
                <div className="flex gap-1 flex-wrap">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "w-6 h-6 rounded-md transition-all",
                        formData.color === color && "ring-2 ring-offset-2 ring-primary"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, color }))
                      }
                    />
                  ))}
                </div>
                <div className="relative flex-1">
                  <Palette className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, color: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Outline what this service includes."
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={3}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create service</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
