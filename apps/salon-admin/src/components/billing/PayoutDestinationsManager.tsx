import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalonsOverview } from "@/hooks/useSalonsOverview";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { usePayoutDestinations, type PayoutDestination } from "@/hooks/usePayoutDestinations";
import { useBankList } from "@/hooks/useBankList";
import { useAccountVerification } from "@/hooks/useAccountVerification";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Building, Smartphone } from "lucide-react";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { cn } from "@shared/utils";
import { currencyForCountry } from "@/lib/countryCurrency";

interface PayoutDestinationsManagerProps {
  /** Narrow the list to one country (e.g. from a page-level country switcher). Omit/undefined shows every account. */
  countryFilter?: string;
}

// Renders flat — no outer Card — intended to be embedded inside a settings section.
export function PayoutDestinationsManager({ countryFilter }: PayoutDestinationsManagerProps = {}) {
  const { currentTenant } = useAuth();
  const { destinations: allDestinations, isLoading, createDestination, deleteDestination, setDefaultDestination, refetch: refetchDestinations } = usePayoutDestinations(currentTenant?.id);
  const destinations = countryFilter ? allDestinations.filter((d) => d.country === countryFilter) : allDestinations;
  const { locations } = useSalonsOverview("today");

  // A destination lists every branch it explicitly serves in location_ids —
  // no more implicit "default covers whatever's left" fallback. "General"
  // (the central/unassigned wallet) is governed separately by is_default,
  // independent of which specific branches are also listed.
  const getBranchTags = (dest: PayoutDestination): string[] => [
    ...(dest.is_default ? ["General"] : []),
    ...dest.location_ids.map((id) => locations.find((l) => l.id === id)?.name ?? "Branch"),
  ];

  const [changeBranchTarget, setChangeBranchTarget] = useState<PayoutDestination | null>(null);
  const [changeBranchValue, setChangeBranchValue] = useState<string[]>([]);
  const [isChangingBranch, setIsChangingBranch] = useState(false);

  const openChangeBranch = (dest: PayoutDestination) => {
    setChangeBranchTarget(dest);
    setChangeBranchValue(dest.location_ids ?? []);
  };

  const toggleChangeBranchValue = (locationId: string) => {
    setChangeBranchValue((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId],
    );
  };

  const handleSaveBranchChange = async () => {
    if (!changeBranchTarget) return;
    setIsChangingBranch(true);
    try {
      await supabase
        .from("salon_payout_destinations")
        .update({ location_ids: changeBranchValue })
        .eq("id", changeBranchTarget.id);
      await refetchDestinations();
      setChangeBranchTarget(null);
    } finally {
      setIsChangingBranch(false);
    }
  };

  const [showForm, setShowForm] = useState(false);
  const tenantCountry: "NG" | "GH" = currentTenant?.country === "GH" ? "GH" : "NG";
  const [country, setCountry] = useState<"NG" | "GH">(
    countryFilter === "GH" || countryFilter === "NG" ? countryFilter : tenantCountry
  );
  const [destinationType, setDestinationType] = useState<"bank" | "mobile_money">("bank");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (countryFilter === "GH" || countryFilter === "NG") {
      setCountry(countryFilter);
    }
  }, [countryFilter]);

  const { banks, isLoading: banksLoading } = useBankList(
    country,
    destinationType === "bank" ? "bank" : "mobile_money",
  );

  const { verify, reset, isVerifying, result } = useAccountVerification();
  const currency = currencyForCountry(country, currentTenant?.currency || "NGN");

  useEffect(() => {
    setSelectedBank("");
    setAccountNumber("");
    setAccountName("");
    reset();
  }, [country, destinationType, reset]);


  const handleVerifyAccount = async () => {
    if (!accountNumber || !selectedBank) return;
    const bank = banks.find((b) => b.code === selectedBank);
    if (!bank) return;
    const res = await verify(accountNumber, bank.code, currency);
    if (res.verified && res.accountName) setAccountName(res.accountName);
  };

  const handleSaveDestination = async () => {
    if (!currentTenant?.id) return;
    const bank = banks.find((b) => b.code === selectedBank);
    if (!bank) return;
    setIsSaving(true);
    const created = await createDestination({
      tenantId: currentTenant.id,
      destinationType,
      country,
      currency,
      ...(destinationType === "bank"
        ? { bankCode: bank.code, bankName: bank.name, accountNumber, accountName }
        : { momoProvider: bank.code, momoNumber: accountNumber, accountName }),
      isDefault,
    });
    setIsSaving(false);
    if (created) {
      setShowForm(false);
      setSelectedBank("");
      setAccountNumber("");
      setAccountName("");
      setIsDefault(false);
      reset();
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<PayoutDestination | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [changingDefaultId, setChangingDefaultId] = useState<string | null>(null);
  const handleToggleDefault = async (dest: PayoutDestination) => {
    setChangingDefaultId(dest.id);
    try {
      await setDefaultDestination(dest.id, !dest.is_default);
    } finally {
      setChangingDefaultId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDestination(deleteTarget.id);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const isAccountNumberValid = () => {
    if (!accountNumber) return false;
    if (country === "NG" && destinationType === "bank") return /^\d{10}$/.test(accountNumber);
    return accountNumber.length > 0;
  };

  const canVerify = selectedBank && isAccountNumberValid();
  const canSave = result?.verified && accountName && selectedBank && isAccountNumberValid();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading accounts…</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {destinations.length > 0 && (
        <div className="flex items-center justify-between pb-3">
          <p className="text-sm text-muted-foreground">
            {destinations.length} {destinations.length === 1 ? "account" : "accounts"}
            {countryFilter ? "" : " across your chain"}
          </p>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} variant="outline" size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add account
            </Button>
          )}
        </div>
      )}

      {/* Destination list */}
      {destinations.length > 0 && (
        <div className="divide-y">
          {destinations.map((dest) => (
            <DestinationRow
              key={dest.id}
              destination={dest}
              branchTags={getBranchTags(dest)}
              onDelete={setDeleteTarget}
              onChangeBranch={locations.length > 1 && destinations.length > 1 ? openChangeBranch : undefined}
              onToggleDefault={destinations.length > 1 ? handleToggleDefault : undefined}
              isChangingDefault={changingDefaultId === dest.id}
            />
          ))}
        </div>
      )}

      {/* Empty state — only shown when no destinations and no form */}
      {destinations.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-2">
          {countryFilter && allDestinations.length > 0
            ? "No payout accounts for this country yet. Add one below."
            : "No payout accounts yet. Add one below to enable withdrawals."}
        </p>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="pt-4 space-y-4">
          {destinations.length > 0 && <Separator />}
          <p className="text-sm font-medium">Add payout account</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {country === "GH" ? "Ghana" : "Nigeria"}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select value={destinationType} onValueChange={(v) => setDestinationType(v as "bank" | "mobile_money")}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Account</SelectItem>
                  {/* Paystack doesn't support mobile money payouts in Nigeria — only Ghana. */}
                  {country !== "NG" && <SelectItem value="mobile_money">Mobile Money</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bank">{destinationType === "bank" ? "Bank" : "Provider"}</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank} disabled={banksLoading}>
              <SelectTrigger id="bank">
                <SelectValue placeholder={banksLoading ? "Loading…" : "Select…"} />
              </SelectTrigger>
              <SelectContent>
                {banks.length > 0
                  ? banks.map((b) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)
                  : <SelectItem value="null" disabled>No options available</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountNumber">{destinationType === "bank" ? "Account Number" : "Mobile Number"}</Label>
            <div className="flex gap-2">
              <Input
                id="accountNumber"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={country === "NG" && destinationType === "bank" ? "10-digit account number" : "Enter number"}
              />
              <Button type="button" onClick={handleVerifyAccount} disabled={!canVerify || isVerifying} variant="outline" size="sm" className="shrink-0">
                {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
            {country === "NG" && destinationType === "bank" && accountNumber && !isAccountNumberValid() && (
              <p className="text-xs text-destructive">Must be 10 digits</p>
            )}
          </div>

          {result && (
            <div className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", result.verified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
              {result.verified
                ? <><CheckCircle2 className="h-4 w-4 shrink-0" /><span>Verified: {result.accountName}</span></>
                : <><XCircle className="h-4 w-4 shrink-0" /><span>{result.error || "Verification failed"}</span></>}
            </div>
          )}

          {result?.verified && accountName && (
            <div className="space-y-1.5">
              <Label>Account Name</Label>
              <Input value={accountName} readOnly className="bg-muted" />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 rounded" />
            Set as default payout account
          </label>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowForm(false); setSelectedBank(""); setAccountNumber(""); setAccountName(""); setIsDefault(false); reset(); }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveDestination} disabled={!canSave || isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save account"}
            </Button>
          </div>
        </div>
      ) : destinations.length === 0 ? (
        <div className="pt-3">
          <Button onClick={() => setShowForm(true)} variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add account
          </Button>
        </div>
      ) : null}

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove payout account?"
        description={
          deleteTarget
            ? `${deleteTarget.destination_type === "bank" ? deleteTarget.bank_name : deleteTarget.momo_provider} — ${deleteTarget.destination_type === "bank" ? deleteTarget.account_number : deleteTarget.momo_number} will no longer be available to receive withdrawals.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />

      <Dialog open={!!changeBranchTarget} onOpenChange={(open) => { if (!open) setChangeBranchTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Which branches use this account?</DialogTitle></DialogHeader>
          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
            <p className="text-sm text-muted-foreground">
              {changeBranchTarget?.destination_type === "bank" ? changeBranchTarget.bank_name : changeBranchTarget?.momo_provider}
              {" — "}
              {changeBranchTarget?.destination_type === "bank" ? changeBranchTarget.account_number : changeBranchTarget?.momo_number}
            </p>
            <div className="space-y-2">
              <Label>Branches</Label>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No branches to assign yet.</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {locations.map((location) => (
                    <label key={location.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={changeBranchValue.includes(location.id)}
                        onChange={() => toggleChangeBranchValue(location.id)}
                      />
                      {location.name}
                    </label>
                  ))}
                </div>
              )}
              {changeBranchValue.length === 0 && (
                <p className="text-xs text-muted-foreground">Not assigned to any branch — it'll only appear if picked for one during a withdrawal.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeBranchTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveBranchChange} disabled={isChangingBranch}>
              {isChangingBranch ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DestinationRowProps {
  destination: PayoutDestination;
  branchTags: string[];
  onDelete: (destination: PayoutDestination) => void;
  onChangeBranch?: (destination: PayoutDestination) => void;
  onToggleDefault?: (destination: PayoutDestination) => void;
  isChangingDefault: boolean;
}

function DestinationRow({ destination, branchTags, onDelete, onChangeBranch, onToggleDefault, isChangingDefault }: DestinationRowProps) {
  const isBank = destination.destination_type === "bank";
  const isReady = !!destination.paystack_recipient_code;

  return (
    <div className="py-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">
          {isBank ? <Building className="h-4 w-4 text-muted-foreground" /> : <Smartphone className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm">{isBank ? destination.bank_name : destination.momo_provider}</p>
            {destination.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
            {isReady && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{destination.account_name}</p>
          <p className="text-sm font-mono text-muted-foreground">{isBank ? destination.account_number : destination.momo_number}</p>
          <p className="text-xs text-muted-foreground">{destination.country} · {destination.currency}</p>
          {onToggleDefault && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onToggleDefault(destination)}
                disabled={isChangingDefault}
                className="text-xs text-primary underline underline-offset-2 disabled:opacity-50"
              >
                {isChangingDefault ? "Saving…" : destination.is_default ? "Remove as default" : "Set as default payout account"}
              </button>
            </div>
          )}
          {onChangeBranch && (
            branchTags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {branchTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>
                ))}
                <button type="button" onClick={() => onChangeBranch(destination)} className="text-xs text-primary underline underline-offset-2">
                  Change
                </button>
              </div>
            ) : (
              <div className="pt-1">
                <button type="button" onClick={() => onChangeBranch(destination)} className="text-xs italic text-muted-foreground underline underline-offset-2">
                  Not assigned to a branch — assign
                </button>
              </div>
            )
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(destination)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
