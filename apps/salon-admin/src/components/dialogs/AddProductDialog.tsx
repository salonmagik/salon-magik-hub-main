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
import { Package, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { toast } from "@ui/ui/use-toast";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { getCurrencySymbol } from "@shared/currency";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";
import { moveThumbnailToFront } from "@/lib/imageOrder";

interface AddProductDialogProps {
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

export function AddProductDialog({ open, onOpenChange, onSuccess }: AddProductDialogProps) {
  const { currentTenant, activeLocationId } = useAuth();
  const { createProduct } = useProducts();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } = useManageableLocations();
  const fallbackCurrency = currentTenant?.currency || "USD";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stockQuantity: "0",
    status: "active",
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
      price: "",
      stockQuantity: "0",
      status: "active",
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
      selectedLocationIds.length > 0 &&
      !hasMixedCurrencies
    );
  }, [formData, hasMixedCurrencies, selectedLocationIds.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const product = await createProduct({
        name: formData.name,
        price: parseAmountInput(formData.price),
        stockQuantity: parseInt(formData.stockQuantity),
        status: formData.status as "active" | "inactive" | "archived",
        description: formData.description || null,
        imageUrls: moveThumbnailToFront(formData.images, thumbnailIndex),
        locationIds: selectedLocationIds,
      });

      if (product) {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] gap-0 overflow-y-auto rounded-[22px] border-0 bg-white p-5 shadow-2xl sm:max-h-[92vh] sm:max-w-[560px] sm:p-[34px]">
        <DialogHeader className="mb-7 flex flex-row items-center gap-3.5 pr-10 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#fbf0d4]">
            <Package className="h-5 w-5 text-[#7a5e12]" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-serif text-xl font-medium tracking-[-0.3px] text-[#141014]">
              Add product
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-[#141014]/60">
              Add a new product to your inventory
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-[18px]">
          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">
              Product name <span className="text-[#2e1f4e]">*</span>
            </Label>
            <Input
              placeholder="e.g. Shampoo, Hair Oil"
              className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

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

          <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2">
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">
                Price <span className="text-[#2e1f4e]">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#141014]/42">
                  {currencySymbol}
                </span>
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
              </div>
            </div>
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">Stock quantity</Label>
              <Input
                type="number"
                className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
                value={formData.stockQuantity}
                onChange={(e) => setFormData((prev) => ({ ...prev, stockQuantity: e.target.value }))}
                min="0"
              />
            </div>
          </div>

          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">Status</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v }))}>
              <SelectTrigger className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus:ring-[#f2eefa] focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">Description</Label>
            <Textarea
              placeholder="Describe the product..."
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

          <DialogFooter className="flex flex-col-reverse gap-2 pt-2 min-[480px]:flex-row min-[480px]:justify-end min-[480px]:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-11 w-full rounded-full border-[#141014]/10 px-5 text-[14.5px] font-medium shadow-none hover:bg-[#f1ece3] min-[480px]:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 w-full rounded-full bg-[#141014] px-5 text-[14.5px] font-medium text-white hover:bg-[#2e1f4e] min-[480px]:w-auto"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
