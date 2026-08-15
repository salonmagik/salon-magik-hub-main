import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@ui/checkbox";
import { ScrollArea } from "@ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Gift, Loader2, Plus, Minus, Scissors, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServices } from "@/hooks/useServices";
import { useProducts } from "@/hooks/useProducts";
import { usePackages } from "@/hooks/usePackages";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import { formatCurrency, getCurrencySymbol } from "@shared/currency";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";

interface PreSelectedItem {
  id: string;
  type: "service" | "product";
  name: string;
  price: number;
}

interface AddPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preSelectedItems?: PreSelectedItem[];
}

interface SelectedService {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
}

interface SelectedProduct {
  productId: string;
  name: string;
  price: number;
  quantity: number;
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

export function AddPackageDialog({ open, onOpenChange, onSuccess, preSelectedItems = [] }: AddPackageDialogProps) {
  const { currentTenant, activeLocationId } = useAuth();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } = useManageableLocations();
  const fallbackCurrency = currentTenant?.currency || "USD";
  const { services, isLoading: servicesLoading } = useServices();
  const { products, isLoading: productsLoading } = useProducts();
  const { createPackage } = usePackages();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "products">("services");
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
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
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);

  // Calculate original price from both services and products
  const originalPrice = 
    selectedServices.reduce((sum, s) => sum + s.price * s.quantity, 0) +
    selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);

  // Initialize with pre-selected items when dialog opens
  useEffect(() => {
    if (open && preSelectedItems.length > 0) {
      const preSelectedServices: SelectedService[] = [];
      const preSelectedProductsList: SelectedProduct[] = [];

      preSelectedItems.forEach((item) => {
        if (item.type === "service") {
          preSelectedServices.push({
            serviceId: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
          });
        } else if (item.type === "product") {
          preSelectedProductsList.push({
            productId: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
          });
        }
      });

      setSelectedServices(preSelectedServices);
      setSelectedProducts(preSelectedProductsList);
      
      // Switch to products tab if only products are selected
      if (preSelectedServices.length === 0 && preSelectedProductsList.length > 0) {
        setActiveTab("products");
      }
    }
  }, [open, preSelectedItems]);

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
      description: "",
      locationIds: scopedDefaultLocationId ? [scopedDefaultLocationId] : [],
    });
    setSelectedServices([]);
    setSelectedProducts([]);
    setActiveTab("services");
  };

  const toggleService = (service: { id: string; name: string; price: number }) => {
    const exists = selectedServices.find((s) => s.serviceId === service.id);
    if (exists) {
      setSelectedServices((prev) => prev.filter((s) => s.serviceId !== service.id));
    } else {
      setSelectedServices((prev) => [
        ...prev,
        { serviceId: service.id, name: service.name, price: Number(service.price), quantity: 1 },
      ]);
    }
  };

  const toggleProduct = (product: { id: string; name: string; price: number }) => {
    const inventoryProduct = products.find((item) => item.id === product.id);
    if (Number(inventoryProduct?.stock_quantity ?? 0) <= 0) return;
    const exists = selectedProducts.find((p) => p.productId === product.id);
    if (exists) {
      setSelectedProducts((prev) => prev.filter((p) => p.productId !== product.id));
    } else {
      setSelectedProducts((prev) => [
        ...prev,
        { productId: product.id, name: product.name, price: Number(product.price), quantity: 1 },
      ]);
    }
  };

  const updateServiceQuantity = (serviceId: string, delta: number) => {
    setSelectedServices((prev) =>
      prev.map((s) => (s.serviceId === serviceId ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s)),
    );
  };

  const updateProductQuantity = (productId: string, delta: number) => {
    setSelectedProducts((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return;
    }

    if (selectedServices.length === 0 && selectedProducts.length === 0) {
      toast({ title: "Error", description: "Please select at least one service or product", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const pkg = await createPackage({
        name: formData.name,
        price: parseAmountInput(formData.price),
        originalPrice: originalPrice || undefined,
        description: formData.description || undefined,
        serviceItems: selectedServices.map((item) => ({
          serviceId: item.serviceId,
          quantity: item.quantity,
        })),
        productItems: selectedProducts.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        fallbackServiceId: selectedServices[0]?.serviceId || services[0]?.id,
        locationIds: selectedLocationIds,
      });

      if (pkg) {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const savings = originalPrice - parseAmountInput(formData.price || "0");
  const savingsPercent = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0;

  const totalItemsSelected = selectedServices.length + selectedProducts.length;

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formData.name.trim() !== "" &&
      formData.price !== "" &&
      parseAmountInput(formData.price) > 0 &&
      selectedLocationIds.length > 0 &&
      !hasMixedCurrencies &&
      totalItemsSelected > 0
    );
  }, [formData, hasMixedCurrencies, selectedLocationIds.length, totalItemsSelected]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] gap-0 rounded-[22px] border-0 sm:max-h-[92vh] sm:max-w-[580px]">
        <DialogHeader className="flex flex-row items-center gap-3.5 pr-10 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#e3f3eb]">
            <Gift className="h-5 w-5 text-[#2e7d5b]" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-serif text-xl font-medium tracking-[-0.3px]">
              Create package
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px]">
              Bundle services and products together at a special price
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
        <div className={cn(DIALOG_BODY_PADDING, "space-y-[18px]")}>
          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">
              Package name <span className="text-[#2e1f4e]">*</span>
            </Label>
            <Input
              className="h-[46px] rounded-lg border-[#141014]/10 px-3.5 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
              placeholder="e.g. Wedding Day Package"
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

          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">
              Included items <span className="text-[#2e1f4e]">*</span>
              {totalItemsSelected > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({totalItemsSelected} selected)
                </span>
              )}
            </Label>
            
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "services" | "products")}>
              <TabsList className="h-auto w-fit max-w-full rounded-full bg-[#f1ece3] p-1">
                <TabsTrigger value="services" className="h-9 rounded-full px-4 text-[13.5px]">
                  <Scissors className="h-3.5 w-3.5" />
                  Services
                  {selectedServices.length > 0 && (
                    <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                      {selectedServices.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="products" className="h-9 rounded-full px-4 text-[13.5px]">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Products
                  {selectedProducts.length > 0 && (
                    <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                      {selectedProducts.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="mt-3">
                <ScrollArea className="h-[220px] rounded-[14px] border border-[#141014]/[0.06] p-2">
                  {servicesLoading ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Loading services...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      No services available. Create some first.
                    </div>
                  ) : (
                    <div>
                      {services.map((service) => {
                        const selected = selectedServices.find((s) => s.serviceId === service.id);
                        return (
                          <div
                            key={service.id}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
                              selected ? "bg-[#fbf9f6]" : "hover:bg-[#fbf9f6]",
                            )}
                          >
                            <Checkbox checked={!!selected} onCheckedChange={() => toggleService(service)} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{service.name}</p>
                              <p className="text-xs text-[#141014]/60">
                                {service.duration_minutes} mins
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <p className="font-serif text-sm">
                                {formatCurrency(Number(service.price), selectedCurrency)}
                              </p>
                              {selected && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-6 w-6 rounded-md"
                                    onClick={() => updateServiceQuantity(service.id, -1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-6 text-center text-xs font-medium">{selected.quantity}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-6 w-6 rounded-md"
                                    onClick={() => updateServiceQuantity(service.id, 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="products" className="mt-3">
                <ScrollArea className="h-[220px] rounded-[14px] border border-[#141014]/[0.06] p-2">
                  {productsLoading ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Loading products...
                    </div>
                  ) : products.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      No products available. Create some first.
                    </div>
                  ) : (
                    <div>
                      {products.map((product) => {
                        const selected = selectedProducts.find((p) => p.productId === product.id);
                        const isOutOfStock = Number(product.stock_quantity ?? 0) <= 0;
                        return (
                          <div
                            key={product.id}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
                              isOutOfStock
                                ? "opacity-45"
                                : selected
                                  ? "bg-[#fbf9f6]"
                                  : "hover:bg-[#fbf9f6]",
                            )}
                          >
                            <Checkbox
                              checked={!!selected}
                              disabled={isOutOfStock}
                              onCheckedChange={() => toggleProduct(product)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{product.name}</p>
                              <p className="text-xs text-[#141014]/60">
                                {isOutOfStock ? "Out of stock" : `${product.stock_quantity} in stock`}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <p className="font-serif text-sm">
                                {formatCurrency(Number(product.price), selectedCurrency)}
                              </p>
                              {selected && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-6 w-6 rounded-md"
                                    onClick={() => updateProductQuantity(product.id, -1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-6 text-center text-xs font-medium">{selected.quantity}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-6 w-6 rounded-md"
                                    onClick={() => updateProductQuantity(product.id, 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2">
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">Original value</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#141014]/42">
                  {currencySymbol}
                </span>
                <Input
                  value={originalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  disabled
                  className="h-[46px] rounded-lg border-[#141014]/10 bg-[#f1ece3] pl-8 pr-3 text-[14.5px] opacity-100 shadow-none disabled:opacity-100"
                />
              </div>
              <p className="text-xs text-[#141014]/42">Calculated automatically from selected items.</p>
            </div>
            <div className="space-y-[7px]">
              <Label className="text-[13.5px] font-normal text-[#141014]/60">
                Package price <span className="text-[#2e1f4e]">*</span>
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
          </div>

          {savings > 0 && (
            <div className="text-sm text-success bg-success/10 rounded-lg p-3 text-center">
              Customers save {formatCurrency(savings, selectedCurrency)} ({savingsPercent}% off)
            </div>
          )}

          <div className="space-y-[7px]">
            <Label className="text-[13.5px] font-normal text-[#141014]/60">Description</Label>
            <Textarea
              placeholder="Describe what's included in this package..."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="min-h-[96px] resize-y rounded-lg border-[#141014]/10 px-3.5 py-3 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa] focus-visible:ring-offset-0"
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
              className="h-11 w-full rounded-full px-5 text-[14.5px] font-medium min-[480px]:w-auto"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create package
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
