import { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Scissors, Loader2, Plus } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { useAuth } from "@/hooks/useAuth";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { AddCategoryDialog } from "./AddCategoryDialog";
import { getCurrencySymbol } from "@shared/currency";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";
import { moveThumbnailToFront } from "@/lib/imageOrder";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const formatAmountInput = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [intPart, ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("");
  const normalizedInt = intPart.replace(/^0+(?=\d)/, "");
  const withCommas = (normalizedInt || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimal.length > 0) return `${withCommas}.${decimal}`;
  return cleaned.endsWith(".") ? `${withCommas}.` : withCommas;
};

const parseAmountInput = (value: string) => Number(value.replace(/,/g, ""));

export function AddServiceDialog({ open, onOpenChange, onSuccess }: AddServiceDialogProps) {
  const { currentTenant, activeLocationId } = useAuth();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } = useManageableLocations();
  const { createService, createCategory, categories } = useServices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const fallbackCurrency = currentTenant?.currency || "USD";
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    duration: "60",
    description: "",
    images: [] as string[],
    locationIds: [] as string[],
  });
  const isChainTier = String(currentTenant?.plan || "").toLowerCase() === "chain";
  const normalizeCountry = (value: string | null | undefined) =>
    (value || "").toLowerCase().replace(/[^a-z]/g, "");
  const activeLocationCountry = useMemo(() => {
    if (!activeLocationId) return null;
    return manageableLocations.find((location) => location.id === activeLocationId)?.country || null;
  }, [activeLocationId, manageableLocations]);
  const scopedLocations = useMemo(() => {
    if (!isChainTier || !activeLocationCountry) return manageableLocations;
    const activeCountryKey = normalizeCountry(activeLocationCountry);
    return manageableLocations.filter(
      (location) => normalizeCountry(location.country) === activeCountryKey,
    );
  }, [activeLocationCountry, isChainTier, manageableLocations]);
  const scopedDefaultLocationId = useMemo(() => {
    if (defaultLocationId && scopedLocations.some((location) => location.id === defaultLocationId)) {
      return defaultLocationId;
    }
    return scopedLocations[0]?.id || "";
  }, [defaultLocationId, scopedLocations]);
  const selectedLocationIds = useMemo(() => {
    if (isChainTier) return formData.locationIds;
    const fallbackLocationId = scopedDefaultLocationId || manageableLocations[0]?.id || "";
    return fallbackLocationId ? [fallbackLocationId] : [];
  }, [formData.locationIds, isChainTier, manageableLocations, scopedDefaultLocationId]);
  const locationCurrencies = useMemo(
    () => getCurrenciesForLocations(manageableLocations, selectedLocationIds, fallbackCurrency),
    [fallbackCurrency, manageableLocations, selectedLocationIds],
  );
  const selectedCurrency = locationCurrencies[0] || fallbackCurrency;
  const currencySymbol = getCurrencySymbol(selectedCurrency);
  const hasMixedCurrencies = locationCurrencies.length > 1;

  useEffect(() => {
    if (!open) return;
    if (isChainTier) {
      const validSelected = formData.locationIds.filter((locationId) =>
        scopedLocations.some((location) => location.id === locationId),
      );
      if (validSelected.length !== formData.locationIds.length) {
        setFormData((prev) => ({ ...prev, locationIds: validSelected }));
        return;
      }
      if (validSelected.length === 0 && scopedDefaultLocationId) {
        setFormData((prev) => ({ ...prev, locationIds: [scopedDefaultLocationId] }));
      }
      return;
    }
    if (formData.locationIds.length === 0 && scopedDefaultLocationId) {
      setFormData((prev) => ({ ...prev, locationIds: [scopedDefaultLocationId] }));
    }
  }, [formData.locationIds, isChainTier, open, scopedDefaultLocationId, scopedLocations]);

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      price: "",
      duration: "60",
      description: "",
      images: [],
      locationIds: scopedDefaultLocationId ? [scopedDefaultLocationId] : [],
    });
    setThumbnailIndex(0);
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formData.name.trim() !== "" &&
      formData.price !== "" &&
      parseAmountInput(formData.price) > 0 &&
      formData.duration !== "" &&
      parseInt(formData.duration) > 0 &&
      selectedLocationIds.length > 0 &&
      !hasMixedCurrencies
    );
  }, [formData, hasMixedCurrencies, selectedLocationIds.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createService({
        name: formData.name,
        price: parseAmountInput(formData.price),
        durationMinutes: parseInt(formData.duration),
        description: formData.description || undefined,
        categoryId: formData.category || undefined,
        imageUrls: moveThumbnailToFront(formData.images, thumbnailIndex),
        locationIds: selectedLocationIds,
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
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] gap-0 overflow-y-auto rounded-[22px] border-0 sm:max-h-[92vh] sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center gap-3.5 pr-10 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#f2eefa]">
            <Scissors className="h-5 w-5 text-[#2e1f4e]" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-serif text-xl font-medium tracking-[-0.3px]">
              Add service
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px]">
              Create a new service offering
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
        <div className={cn(DIALOG_BODY_PADDING, "space-y-[18px]")}>
          {isChainTier && (
            <LocationScopePicker
              locations={scopedLocations}
              selectedLocationIds={formData.locationIds}
              onChange={(locationIds) => setFormData((prev) => ({ ...prev, locationIds }))}
              disabled={locationsLoading || scopedLocations.length === 0}
            />
          )}
          {hasMixedCurrencies && (
            <p className="text-sm text-destructive">
              Selected branches use different currencies. Select branches sharing the same currency.
            </p>
          )}

          <div className="grid grid-cols-1 gap-[18px]">
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">
                Service name <span className="text-[#2e1f4e]">*</span>
              </Label>
              <Input
                placeholder="e.g. Haircut & Style"
                className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus:ring-[#f2eefa] focus:ring-offset-0">
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

          <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-3">
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">
                Price <span className="text-[#2e1f4e]">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-[46px] rounded-lg border-[#141014]/10 pl-8 pr-3 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, price: formatAmountInput(e.target.value) }))
                  }
                  required
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#141014]/42">
                  {currencySymbol}
                </span>
              </div>
            </div>
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">Currency</Label>
              <Input
                value={selectedCurrency}
                disabled
                className="h-[46px] rounded-lg border-[#141014]/10 bg-[#f1ece3] px-3.5 text-[14.5px] text-[#141014]/42 opacity-100 shadow-none disabled:opacity-100"
              />
            </div>
            <div className="space-y-[7px]">
              <Label className="whitespace-nowrap text-[13.5px] font-normal text-[#141014]/60">
                Duration (min) <span className="text-[#2e1f4e]">*</span>
              </Label>
              <Input
                type="number"
                min="1"
                className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
                value={formData.duration}
                onChange={(e) => setFormData((prev) => ({ ...prev, duration: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">Description</Label>
            <Textarea
              placeholder="Outline what this service includes."
              className="min-h-[96px] resize-y rounded-lg border-[#141014]/10 px-3.5 py-3 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">Images (optional)</Label>
            <ImageUploadZone
              images={formData.images}
              onImagesChange={(images) => setFormData((prev) => ({ ...prev, images }))}
              thumbnailIndex={thumbnailIndex}
              onThumbnailIndexChange={setThumbnailIndex}
              maxImages={2}
              disabled={isSubmitting}
              dropzoneClassName="min-h-[132px] rounded-[14px] border-[1.5px] border-[#141014]/10 bg-white p-7 hover:border-[#2e1f4e]/40 hover:bg-[#fbf9f6]"
            />
          </div>
        </div>

          <DialogFooter className="flex flex-col-reverse gap-2 min-[480px]:flex-row min-[480px]:justify-end min-[480px]:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-11 w-full rounded-full px-5 text-[14.5px] font-medium shadow-none min-[480px]:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="h-11 w-full rounded-full px-5 text-[14.5px] font-medium min-[480px]:w-auto"
            >
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
        if (result?.id) {
          setFormData((prev) => ({ ...prev, category: result.id }));
        }
        return !!result;
      }}
    />
  </>
  );
}
