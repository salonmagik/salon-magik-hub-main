import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { DatePicker, dateToString, stringToDate } from "@ui/date-picker";
import { Gift, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";
import { getCurrencySymbol } from "@shared/currency";
import { toast } from "@ui/ui/use-toast";

interface VoucherData {
  id: string;
  code: string;
  amount: number;
  balance: number;
  status: string;
  expires_at?: string | null;
}

interface EditVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: VoucherData | null;
  onSuccess?: () => void;
}

const normalizeCountry = (value: string | null | undefined) =>
  (value || "").toLowerCase().replace(/[^a-z]/g, "");

const sortIds = (ids: string[]) => [...ids].sort();

export function EditVoucherDialog({ open, onOpenChange, voucher, onSuccess }: EditVoucherDialogProps) {
  const { currentTenant, activeLocationId } = useAuth();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } = useManageableLocations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalLocationIds, setOriginalLocationIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    code: "",
    expiresAt: "",
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
    if (!voucher || !open) return;
    setFormData({
      code: voucher.code,
      expiresAt: voucher.expires_at ? voucher.expires_at.split("T")[0] : "",
      locationIds: [],
    });
  }, [open, voucher]);

  useEffect(() => {
    if (!voucher || !open || !isChainTier || !currentTenant?.id) {
      setOriginalLocationIds([]);
      return;
    }

    let cancelled = false;
    const loadMappings = async () => {
      const { data, error } = await (supabase.from as any)("voucher_locations")
        .select("location_id")
        .eq("tenant_id", currentTenant.id)
        .eq("voucher_id", voucher.id)
        .eq("is_enabled", true);

      if (error) {
        console.error("Error loading voucher mappings:", error);
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
  }, [currentTenant?.id, isChainTier, open, voucher]);

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
    if (!voucher) return false;
    const originalExpiry = voucher.expires_at ? voucher.expires_at.split("T")[0] : "";

    const contentChanged = formData.code !== voucher.code || formData.expiresAt !== originalExpiry;
    if (!isChainTier) return contentChanged;

    return contentChanged || JSON.stringify(sortIds(selectedLocationIds)) !== JSON.stringify(sortIds(originalLocationIds));
  }, [formData.code, formData.expiresAt, isChainTier, originalLocationIds, selectedLocationIds, voucher]);

  const syncLocationMappings = async (voucherId: string, locationIds: string[]) => {
    if (!currentTenant?.id || !isChainTier) return;

    const { error: deleteError } = await (supabase.from as any)("voucher_locations")
      .delete()
      .eq("tenant_id", currentTenant.id)
      .eq("voucher_id", voucherId);
    if (deleteError) throw deleteError;

    if (locationIds.length === 0) return;

    const rows = locationIds.map((locationId) => ({
      tenant_id: currentTenant.id,
      voucher_id: voucherId,
      location_id: locationId,
      is_enabled: true,
    }));

    const { error: upsertError } = await (supabase.from as any)("voucher_locations").upsert(rows, {
      onConflict: "voucher_id,location_id",
    });

    if (upsertError) throw upsertError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucher) return;

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
        .from("vouchers")
        .update({
          code: formData.code.toUpperCase(),
          expires_at: formData.expiresAt || null,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      await syncLocationMappings(voucher.id, selectedLocationIds);

      toast({ title: "Success", description: "Voucher updated successfully" });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Error updating voucher:", err);
      toast({
        title: "Error",
        description: err.message?.includes("unique") ? "Voucher code already exists" : "Failed to update voucher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!voucher) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Edit Gift Card</DialogTitle>
            <p className="text-sm text-muted-foreground">Update voucher details</p>
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
              Voucher Code <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder="GIFT1234"
              required
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol}</span>
              <Input value={String(voucher.amount)} disabled className="bg-muted pl-8" />
            </div>
            <p className="text-xs text-muted-foreground">Amount cannot be changed after creation</p>
          </div>

          <div className="space-y-2">
            <Label>Expiry Date</Label>
            <DatePicker
              value={stringToDate(formData.expiresAt)}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  expiresAt: dateToString(date),
                }))
              }
              minDate={new Date()}
              placeholder="No expiry"
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
            <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting || !hasChanges || hasMixedCurrencies}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Update Voucher
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
