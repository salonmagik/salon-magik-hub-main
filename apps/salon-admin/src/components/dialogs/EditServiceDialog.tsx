import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Scissors, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useServices } from "@/hooks/useServices";
import { toast } from "@ui/ui/use-toast";
import { ImageUploadZone } from "@/components/catalog/ImageUploadZone";
import { getCurrencySymbol } from "@shared/currency";

interface ServiceData {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
  category_id?: string | null;
  status: string;
  image_urls?: string[];
}

interface EditServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceData | null;
  onSuccess?: () => void;
}

export function EditServiceDialog({ open, onOpenChange, service, onSuccess }: EditServiceDialogProps) {
  const { currentTenant } = useAuth();
  const { categories, refetch } = useServices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currencySymbol = getCurrencySymbol(currentTenant?.currency || "USD");

  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    duration: "",
    description: "",
    images: [] as string[],
  });

  // Initialize form when service changes
  useEffect(() => {
    if (service && open) {
      setFormData({
        name: service.name,
        category: service.category_id || "",
        price: String(service.price),
        duration: String(service.duration_minutes),
        description: service.description || "",
        images: service.image_urls || [],
      });
    }
  }, [service, open]);

  // Track if any changes have been made
  const hasChanges = useMemo(() => {
    if (!service) return false;
    return (
      formData.name !== service.name ||
      formData.category !== (service.category_id || "") ||
      formData.price !== String(service.price) ||
      formData.duration !== String(service.duration_minutes) ||
      formData.description !== (service.description || "") ||
      JSON.stringify(formData.images) !== JSON.stringify(service.image_urls || [])
    );
  }, [formData, service]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;
    
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("services")
        .update({
          name: formData.name,
          price: parseFloat(formData.price),
          duration_minutes: parseInt(formData.duration),
          description: formData.description || null,
          category_id: formData.category || null,
          image_urls: formData.images,
        })
        .eq("id", service.id);

      if (error) throw error;

      toast({ title: "Success", description: "Service updated successfully" });
      onOpenChange(false);
      refetch();
      onSuccess?.();
    } catch (err) {
      console.error("Error updating service:", err);
      toast({ title: "Error", description: "Failed to update service", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!service) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Scissors className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Edit Service</DialogTitle>
            <p className="text-sm text-muted-foreground">Update service details</p>
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
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price & Duration Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Price <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pr-12"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol}</span>
              </div>
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
            <Button type="submit" disabled={isSubmitting || !hasChanges} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Service
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
