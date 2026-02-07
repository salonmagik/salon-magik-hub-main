import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Building2, Crown, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { usePlans } from "@/hooks/usePlans";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { COUNTRIES } from "@/lib/countries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddSalonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddSalonDialog({ open, onOpenChange, onSuccess }: AddSalonDialogProps) {
  const { currentTenant } = useAuth();
  const { locations, refetch: refetchLocations } = useLocations();
  const { data: plans } = usePlans();
  
  const [formData, setFormData] = useState({
    name: "",
    city: "",
    country: currentTenant?.country || "",
    address: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Get current plan limits
  const currentPlan = plans?.find(p => p.slug === (currentTenant as any)?.plan_slug);
  const maxLocations = currentPlan?.limits?.max_locations || 1;
  const currentLocationCount = locations.length;
  const canAddLocation = currentLocationCount < maxLocations;
  const isChainPlan = (currentTenant as any)?.plan_slug === "chain";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddLocation) {
      setShowUpgradePrompt(true);
      return;
    }

    if (!currentTenant?.id) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("locations").insert({
        tenant_id: currentTenant.id,
        name: formData.name,
        city: formData.city,
        country: formData.country,
        address: formData.address,
        is_default: false,
      });

      if (error) throw error;

      toast({ title: "Success", description: "New salon location added" });
      await refetchLocations();
      onSuccess?.();
      onOpenChange(false);
      setFormData({ name: "", city: "", country: currentTenant?.country || "", address: "" });
    } catch (error: any) {
      console.error("Error adding location:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to add location", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpgrade = async () => {
    // For now, redirect to settings subscription tab
    toast({ 
      title: "Upgrade Required", 
      description: "Please visit Settings > Subscription to upgrade your plan." 
    });
    onOpenChange(false);
  };

  if (showUpgradePrompt) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) setShowUpgradePrompt(false);
        onOpenChange(isOpen);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-warning-foreground" />
              Upgrade Required
            </DialogTitle>
            <DialogDescription>
              You've reached the maximum number of locations for your current plan.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <Alert>
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Current: {currentLocationCount} / {maxLocations} locations</p>
                  {!isChainPlan ? (
                    <p className="text-sm text-muted-foreground">
                      Upgrade to the <strong>Chain</strong> plan to add more locations and unlock multi-salon management features.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Purchase additional location slots to expand your chain.
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => {
              setShowUpgradePrompt(false);
              onOpenChange(false);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpgrade} className="gap-2">
              {isChainPlan ? "Add More Locations" : "Upgrade to Chain"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Add New Salon
          </DialogTitle>
          <DialogDescription>
            Add a new location to your salon chain ({currentLocationCount} / {maxLocations} used)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Salon Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Downtown Branch"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                placeholder="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Select
                value={formData.country}
                onValueChange={(value) => setFormData({ ...formData, country: value })}
              >
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="Street address (optional)"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.name || !formData.city || !formData.country}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Salon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
