import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Skeleton } from "@ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Label } from "@ui/label";
import {
  Wallet,
  Building2,
  History,
  Settings2,
  Info,
  X,
  ShieldAlert,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useSalonsOverview } from "@/hooks/useSalonsOverview";
import { usePayoutDestinations } from "@/hooks/usePayoutDestinations";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useSalonWalletAvailability } from "@/hooks/useSalonWalletAvailability";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { usePayoutMode } from "@/hooks/usePayoutMode";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { cn } from "@shared/utils";
import { WithdrawalDialog } from "@/components/billing/WithdrawalDialog";
import { PayoutDestinationsManager } from "@/components/billing/PayoutDestinationsManager";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";

const withdrawalStatusStyles: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  processing: { bg: "bg-primary/10", text: "text-primary" },
  completed: { bg: "bg-success/10", text: "text-success" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
};

export default function PayoutsPage() {
  useWalkthroughAutoTrigger("transactions");
  const [payoutsSubTab, setPayoutsSubTab] = useState("history");
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [assigningBranchId, setAssigningBranchId] = useState<string | null>(null);
  const [assignDestId, setAssignDestId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string>("");

  const { currentTenant, activeContextType, currentRole } = useAuth();
  const { locations, isLoading: locationsLoading } = useSalonsOverview("today");

  const isOwnerHub = activeContextType === "owner_hub";
  // Payouts management (accounts, withdrawals, assignments) is restricted to
  // owner/manager/supervisor — stylists and receptionists never see or access it.
  const canManagePayouts = isOwnerHub && (
    currentRole === "owner" || currentRole === "manager" || currentRole === "supervisor"
  );

  const { destinations, isLoading: destinationsLoading, refetch: refetchDestinations } = usePayoutDestinations(
    canManagePayouts ? currentTenant?.id : undefined
  );
  const { wallet, isLoading: walletLoading } = useSalonWallet(
    canManagePayouts ? currentTenant?.id : undefined
  );
  const { availability: walletAvailability, isLoading: walletAvailabilityLoading } = useSalonWalletAvailability(
    canManagePayouts ? currentTenant?.id : undefined
  );
  const { payoutMode } = usePayoutMode();
  const { withdrawals, isLoading: withdrawalsLoading } = useWithdrawals(
    canManagePayouts ? currentTenant?.id : undefined
  );

  const currency = currentTenant?.currency || "USD";
  const availableCountries = Array.from(new Set(locations.map((loc) => loc.country))).sort();
  const effectiveCountry = availableCountries.includes(selectedCountry)
    ? selectedCountry
    : (currentTenant?.country && availableCountries.includes(currentTenant.country) ? currentTenant.country : availableCountries[0]) || "";

  const tenantDefaultDest = destinations.find((d) => !d.location_id && d.is_default);
  const getDestinationForBranch = (branchId: string) => destinations.find((d) => d.location_id === branchId);

  const handleAssignDestination = async () => {
    if (!assigningBranchId || !assignDestId) return;
    setIsAssigning(true);
    try {
      await supabase.from("salon_payout_destinations").update({ location_id: assigningBranchId }).eq("id", assignDestId);
      await refetchDestinations();
      setAssigningBranchId(null);
      setAssignDestId("");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClearBranchAssignment = async (branchId: string) => {
    const dest = getDestinationForBranch(branchId);
    if (!dest) return;
    await supabase.from("salon_payout_destinations").update({ location_id: null }).eq("id", dest.id);
    await refetchDestinations();
  };

  if (!canManagePayouts) {
    return (
      <SalonSidebar>
        <div className="mx-auto flex w-full max-w-[1500px] flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-medium">Payouts isn't available here</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Payout accounts and withdrawals are managed by the salon owner, manager, or supervisor from the owner hub.
          </p>
        </div>
      </SalonSidebar>
    );
  }

  return (
    <SalonSidebar>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 sm:space-y-9">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Payouts</h1>
            <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Withdraw your salon balance and manage where your earnings are paid out.
            </p>
          </div>
          {availableCountries.length > 1 && (
            <Select value={effectiveCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableCountries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "GH" ? "Ghana" : c === "NG" ? "Nigeria" : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Wallet balance */}
        <Card>
          <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10"><Wallet className="w-6 h-6 text-primary" /></div>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-sm text-muted-foreground">Available to Withdraw</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-xs">
                      Funds that have fully cleared with our payment processor and can be paid out right now. Separate from customer store credit or prepaid funds.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {walletLoading || walletAvailabilityLoading ? <Skeleton className="h-7 w-32 mt-1" /> : (
                  <>
                    <p className="text-2xl font-semibold mt-0.5">
                      {sharedFormatCurrency(walletAvailability?.available ?? Number(wallet?.balance ?? 0), wallet?.currency ?? currency)}
                    </p>
                    {payoutMode === "on_demand" && Number(walletAvailability?.pending ?? 0) > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-amber-700 mt-1 cursor-default">
                            + {sharedFormatCurrency(walletAvailability!.pending, wallet?.currency ?? currency)} still settling
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64 text-xs">
                          Recent payments are held by our payment processor (Paystack) for up to 1 business day before they can be paid out. This is standard for all Paystack merchants.
                          {walletAvailability?.nextSettlementAt
                            ? ` Available by ${new Date(walletAvailability.nextSettlementAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`
                            : ""}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {payoutMode === "automatic" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        You're on automatic payouts — booking payments go straight to your bank, about 1 business day after each one clears.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Total wallet balance: {sharedFormatCurrency(Number(wallet?.balance ?? 0), wallet?.currency ?? currency)}
                    </p>
                  </>
                )}
              </div>
            </div>
            <Button onClick={() => setWithdrawalOpen(true)} disabled={!wallet || Number(walletAvailability?.available ?? wallet.balance) <= 0}>
              Request Withdrawal
            </Button>
          </CardContent>
        </Card>

        {/* Payouts sub-tabs */}
        <Tabs value={payoutsSubTab} onValueChange={setPayoutsSubTab}>
          <TabsList className="h-auto w-full justify-start rounded-full bg-muted/70 p-1.5 lg:w-auto">
            <TabsTrigger value="history" className="gap-2"><History className="w-4 h-4" />History</TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2"><Building2 className="w-4 h-4" />Accounts</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings2 className="w-4 h-4" />Settings</TabsTrigger>
          </TabsList>

          {/* History */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Payout History</CardTitle>
              </CardHeader>
              <CardContent>
                {withdrawalsLoading ? (
                  <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="flex justify-between p-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-20" /></div>)}</div>
                ) : withdrawals.length === 0 ? (
                  <div className="text-center py-10"><Wallet className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" /><p className="text-muted-foreground">No withdrawals yet</p></div>
                ) : (
                  <div className="space-y-2">
                    {withdrawals.map((w) => {
                      const dest = destinations.find((d) => d.id === w.payout_destination_id);
                      const wStyle = withdrawalStatusStyles[w.status || "pending"] || withdrawalStatusStyles.pending;
                      return (
                        <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-surface">
                          <div>
                            <p className="font-medium text-sm">{sharedFormatCurrency(Number(w.amount), w.currency)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {dest ? `${dest.account_name || dest.momo_provider} · ${dest.account_number || dest.momo_number}` : "Payout account"}
                              {w.requested_at && ` · ${format(new Date(w.requested_at), "MMM d, yyyy")}`}
                            </p>
                          </div>
                          <Badge className={cn("text-xs", wStyle.bg, wStyle.text)}>{w.status || "pending"}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accounts */}
          <TabsContent value="accounts" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Branch Payout Accounts</CardTitle>
                <p className="text-sm text-muted-foreground">Each branch can have its own receiving account. Branches without one use the tenant default.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {locationsLoading || destinationsLoading ? (
                  [1,2].map((i) => <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface"><Skeleton className="h-4 w-40" /><Skeleton className="h-8 w-28" /></div>)
                ) : locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No branches found.</p>
                ) : (
                  locations.map((branch) => {
                    const branchDest = getDestinationForBranch(branch.id);
                    const displayDest = branchDest ?? tenantDefaultDest;
                    const isDefault = !branchDest;
                    return (
                      <div key={branch.id} className="flex items-start justify-between p-3 rounded-lg bg-surface gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-muted"><Building2 className="w-4 h-4 text-muted-foreground" /></div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{branch.name}</p>
                            <p className="text-xs text-muted-foreground">{branch.city}, {branch.country}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {displayDest ? (
                            <div className="text-right">
                              <p className="text-sm font-medium">{displayDest.account_name || displayDest.bank_name || displayDest.momo_provider}</p>
                              <p className="text-xs text-muted-foreground">
                                {displayDest.account_number || displayDest.momo_number}
                                {isDefault && <span className="ml-1 text-primary">(default)</span>}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">No account</p>
                          )}
                          <Button size="sm" variant="outline" onClick={() => { setAssigningBranchId(branch.id); setAssignDestId(branchDest?.id ?? ""); }}>
                            {branchDest ? "Change" : "Assign"}
                          </Button>
                          {branchDest && (
                            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handleClearBranchAssignment(branch.id)}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">All Payout Accounts</CardTitle>
                <p className="text-sm text-muted-foreground">Manage bank accounts and mobile money accounts for receiving withdrawals.</p>
              </CardHeader>
              <CardContent><PayoutDestinationsManager countryFilter={effectiveCountry || undefined} /></CardContent>
            </Card>
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardContent className="py-10 text-center">
                <Settings2 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">Payout schedule and auto-payout settings coming soon.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <WithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />

      <Dialog open={!!assigningBranchId} onOpenChange={(o) => { if (!o) { setAssigningBranchId(null); setAssignDestId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Payout Account to Branch</DialogTitle></DialogHeader>
          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
            <p className="text-sm text-muted-foreground">Select which payout account should receive withdrawals for this branch.</p>
            {destinations.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No payout accounts configured yet. Add one in Accounts first.</p>
            ) : (
              <div className="space-y-2">
                <Label>Payout Account</Label>
                <Select value={assignDestId} onValueChange={setAssignDestId}>
                  <SelectTrigger><SelectValue placeholder="Select an account…" /></SelectTrigger>
                  <SelectContent>
                    {destinations.map((dest) => (
                      <SelectItem key={dest.id} value={dest.id}>
                        {dest.account_name || dest.momo_provider} — {dest.account_number || dest.momo_number}
                        {dest.is_default && " (default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningBranchId(null)}>Cancel</Button>
            <Button onClick={handleAssignDestination} disabled={!assignDestId || isAssigning}>
              {isAssigning ? "Saving…" : "Assign Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalonSidebar>
  );
}
