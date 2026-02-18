import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Alert, AlertDescription } from "@ui/alert";
import { Loader2, Building2, Crown, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { usePlans } from "@/hooks/usePlans";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import { COUNTRIES } from "@shared/countries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";

interface AddSalonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface LocationGate {
  allowed: number;
  used: number;
  can_add: boolean;
  requires_custom: boolean;
}

interface EntitlementExpansionResult {
  success: boolean;
  allowed_locations: number;
  billing_effective_at?: string;
  currency?: string;
  subtotal?: number;
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

  const isChainPlan = String(currentTenant?.plan || "").toLowerCase() === "chain";

  const { data: locationGate } = useQuery({
    queryKey: ["tenant-location-gate", currentTenant?.id],
    queryFn: async (): Promise<LocationGate | null> => {
      if (!currentTenant?.id) return null;
      const { data, error } = await (supabase.rpc as any)("assert_tenant_can_add_location", {
        p_tenant_id: currentTenant.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        allowed: Number(row.allowed || 1),
        used: Number(row.used || 0),
        can_add: Boolean(row.can_add),
        requires_custom: Boolean(row.requires_custom),
      };
    },
    enabled: Boolean(currentTenant?.id),
    staleTime: 1000 * 15,
  });

  const currentPlan = plans?.find((p) => p.slug === String(currentTenant?.plan || "").toLowerCase());
  const fallbackMax = currentPlan?.limits?.max_locations || 1;
  const fallbackUsed = locations.length;

  const allowedLocations = locationGate?.allowed ?? fallbackMax;
  const currentLocationCount = locationGate?.used ?? fallbackUsed;
  const canAddLocation = locationGate?.can_add ?? currentLocationCount < allowedLocations;
  const canAutoExpand =
    isChainPlan &&
    !canAddLocation &&
    locationGate?.requires_custom === false &&
    Boolean(currentTenant?.id);

  const upgradeMessage = useMemo(() => {
    if (isChainPlan) {
      if (locationGate?.requires_custom) {
        return "The next tier is marked as custom. Contact sales/support to expand this chain plan.";
      }
      return "You need more location slots for this chain plan.";
    }
    return "Upgrade to the Chain plan to add more locations and unlock multi-salon management features.";
  }, [isChainPlan, locationGate?.requires_custom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddLocation && !canAutoExpand) {
      setShowUpgradePrompt(true);
      return;
    }

    if (!currentTenant?.id) return;

    setIsSubmitting(true);
    try {
      let expansionResult: EntitlementExpansionResult | null = null;
      if (!canAddLocation && canAutoExpand) {
        const { data, error } = await (supabase.rpc as any)("expand_chain_entitlement_and_log_billing", {
          p_tenant_id: currentTenant.id,
          p_new_allowed_locations: currentLocationCount + 1,
          p_source: "add_salon",
          p_reason: "Tenant added a new salon location from Salon overview.",
        });
        if (error) throw error;
        expansionResult = data as EntitlementExpansionResult;
      }

      const { error } = await supabase.from("locations").insert({
        tenant_id: currentTenant.id,
        name: formData.name,
        city: formData.city,
        country: formData.country,
        address: formData.address,
        is_default: false,
      });

      if (error) throw error;

      if (expansionResult?.billing_effective_at) {
        toast({
          title: "Salon added",
          description: `Location added. Billing adjusts on ${new Date(expansionResult.billing_effective_at).toLocaleDateString()}.`,
        });
      } else {
        toast({ title: "Success", description: "New salon location added" });
      }
      await refetchLocations();
      onSuccess?.();
      onOpenChange(false);
      setFormData({ name: "", city: "", country: currentTenant?.country || "", address: "" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add location",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpgrade = async () => {
    toast({
      title: isChainPlan ? "Expansion required" : "Upgrade Required",
      description: isChainPlan
        ? "Contact support to unlock this custom location tier."
        : "Please visit Settings > Subscription to upgrade your plan.",
    });
    onOpenChange(false);
  };

  if (showUpgradePrompt) {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setShowUpgradePrompt(false);
          onOpenChange(isOpen);
        }}
      >
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
                  <p className="font-medium">
                    Current: {currentLocationCount} / {allowedLocations} locations
                  </p>
                  <p className="text-sm text-muted-foreground">{upgradeMessage}</p>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowUpgradePrompt(false);
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpgrade} className="gap-2">
              {isChainPlan ? "Contact support" : "Upgrade to Chain"}
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
            Add a new location ({currentLocationCount} / {allowedLocations} used)
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
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                (!canAddLocation && !canAutoExpand) ||
                !formData.name ||
                !formData.city ||
                !formData.country
              }
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Salon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
