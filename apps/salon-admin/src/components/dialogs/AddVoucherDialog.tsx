import { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { DatePicker, dateToString, stringToDate } from "@ui/date-picker";
import { Gift, Loader2, Save, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useVouchers } from "@/hooks/useVouchers";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { LocationScopePicker } from "@/components/catalog/LocationScopePicker";
import { getCurrenciesForLocations } from "@/lib/locationCurrency";
import { getCurrencySymbol } from "@shared/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { useCustomers } from "@/hooks/useCustomers";

interface AddVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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

function generateVoucherCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function AddVoucherDialog({ open, onOpenChange, onSuccess }: AddVoucherDialogProps) {
  const { currentTenant, activeLocationId } = useAuth();
  const { createVoucher } = useVouchers();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { locations: manageableLocations, defaultLocationId, isLoading: locationsLoading } = useManageableLocations();
  const fallbackCurrency = currentTenant?.currency || "USD";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: generateVoucherCode(),
    amount: "",
    expiresAt: "",
    locationIds: [] as string[],
    voucherType: "gift" as "gift" | "promotion",
    accessType: "public" as "public" | "private",
    discountType: "fixed" as "fixed" | "percentage",
    targetCustomerId: "",
    minimumSpend: "",
    maxRedemptions: "",
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
  const hasMixedCurrencies = locationCurrencies.length > 1;
  const currencySymbol = getCurrencySymbol(selectedCurrency);

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
      code: generateVoucherCode(),
      amount: "",
      expiresAt: "",
      locationIds: scopedDefaultLocationId ? [scopedDefaultLocationId] : [],
      voucherType: "gift",
      accessType: "public",
      discountType: "fixed",
      targetCustomerId: "",
      minimumSpend: "",
      maxRedemptions: "",
    });
  };

  const regenerateCode = () => {
    setFormData((prev) => ({ ...prev, code: generateVoucherCode() }));
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formData.code.trim() !== "" &&
      formData.amount !== "" &&
      parseAmountInput(formData.amount) > 0 &&
      !(formData.voucherType === "promotion" &&
        formData.discountType === "percentage" &&
        parseAmountInput(formData.amount) > 100) &&
      selectedLocationIds.length > 0 &&
      !hasMixedCurrencies &&
      (formData.accessType !== "private" || Boolean(formData.targetCustomerId))
    );
  }, [formData, hasMixedCurrencies, selectedLocationIds.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createVoucher({
        code: formData.code,
        amount: parseAmountInput(formData.amount),
        expiresAt: formData.expiresAt || undefined,
        locationIds: selectedLocationIds,
        voucherType: formData.voucherType,
        accessType: formData.accessType,
        discountType: formData.voucherType === "gift" ? "fixed" : formData.discountType,
        targetCustomerId: formData.targetCustomerId || undefined,
        minimumSpend: parseAmountInput(formData.minimumSpend || "0"),
        maxRedemptions: Number(formData.maxRedemptions) || undefined,
      });

      if (result) {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Create voucher</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Issue stored value or create a promotional offer.
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Voucher type</Label>
              <Select
                value={formData.voucherType}
                onValueChange={(value: "gift" | "promotion") => setFormData((prev) => ({
                  ...prev,
                  voucherType: value,
                  discountType: value === "gift" ? "fixed" : prev.discountType,
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gift">Gift voucher</SelectItem>
                  <SelectItem value="promotion">Promotion</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.voucherType === "gift"
                  ? "Stored monetary value with a remaining balance."
                  : "A checkout discount with usage rules."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select
                value={formData.accessType}
                onValueChange={(value: "public" | "private") => setFormData((prev) => ({
                  ...prev,
                  accessType: value,
                  targetCustomerId: value === "public" ? "" : prev.targetCustomerId,
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public / bearer</SelectItem>
                  <SelectItem value="private">Private customer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.accessType === "private"
                  ? "Only the selected customer can use it."
                  : "The first eligible customer can claim a gift voucher."}
              </p>
            </div>
          </div>

          {formData.accessType === "private" && (
            <div className="space-y-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Select
                value={formData.targetCustomerId}
                onValueChange={(targetCustomerId) => setFormData((prev) => ({ ...prev, targetCustomerId }))}
                disabled={customersLoading}
              >
                <SelectTrigger><SelectValue placeholder={customersLoading ? "Loading customers…" : "Select customer"} /></SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.voucherType === "gift" && (
                <p className="text-xs text-muted-foreground">
                  This value is added to the customer’s salon balance immediately.
                </p>
              )}
            </div>
          )}

          {formData.voucherType === "promotion" && (
            <div className="space-y-2">
              <Label>Discount style</Label>
              <Select
                value={formData.discountType}
                onValueChange={(value: "fixed" | "percentage") => setFormData((prev) => ({ ...prev, discountType: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed amount off</SelectItem>
                  <SelectItem value="percentage">Percentage off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Voucher Code */}
          <div className="space-y-2">
            <Label>
              Voucher Code <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                }
                placeholder="GIFT1234"
                required
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={regenerateCode}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Customers will use this code to redeem
            </p>
          </div>

          {/* Amount */}
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

          <div className="space-y-2">
            <Label>
              {formData.discountType === "percentage" && formData.voucherType === "promotion" ? "Percentage off" : "Value"} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {formData.discountType === "percentage" && formData.voucherType === "promotion" ? "%" : currencySymbol}
              </span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className="pl-8"
                value={formData.amount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, amount: formatAmountInput(e.target.value) }))
                }
                required
              />
            </div>
            {formData.voucherType === "promotion" &&
              formData.discountType === "percentage" &&
              parseAmountInput(formData.amount || "0") > 100 && (
                <p className="text-xs text-destructive">Percentage discounts cannot exceed 100%.</p>
              )}
          </div>

          {formData.voucherType === "promotion" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum spend</Label>
                <Input
                  inputMode="decimal"
                  value={formData.minimumSpend}
                  onChange={(event) => setFormData((prev) => ({ ...prev, minimumSpend: formatAmountInput(event.target.value) }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Total redemption limit</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.maxRedemptions}
                  onChange={(event) => setFormData((prev) => ({ ...prev, maxRedemptions: event.target.value }))}
                  placeholder="Unlimited"
                />
              </div>
            </div>
          )}

          {/* Expiry Date */}
          <div className="space-y-2">
            <Label>Expiry Date (Optional)</Label>
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
            <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting || !isFormValid}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Create voucher
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
