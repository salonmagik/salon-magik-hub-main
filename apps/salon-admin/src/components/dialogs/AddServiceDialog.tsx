import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Scissors, Clock, Loader2, Plus } from "lucide-react";
import { cn } from "@shared/utils";
import { useServices } from "@/hooks/useServices";
import { useAuth } from "@/hooks/useAuth";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { AddCategoryDialog } from "./AddCategoryDialog";
import { getCurrencySymbol } from "@shared/currency";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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

export function AddServiceDialog({ open, onOpenChange, onSuccess }: AddServiceDialogProps) {
  const { currentTenant } = useAuth();
  const { createService, createCategory, categories } = useServices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const currencySymbol = getCurrencySymbol(currentTenant?.currency || "USD");
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    currency: currentTenant?.currency || "USD",
    duration: "60",
    paymentOption: "full",
    buffer: "15",
    description: "",
    images: [] as string[],
  });

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      price: "",
      currency: currentTenant?.currency || "USD",
      duration: "60",
      paymentOption: "full",
      buffer: "15",
      description: "",
      images: [],
    });
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formData.name.trim() !== "" &&
      formData.price !== "" &&
      parseFloat(formData.price) > 0 &&
      formData.duration !== "" &&
      parseInt(formData.duration) > 0
    );
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createService({
        name: formData.name,
        price: parseFloat(formData.price),
        durationMinutes: parseInt(formData.duration),
        description: formData.description || undefined,
        categoryId: formData.category || undefined,
        depositRequired: formData.paymentOption === "deposit" || formData.paymentOption === "both",
        imageUrls: formData.images,
      });

      if (result) {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Scissors className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Add Service</DialogTitle>
            <p className="text-sm text-muted-foreground">Create a new service offering</p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name & Category Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Service Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Haircut & Style"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category (optional)" />
                </SelectTrigger>
              <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                  <div className="border-t mt-1 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAddCategoryOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add new category
                    </button>
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price, Currency, Duration Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>
                Price <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                {/* <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /> */}
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-9 pr-12"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, currency: v }))}
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, duration: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>

          {/* Payment Options */}
          <div className="space-y-2">
            <Label>Payment options</Label>
            <p className="text-xs text-muted-foreground">Choose whether customers pay in full or a deposit online.</p>
            <RadioGroup
              value={formData.paymentOption}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, paymentOption: v }))}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2"
            >
              {paymentOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-lg border cursor-pointer transition-all",
                    formData.paymentOption === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={option.value} />
                    <span className="text-sm font-medium">{option.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">{option.description}</p>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Buffer */}
          <div className="space-y-2">
            <Label>Buffer (minutes)</Label>
            <Input
              type="number"
              className="max-w-32"
              value={formData.buffer}
              onChange={(e) => setFormData((prev) => ({ ...prev, buffer: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Outline what this service includes."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Images */}
          <div className="space-y-2">
            <Label>Images (Optional)</Label>
            <ImageUploadZone
              images={formData.images}
              onImagesChange={(images) => setFormData((prev) => ({ ...prev, images }))}
              maxImages={2}
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !isFormValid} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create service
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AddCategoryDialog
      open={addCategoryOpen}
      onOpenChange={setAddCategoryOpen}
      onSubmit={async (data) => {
        const result = await createCategory(data);
        return !!result;
      }}
    />
  </>
  );
}
