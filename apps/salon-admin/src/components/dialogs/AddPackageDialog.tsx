import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Checkbox } from "@ui/checkbox";
import { ScrollArea } from "@ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Gift, Loader2, Save, Plus, Minus, Scissors, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useServices } from "@/hooks/useServices";
import { useProducts } from "@/hooks/useProducts";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { formatCurrency, getCurrencySymbol } from "@shared/currency";

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

export function AddPackageDialog({ open, onOpenChange, onSuccess, preSelectedItems = [] }: AddPackageDialogProps) {
  const { currentTenant } = useAuth();
  const currencySymbol = getCurrencySymbol(currentTenant?.currency || "USD");
  const { services, isLoading: servicesLoading } = useServices();
  const { products, isLoading: productsLoading } = useProducts();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "products">("services");
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    images: [] as string[],
  });
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

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      description: "",
      images: [],
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
      // Create the package
      const { data: pkg, error: pkgError } = await supabase
        .from("packages")
        .insert({
          tenant_id: currentTenant.id,
          name: formData.name,
          price: parseFloat(formData.price),
          original_price: originalPrice,
          description: formData.description || null,
          image_urls: formData.images,
        })
        .select()
        .single();

      if (pkgError) throw pkgError;

      // Create package items for services
      if (selectedServices.length > 0) {
        const serviceItems = selectedServices.map((s) => ({
          package_id: pkg.id,
          service_id: s.serviceId,
          quantity: s.quantity,
        }));

        const { error: serviceItemsError } = await supabase.from("package_items").insert(serviceItems);
        if (serviceItemsError) throw serviceItemsError;
      }

      // Create package items for products
      if (selectedProducts.length > 0) {
        const productItems = selectedProducts.map((p) => ({
          package_id: pkg.id,
          service_id: selectedServices[0]?.serviceId || services[0]?.id, // Fallback required by schema
          product_id: p.productId,
          quantity: p.quantity,
        }));

        const { error: productItemsError } = await supabase.from("package_items").insert(productItems);
        if (productItemsError) throw productItemsError;
      }

      toast({ title: "Success", description: "Package created successfully" });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Error creating package:", err);
      toast({ title: "Error", description: "Failed to create package", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const savings = originalPrice - parseFloat(formData.price || "0");
  const savingsPercent = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0;

  const totalItemsSelected = selectedServices.length + selectedProducts.length;

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formData.name.trim() !== "" &&
      formData.price !== "" &&
      parseFloat(formData.price) > 0 &&
      totalItemsSelected > 0
    );
  }, [formData, totalItemsSelected]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Create Package</DialogTitle>
            <p className="text-sm text-muted-foreground">Bundle services and products together at a special price</p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Package Name */}
          <div className="space-y-2">
            <Label>
              Package Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Wedding Day Package"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          {/* Select Items - Tabbed Interface */}
          <div className="space-y-2">
            <Label>
              Included Items <span className="text-destructive">*</span>
              {totalItemsSelected > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({totalItemsSelected} selected)
                </span>
              )}
            </Label>
            
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "services" | "products")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="services" className="flex items-center gap-2">
                  <Scissors className="w-4 h-4" />
                  Services
                  {selectedServices.length > 0 && (
                    <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                      {selectedServices.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="products" className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4" />
                  Products
                  {selectedProducts.length > 0 && (
                    <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                      {selectedProducts.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="mt-2">
                <ScrollArea className="h-48 rounded-md border p-2">
                  {servicesLoading ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Loading services...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      No services available. Create some first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {services.map((service) => {
                        const selected = selectedServices.find((s) => s.serviceId === service.id);
                        return (
                          <div
                            key={service.id}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg border transition-colors",
                              selected ? "bg-primary/5 border-primary" : "hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox checked={!!selected} onCheckedChange={() => toggleService(service)} />
                              <div>
                                <p className="font-medium text-sm">{service.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(service.price), currentTenant?.currency || "USD")} • {service.duration_minutes} mins
                                </p>
                              </div>
                            </div>
                            {selected && (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateServiceQuantity(service.id, -1)}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="w-8 text-center text-sm font-medium">{selected.quantity}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateServiceQuantity(service.id, 1)}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="products" className="mt-2">
                <ScrollArea className="h-48 rounded-md border p-2">
                  {productsLoading ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Loading products...
                    </div>
                  ) : products.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      No products available. Create some first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {products.map((product) => {
                        const selected = selectedProducts.find((p) => p.productId === product.id);
                        return (
                          <div
                            key={product.id}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg border transition-colors",
                              selected ? "bg-primary/5 border-primary" : "hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox checked={!!selected} onCheckedChange={() => toggleProduct(product)} />
                              <div>
                                <p className="font-medium text-sm">{product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(Number(product.price), currentTenant?.currency || "USD")}
                                  {product.stock_quantity !== undefined && ` • ${product.stock_quantity} in stock`}
                                </p>
                              </div>
                            </div>
                            {selected && (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateProductQuantity(product.id, -1)}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="w-8 text-center text-sm font-medium">{selected.quantity}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateProductQuantity(product.id, 1)}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Original Value</Label>
              <Input value={formatCurrency(originalPrice, currentTenant?.currency || "USD")} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>
                Package Price ({currencySymbol}) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-9"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  required
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {savings > 0 && (
            <div className="text-sm text-success bg-success/10 rounded-lg p-3 text-center">
              Customers save {formatCurrency(savings, currentTenant?.currency || "USD")} ({savingsPercent}% off)
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe what's included in this package..."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
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
            <Button
              type="submit"
              className="gap-2 w-full sm:w-auto"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Create Package
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
