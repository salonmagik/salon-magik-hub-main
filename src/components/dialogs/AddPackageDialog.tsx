import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Gift, Loader2, Save, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServices } from "@/hooks/useServices";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";

interface AddPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface SelectedService {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
}

export function AddPackageDialog({ open, onOpenChange, onSuccess }: AddPackageDialogProps) {
  const { currentTenant } = useAuth();
  const { services, isLoading: servicesLoading } = useServices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    images: [] as string[],
  });
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const originalPrice = selectedServices.reduce((sum, s) => sum + s.price * s.quantity, 0);

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      description: "",
      images: [],
    });
    setSelectedServices([]);
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

  const updateQuantity = (serviceId: string, delta: number) => {
    setSelectedServices((prev) =>
      prev.map((s) => (s.serviceId === serviceId ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return;
    }

    if (selectedServices.length === 0) {
      toast({ title: "Error", description: "Please select at least one service", variant: "destructive" });
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

      // Create package items
      const items = selectedServices.map((s) => ({
        package_id: pkg.id,
        service_id: s.serviceId,
        quantity: s.quantity,
      }));

      const { error: itemsError } = await supabase.from("package_items").insert(items);

      if (itemsError) throw itemsError;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Create Package</DialogTitle>
            <p className="text-sm text-muted-foreground">Bundle services together at a special price</p>
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

          {/* Select Services */}
          <div className="space-y-2">
            <Label>
              Included Services <span className="text-destructive">*</span>
            </Label>
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
                              ${Number(service.price).toFixed(2)} • {service.duration_minutes} mins
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
                              onClick={() => updateQuantity(service.id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{selected.quantity}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(service.id, 1)}
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
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Original Value</Label>
              <Input value={`$${originalPrice.toFixed(2)}`} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>
                Package Price <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                {/* <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /> */}
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
              Customers save ${savings.toFixed(2)} ({savingsPercent}% off)
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
              disabled={isSubmitting || selectedServices.length === 0}
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
