import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePayoutDestinations, type PayoutDestination } from "@/hooks/usePayoutDestinations";
import { useBankList } from "@/hooks/useBankList";
import { useAccountVerification } from "@/hooks/useAccountVerification";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Building, Smartphone } from "lucide-react";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { cn } from "@shared/utils";

// Renders flat — no outer Card — intended to be embedded inside a settings section.
export function PayoutDestinationsManager() {
  const { currentTenant } = useAuth();
  const { destinations, isLoading, createDestination, deleteDestination, retrySubaccount } = usePayoutDestinations(currentTenant?.id);

  const [showForm, setShowForm] = useState(false);
  const tenantCountry: "NG" | "GH" = currentTenant?.country === "GH" ? "GH" : "NG";
  const [country, setCountry] = useState<"NG" | "GH">(tenantCountry);
  const [destinationType, setDestinationType] = useState<"bank" | "mobile_money">("bank");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { banks, isLoading: banksLoading } = useBankList(
    country,
    destinationType === "bank" ? "bank" : "mobile_money",
  );

  const { verify, reset, isVerifying, result } = useAccountVerification();
  const currency = currentTenant?.currency || "NGN";

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
    const res = await verify(accountNumber, bank.code);
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

  const handleDeleteDestination = async (id: string) => {
    if (confirm("Remove this payout account?")) await deleteDestination(id);
  };

  const isAccountNumberValid = () => {
    if (!accountNumber) return false;
    if (country === "NG" && destinationType === "bank") return /^\d{10}$/.test(accountNumber);
    return accountNumber.length > 0;
  };

  const canVerify = destinationType === "bank" && selectedBank && isAccountNumberValid();
  const canSave =
    destinationType === "mobile_money"
      ? accountName && selectedBank && isAccountNumberValid()
      : result?.verified && accountName && selectedBank && isAccountNumberValid();

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
      {/* Destination list */}
      {destinations.length > 0 && (
        <div className="divide-y">
          {destinations.map((dest) => (
            <DestinationRow
              key={dest.id}
              destination={dest}
              onDelete={handleDeleteDestination}
              onRetry={retrySubaccount}
            />
          ))}
        </div>
      )}

      {/* Empty state — only shown when no destinations and no form */}
      {destinations.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-2">
          No payout accounts yet. Add one below to enable withdrawals.
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
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
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
              {destinationType === "bank" && (
                <Button type="button" onClick={handleVerifyAccount} disabled={!canVerify || isVerifying} variant="outline" size="sm" className="shrink-0">
                  {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              )}
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

          {destinationType === "mobile_money" && (
            <div className="space-y-1.5">
              <Label htmlFor="accountName">Account Name</Label>
              <Input id="accountName" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account holder name" />
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
      ) : (
        <div className="pt-3">
          <Button onClick={() => setShowForm(true)} variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add account
          </Button>
        </div>
      )}
    </div>
  );
}

interface DestinationRowProps {
  destination: PayoutDestination;
  onDelete: (id: string) => void;
  onRetry: (id: string) => Promise<boolean>;
}

function DestinationRow({ destination, onDelete, onRetry }: DestinationRowProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const isBank = destination.destination_type === "bank";
  const hasError = !!destination.paystack_subaccount_error;
  const isReady = !!destination.paystack_subaccount_code;

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
            {isBank && isReady && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{destination.account_name}</p>
          <p className="text-sm font-mono text-muted-foreground">{isBank ? destination.account_number : destination.momo_number}</p>
          <p className="text-xs text-muted-foreground">{destination.country} · {destination.currency}</p>
          {isBank && hasError && (
            <div className="mt-2 flex items-center justify-between rounded-md bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-destructive">Online Payments Unavailable</p>
                  <p className="text-destructive/80 text-xs">{destination.paystack_subaccount_error}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 text-xs border-destructive/20 hover:bg-destructive/20"
                onClick={async () => {
                  setIsRetrying(true);
                  await onRetry(destination.id);
                  setIsRetrying(false);
                }}
                disabled={isRetrying}
              >
                {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : "Retry"}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(destination.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
