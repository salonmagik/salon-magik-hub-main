import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { getCurrencySymbol, formatCurrency } from "@/lib/currency";

interface PackageData {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  original_price?: number | null;
  status: string;
  image_urls?: string[];
}

interface EditPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: PackageData | null;
  onSuccess?: () => void;
}

export function EditPackageDialog({ open, onOpenChange, pkg, onSuccess }: EditPackageDialogProps) {
  const { currentTenant } = useAuth();
  const currencySymbol = getCurrencySymbol(currentTenant?.currency || "USD");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    images: [] as string[],
  });

  // Initialize form when package changes
  useEffect(() => {
    if (pkg && open) {
      setFormData({
        name: pkg.name,
        price: String(pkg.price),
        description: pkg.description || "",
        images: pkg.image_urls || [],
      });
    }
  }, [pkg, open]);

  // Track if any changes have been made
  const hasChanges = useMemo(() => {
    if (!pkg) return false;
    return (
      formData.name !== pkg.name ||
      formData.price !== String(pkg.price) ||
      formData.description !== (pkg.description || "") ||
      JSON.stringify(formData.images) !== JSON.stringify(pkg.image_urls || [])
    );
  }, [formData, pkg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkg) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("packages")
        .update({
          name: formData.name,
          price: parseFloat(formData.price),
          description: formData.description || null,
          image_urls: formData.images,
        })
        .eq("id", pkg.id);

      if (error) throw error;

      toast({ title: "Success", description: "Package updated successfully" });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Error updating package:", err);
      toast({ title: "Error", description: "Failed to update package", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!pkg) return null;

  const savings = (pkg.original_price || 0) - parseFloat(formData.price || "0");
  const savingsPercent = pkg.original_price ? Math.round((savings / pkg.original_price) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Edit Package</DialogTitle>
            <p className="text-sm text-muted-foreground">Update package details</p>
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

          {/* Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Original Value</Label>
              <Input
                value={pkg.original_price ? formatCurrency(pkg.original_price, currentTenant?.currency || "USD") : "N/A"}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Package Price ({currencySymbol}) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                required
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Savings Display */}
          {pkg.original_price && savings > 0 && (
            <div className="text-sm text-success">
              Customers save {savingsPercent}% ({formatCurrency(savings, currentTenant?.currency || "USD")})
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe what's included in this package..."
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
            <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting || !hasChanges}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Package
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
