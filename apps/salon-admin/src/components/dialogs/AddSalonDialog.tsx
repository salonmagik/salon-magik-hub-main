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
import { PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import { useMarketCountries } from "@/hooks/useMarketCountries";
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

interface ChainUnlockRequest {
  id: string;
  requested_locations: number;
  allowed_locations: number;
  status: "pending" | "approved" | "rejected";
}

const SELF_SERVE_CHAIN_LOCATION_LIMIT = 10;

export function AddSalonDialog({ open, onOpenChange, onSuccess }: AddSalonDialogProps) {
  const { currentTenant } = useAuth();
  const { locations, refetch: refetchLocations } = useLocations();
  const { data: plans } = usePlans();
  const { data: marketCountries } = useMarketCountries();
  const selectableCountries = marketCountries ?? PRODUCT_LIVE_COUNTRIES;

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    country: currentTenant?.country || "",
    address: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showUnlockRequestPrompt, setShowUnlockRequestPrompt] = useState(false);
  const [isSubmittingUnlockRequest, setIsSubmittingUnlockRequest] = useState(false);

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

  const { data: chainUnlockRequest, refetch: refetchChainUnlockRequest } = useQuery({
    queryKey: ["tenant-chain-unlock-request", currentTenant?.id],
    queryFn: async (): Promise<ChainUnlockRequest | null> => {
      if (!currentTenant?.id) return null;
      const { data, error } = await (supabase
        .from("tenant_chain_unlock_requests" as any)
        .select("id, requested_locations, allowed_locations, status")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);
      if (error) throw error;
      return data || null;
    },
    enabled: Boolean(currentTenant?.id && isChainPlan),
  });

  const currentPlan = plans?.find((p) => p.slug === String(currentTenant?.plan || "").toLowerCase());
  const fallbackMax = currentPlan?.limits?.max_locations || 1;
  const fallbackUsed = locations.length;

  const allowedLocations = locationGate?.allowed ?? fallbackMax;
  const currentLocationCount = locationGate?.used ?? fallbackUsed;
  const hasPendingChainUnlock =
    isChainPlan &&
    chainUnlockRequest?.status === "pending" &&
    chainUnlockRequest.requested_locations > chainUnlockRequest.allowed_locations;
  const isOverEntitlement = currentLocationCount > allowedLocations;
  const nextRequestedLocationCount = currentLocationCount + 1;
  const canAddLocation =
    !hasPendingChainUnlock && (locationGate?.can_add ?? currentLocationCount < allowedLocations);
  const crossesSelfServeLimit = isChainPlan && nextRequestedLocationCount > SELF_SERVE_CHAIN_LOCATION_LIMIT;
  const canAutoExpand =
    isChainPlan &&
    !canAddLocation &&
    !hasPendingChainUnlock &&
    !crossesSelfServeLimit &&
    locationGate?.requires_custom === false &&
    Boolean(currentTenant?.id);
  const canSubmitUnlockRequest =
    isChainPlan &&
    !hasPendingChainUnlock &&
    !canAddLocation &&
    Boolean(locationGate?.requires_custom || crossesSelfServeLimit) &&
    Boolean(currentTenant?.id && currentPlan?.id);

  const upgradeMessage = useMemo(() => {
    if (isChainPlan) {
      if (isOverEntitlement) {
        return `Your account currently has ${currentLocationCount} configured locations, which is above your active entitlement of ${allowedLocations}. New locations are blocked until entitlement is updated.`;
      }
      if (hasPendingChainUnlock && chainUnlockRequest) {
        return `Your request to unlock up to ${chainUnlockRequest.requested_locations} stores is pending approval.`;
      }
      if (locationGate?.requires_custom || crossesSelfServeLimit) {
        return "The next tier is marked as custom. Contact sales/support to expand this chain plan.";
      }
      return "You need more location slots for this chain plan.";
    }
    return "Upgrade to the Chain plan to add more locations and unlock multi-salon management features.";
  }, [
    allowedLocations,
    chainUnlockRequest,
    currentLocationCount,
    hasPendingChainUnlock,
    isChainPlan,
    crossesSelfServeLimit,
    isOverEntitlement,
    locationGate?.requires_custom,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      isChainPlan &&
      !hasPendingChainUnlock &&
      !canAddLocation &&
      (locationGate?.requires_custom || crossesSelfServeLimit)
    ) {
      setShowUnlockRequestPrompt(true);
      return;
    }

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
        ? hasPendingChainUnlock
          ? "Your request is pending approval. We'll notify you once extra stores are activated."
          : "Contact support to unlock this custom location tier."
        : "Please visit Settings > Subscription to upgrade your plan.",
    });
    onOpenChange(false);
  };

  const handleSubmitUnlockRequest = async () => {
    if (!currentTenant?.id || !isChainPlan || !currentPlan?.id) return;

    setIsSubmittingUnlockRequest(true);
    try {
      const requestedLocations = Math.max(11, nextRequestedLocationCount);
      const { error } = await (supabase.rpc as any)("submit_chain_unlock_request", {
        p_tenant_id: currentTenant.id,
        p_plan_id: currentPlan.id,
        p_requested_locations: requestedLocations,
        p_reason: `Requested from Add Salon dialog for ${requestedLocations} locations.`,
      });
      if (error) throw error;

      await refetchChainUnlockRequest();
      setShowUnlockRequestPrompt(false);
      onOpenChange(false);
      toast({
        title: "Request submitted",
        description: `Your request for ${requestedLocations} stores has been submitted. Support will contact you for activation.`,
      });
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error.message || "Unable to submit unlock request right now.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingUnlockRequest(false);
    }
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
              {isChainPlan ? (hasPendingChainUnlock ? "Pending approval" : "Contact support") : "Upgrade to Chain"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (showUnlockRequestPrompt) {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setShowUnlockRequestPrompt(false);
          onOpenChange(isOpen);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-warning-foreground" />
              Request chain unlock
            </DialogTitle>
            <DialogDescription>
              This location would push your chain into the custom 11+ tier.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    Current: {currentLocationCount} / {allowedLocations} locations
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Submit a request to activate up to {Math.max(11, nextRequestedLocationCount)} stores.
                    Support will contact you with custom pricing and approval details.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowUnlockRequestPrompt(false);
                onOpenChange(false);
              }}
              disabled={isSubmittingUnlockRequest}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitUnlockRequest} disabled={isSubmittingUnlockRequest}>
              {isSubmittingUnlockRequest && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit request
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
                  {selectableCountries.map((c) => (
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
                (!canAddLocation && !canAutoExpand && !canSubmitUnlockRequest) ||
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
