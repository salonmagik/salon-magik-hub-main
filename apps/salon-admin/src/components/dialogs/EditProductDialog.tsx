import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Hash, Loader2, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { toast } from "@ui/ui/use-toast";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";
import { getCurrencySymbol } from "@shared/currency";
import { moveThumbnailToFront } from "@/lib/imageOrder";

interface ProductData {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  stock_quantity: number;
  status: string;
  image_urls?: string[];
}

interface EditProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductData | null;
  onSuccess?: () => void;
}

const normalizeCountry = (value: string | null | undefined) =>
  (value || "").toLowerCase().replace(/[^a-z]/g, "");

const sortIds = (ids: string[]) => [...ids].sort();

export function EditProductDialog({ open, onOpenChange, product, onSuccess }: EditProductDialogProps) {
  const { currentTenant, activeLocationId } = useAuth();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } = useManageableLocations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [originalLocationIds, setOriginalLocationIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stockQuantity: "",
    status: "active",
    description: "",
    images: [] as string[],
    locationIds: [] as string[],
  });

  const isChainTier = String(currentTenant?.plan || "").toLowerCase() === "chain";
  const fallbackCurrency = currentTenant?.currency || "USD";

  const activeLocationCountry = useMemo(() => {
    if (!activeLocationId) return null;
    return manageableLocations.find((location) => location.id === activeLocationId)?.country || null;
  }, [activeLocationId, manageableLocations]);

  const scopedLocations = useMemo(() => {
    if (!isChainTier || !activeLocationCountry) return manageableLocations;
    const activeCountryKey = normalizeCountry(activeLocationCountry);
    return manageableLocations.filter((location) => normalizeCountry(location.country) === activeCountryKey);
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
    if (!product || !open) return;
    setFormData({
      name: product.name,
      price: String(product.price),
      stockQuantity: String(product.stock_quantity),
      status: product.status,
      description: product.description || "",
      images: product.image_urls || [],
      locationIds: [],
    });
    setThumbnailIndex(0);
  }, [open, product]);

  useEffect(() => {
    if (!product || !open || !isChainTier || !currentTenant?.id) {
      setOriginalLocationIds([]);
      return;
    }

    let cancelled = false;
    const loadMappings = async () => {
      const { data, error } = await (supabase.from as any)("product_locations")
        .select("location_id")
        .eq("tenant_id", currentTenant.id)
        .eq("product_id", product.id)
        .eq("is_enabled", true);

      if (error) {
        console.error("Error loading product mappings:", error);
        return;
      }
      if (cancelled) return;

      const mapped = Array.from(new Set(((data ?? []) as Array<{ location_id: string }>).map((row) => row.location_id)));
      setOriginalLocationIds(mapped);
      setFormData((prev) => ({ ...prev, locationIds: mapped }));
    };

    void loadMappings();
    return () => {
      cancelled = true;
    };
  }, [currentTenant?.id, isChainTier, open, product]);

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

  const hasChanges = useMemo(() => {
    if (!product) return false;

    const contentChanged =
      formData.name !== product.name ||
      formData.price !== String(product.price) ||
      formData.stockQuantity !== String(product.stock_quantity) ||
      formData.status !== product.status ||
      formData.description !== (product.description || "") ||
      JSON.stringify(formData.images) !== JSON.stringify(product.image_urls || []);

    if (!isChainTier) return contentChanged;
    return contentChanged || JSON.stringify(sortIds(selectedLocationIds)) !== JSON.stringify(sortIds(originalLocationIds));
  }, [formData, isChainTier, originalLocationIds, product, selectedLocationIds]);

  const syncLocationMappings = async (productId: string, locationIds: string[]) => {
    if (!currentTenant?.id || !isChainTier) return;

    const { error: deleteError } = await (supabase.from as any)("product_locations")
      .delete()
      .eq("tenant_id", currentTenant.id)
      .eq("product_id", productId);
    if (deleteError) throw deleteError;

    if (locationIds.length === 0) return;

    const rows = locationIds.map((locationId) => ({
      tenant_id: currentTenant.id,
      product_id: productId,
      location_id: locationId,
      is_enabled: true,
    }));

    const { error: upsertError } = await (supabase.from as any)("product_locations").upsert(rows, {
      onConflict: "product_id,location_id",
    });
    if (upsertError) throw upsertError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    if (isChainTier && selectedLocationIds.length === 0) {
      toast({ title: "Select branches", description: "Choose at least one branch.", variant: "destructive" });
      return;
    }

    if (hasMixedCurrencies) {
      toast({
        title: "Mixed currency mapping",
        description: "Selected branches use different currencies. Choose one currency group.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("products")
        .update({
          name: formData.name,
          price: parseFloat(formData.price),
          stock_quantity: parseInt(formData.stockQuantity, 10),
          status: formData.status as "active" | "inactive" | "archived",
          description: formData.description || null,
          image_urls: moveThumbnailToFront(formData.images, thumbnailIndex),
        })
        .eq("id", product.id);

      if (error) throw error;

      await syncLocationMappings(product.id, selectedLocationIds);

      toast({ title: "Success", description: "Product updated successfully" });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Error updating product:", err);
      toast({ title: "Error", description: "Failed to update product", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Edit Product</DialogTitle>
            <p className="text-sm text-muted-foreground">Update product details</p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {isChainTier ? (
            <LocationScopePicker
              locations={scopedLocations}
              selectedLocationIds={formData.locationIds}
              onChange={(locationIds) => setFormData((prev) => ({ ...prev, locationIds }))}
              disabled={locationsLoading || scopedLocations.length === 0 || isSubmitting}
            />
          ) : null}

          {hasMixedCurrencies ? (
            <p className="text-sm text-destructive">
              Selected branches use different currencies. Select branches sharing the same currency.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label>
              Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Shampoo, Hair Oil"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-1">
              <Label>
                Price <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-8"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  required
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Currency</Label>
              <Input value={selectedCurrency} disabled />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Stock Quantity</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="pl-9"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData((prev) => ({ ...prev, stockQuantity: e.target.value }))}
                  min="0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe the product..."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Images (Optional)</Label>
            <ImageUploadZone
              images={formData.images}
              onImagesChange={(images) => setFormData((prev) => ({ ...prev, images }))}
              thumbnailIndex={thumbnailIndex}
              onThumbnailIndexChange={setThumbnailIndex}
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
            <Button
              type="submit"
              className="gap-2 w-full sm:w-auto"
              disabled={isSubmitting || !hasChanges || hasMixedCurrencies}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Update Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
