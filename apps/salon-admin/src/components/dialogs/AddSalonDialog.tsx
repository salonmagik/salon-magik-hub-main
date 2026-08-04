import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
  onSuccess?: () => Promise<void> | void;
}

interface LocationGate {
  allowed: number;
  used: number;
  can_add: boolean;
  requires_custom: boolean;
}

interface ChainUnlockRequest {
  id: string;
  requested_locations: number;
  allowed_locations: number;
  status: "pending" | "approved" | "rejected";
}

const SELF_SERVE_CHAIN_LOCATION_LIMIT = 10;

export function AddSalonDialog({ open, onOpenChange, onSuccess }: AddSalonDialogProps) {
  const { currentTenant, refreshTenants } = useAuth();
  const { locations, refetch: refetchLocations } = useLocations();
  const { data: plans } = usePlans();
  const { data: marketCountries } = useMarketCountries();
  const selectableCountries = marketCountries ?? PRODUCT_LIVE_COUNTRIES;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    country: currentTenant?.country || "",
    address: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  // Past the self-serve ceiling (11+ chain locations) needs a human in the
  // loop — everything else that's blocked is self-serve payable from the
  // Subscription tab now, so it gets the "limit reached" redirect instead.
  const needsCustomUnlock =
    isChainPlan &&
    !hasPendingChainUnlock &&
    !canAddLocation &&
    Boolean(locationGate?.requires_custom || crossesSelfServeLimit);
  const isAtBranchLimit = !hasPendingChainUnlock && !canAddLocation && !needsCustomUnlock;

  const goToSubscriptionSettings = () => {
    onOpenChange(false);
    navigate("/salon/subscription");
  };

  const createLocationRecord = async () => {
    if (!currentTenant?.id) return;

    const { error } = await supabase.from("locations").insert({
      tenant_id: currentTenant.id,
      name: formData.name,
      city: formData.city,
      country: formData.country,
      address: formData.address,
      is_default: false,
      availability: "open",
    });

    if (error) throw error;

    if ((isChainPlan || String(currentTenant?.plan || "").toLowerCase() === "chain") && currentTenant?.id) {
      const nextActiveLocations = currentLocationCount + 1;
      await (supabase.rpc as any)("create_tenant_addon_quote_snapshot", {
        p_tenant_id: currentTenant.id,
        p_country_code: formData.country || currentTenant.country,
        p_currency: currentTenant.currency,
        p_included_locations: 1,
        p_active_locations: nextActiveLocations,
        p_extra_locations: Math.max(0, nextActiveLocations - 1),
        p_unit_price_per_extra_location: null,
        p_monthly_addon_total: null,
        p_snapshot: {
          source: "add_branch_dialog",
          location_name: formData.name,
          location_city: formData.city,
          location_country: formData.country,
          allowed_before: allowedLocations,
          used_before: currentLocationCount,
          used_after: nextActiveLocations,
        },
        p_mark_accepted: true,
      });
    }

    toast({ title: "Success", description: "New branch added" });

    // The location-gate query has its own staleTime, so a plain refetch isn't
    // guaranteed to pick up the new count immediately — invalidate it so the
    // dialog shows the right used/allowed numbers next time it opens.
    await Promise.all([
      refreshTenants(),
      refetchLocations(),
      queryClient.invalidateQueries({ queryKey: ["tenant-location-gate", currentTenant.id] }),
    ]);
    await onSuccess?.();
    onOpenChange(false);
    setFormData({ name: "", city: "", country: currentTenant?.country || "", address: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant?.id || !canAddLocation) return;

    setIsSubmitting(true);
    try {
      await createLocationRecord();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add branch",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
        p_reason: `Requested from Add Branch dialog for ${requestedLocations} branches.`,
      });
      if (error) throw error;

      await refetchChainUnlockRequest();
      onOpenChange(false);
      toast({
        title: "Request submitted",
        description: `Your request for ${requestedLocations} branches has been submitted. Support will contact you for activation.`,
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

  if (hasPendingChainUnlock) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-warning-foreground" />
              Unlock request pending
            </DialogTitle>
            <DialogDescription>
              Your request to unlock up to {chainUnlockRequest?.requested_locations} branches is still pending approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (isAtBranchLimit) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-warning-foreground" />
              You've used all your branches
            </DialogTitle>
            <DialogDescription>
              {isOverEntitlement
                ? `You have ${currentLocationCount} branches configured, above your plan's current allowance of ${allowedLocations}.`
                : `You're using all ${allowedLocations} branch${allowedLocations === 1 ? "" : "es"} included in your plan.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Alert>
              <AlertDescription className="space-y-2 border-l border-warning pl-4">
                <p className="font-medium">
                  Current: {currentLocationCount} / {allowedLocations} branches
                </p>
                <p className="text-sm text-muted-foreground">
                  Add more branches from Subscription settings, you'll see the new monthly total before you pay.
                </p>
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={goToSubscriptionSettings} className="gap-2">
              Manage branches & team size
              <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (needsCustomUnlock) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-warning-foreground" />
              Request chain unlock
            </DialogTitle>
            <DialogDescription>
              This branch would push your chain into the custom 11+ tier.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    Current: {currentLocationCount} / {allowedLocations} branches
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Submit a request to activate up to {Math.max(11, nextRequestedLocationCount)} branches.
                    Support will contact you with custom pricing and approval details.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
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
            Add New Branch
          </DialogTitle>
          <DialogDescription>
            Add a new branch ({currentLocationCount} / {allowedLocations} used)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Branch Name *</Label>
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
              disabled={isSubmitting || !formData.name || !formData.city || !formData.country}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Branch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
