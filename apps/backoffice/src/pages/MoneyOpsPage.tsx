import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
import { Textarea } from "@ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, ShieldCheck, Percent } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";

type WithdrawalStatus = "pending" | "processing" | "awaiting_otp" | "completed" | "failed";

interface WithdrawalRow {
  id: string;
  tenant_id: string;
  location_id: string | null;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  failure_reason: string | null;
  paystack_transfer_code: string | null;
  requested_at: string;
  transfer_fee: number | null;
  stamp_duty: number | null;
  tenants: { name: string | null } | null;
  salon_wallets: { balance: number; currency: string } | null;
  locations: { name: string | null } | null;
  salon_payout_destinations: {
    account_name: string | null;
    account_number: string | null;
    momo_provider: string | null;
    momo_number: string | null;
  } | null;
}

const statusStyles: Record<WithdrawalStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", label: "Pending" },
  processing: { bg: "bg-primary/10", text: "text-primary", label: "Processing" },
  awaiting_otp: { bg: "bg-warning-bg", text: "text-warning", label: "Awaiting OTP" },
  completed: { bg: "bg-success/10", text: "text-success", label: "Completed" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", label: "Failed" },
};

interface PaymentFeeSettings {
  default_platform_service_charge_percentage: number;
  customer_facing_fee_percentage: number;
}

const mapWriteError = (error: any) => {
  const message = String(error?.message || "");
  if (message.includes("STEP_UP_REQUIRED")) return "Fresh 2FA verification is required.";
  if (message.includes("BACKOFFICE_SUPER_ADMIN_REQUIRED")) return "Only super admins can update fee settings.";
  if (message.includes("INVALID_PERCENTAGE")) return "Percentages must be between 0 and 20.";
  if (message.includes("REASON_REQUIRED")) return "Reason is required for audit logging.";
  return message || "Action failed";
};

type TabKey = "withdrawals" | "verification" | "fees";

const TAB_FOR_PATH: Record<string, TabKey> = {
  "/withdrawals": "withdrawals",
  "/verification-queue": "verification",
  "/fees-margins": "fees",
};

const PATH_FOR_TAB: Record<TabKey, string> = {
  withdrawals: "/withdrawals",
  verification: "/verification-queue",
  fees: "/fees-margins",
};

function WithdrawalsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["backoffice-withdrawals"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("salon_withdrawals" as any)
        .select(
          "id, tenant_id, location_id, amount, currency, status, failure_reason, paystack_transfer_code, requested_at, transfer_fee, stamp_duty, tenants(name), locations(name), salon_wallets(balance, currency), salon_payout_destinations(account_name, account_number, momo_provider, momo_number)",
        )
        .order("requested_at", { ascending: false })
        .limit(200) as any);
      if (error) throw error;
      return (data || []) as unknown as WithdrawalRow[];
    },
  });

  const awaitingOtpCount = useMemo(
    () => withdrawals.filter((w) => w.status === "awaiting_otp").length,
    [withdrawals],
  );

  const filtered = useMemo(
    () => (statusFilter === "all" ? withdrawals : withdrawals.filter((w) => w.status === statusFilter)),
    [withdrawals, statusFilter],
  );

  return (
    <div className="space-y-4">
      {awaitingOtpCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {awaitingOtpCount} withdrawal{awaitingOtpCount === 1 ? "" : "s"} stuck awaiting OTP. Finalize in the
          Paystack dashboard (Transfers) to release funds to the salon.
        </div>
      )}

      <div className="backoffice-panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-[18px] py-3.5">
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {withdrawals.length} withdrawal{withdrawals.length === 1 ? "" : "s"} shown
          </span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="awaiting_otp">Awaiting OTP</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <p className="py-6 text-center text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No withdrawals match this filter.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salon</TableHead>
                <TableHead>Wallet balance</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => {
                const style = statusStyles[w.status] || statusStyles.pending;
                const dest = w.salon_payout_destinations;
                return (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      {w.tenants?.name || "—"}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {w.locations?.name || "Salon-wide / unassigned"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {w.salon_wallets ? formatCurrency(Number(w.salon_wallets.balance), w.salon_wallets.currency) : "—"}
                    </TableCell>
                    <TableCell className="font-variant-numeric-tabular">
                      {formatCurrency(Number(w.amount), w.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {dest
                        ? dest.account_name || dest.momo_provider
                          ? `${dest.account_name || dest.momo_provider} · ${dest.account_number || dest.momo_number || ""}`
                          : "—"
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${style.bg} ${style.text}`}>{style.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={w.failure_reason || undefined}>
                      {w.failure_reason || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(w.requested_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/transactions?tenant_id=${encodeURIComponent(w.tenant_id)}`}>
                          Transactions <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function VerificationTab() {
  const { data = [], isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["payout-recipient-setup-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("salon_payout_destinations")
        .select("id, country, currency, destination_type, tenants(name)")
        .is("paystack_recipient_code", null).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });
  return (
    <div className="backoffice-panel overflow-hidden">
      <div className="flex items-center justify-between border-b px-[18px] py-3.5">
        <div>
          <span className="text-sm font-semibold">Incomplete payout destinations</span>
          <p className="text-xs text-muted-foreground mt-0.5">Ask the salon to add its payout account again to complete setup.</p>
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="py-6 text-center text-muted-foreground">Unable to load payout destinations. Please try again.</p>
      ) : isPending ? (
        <p role="status" className="py-6 text-center text-muted-foreground">Loading payout destinations…</p>
      ) : data.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">No incomplete payout destinations.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Salon</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((destination) => (
              <TableRow key={destination.id}>
                <TableCell>{destination.tenants?.name || "Unnamed salon"}</TableCell>
                <TableCell>{destination.country}</TableCell>
                <TableCell>{destination.currency}</TableCell>
                <TableCell>{destination.destination_type === "bank" ? "Bank" : "Mobile money"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FeesTab() {
  const queryClient = useQueryClient();
  const { backofficeUser, session } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pscInput, setPscInput] = useState("");
  const [cffInput, setCffInput] = useState("");
  const [reason, setReason] = useState("");
  const [securityToken, setSecurityToken] = useState("");
  const [securityError, setSecurityError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings", "payment_fee_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("id, value, updated_at")
        .eq("key", "payment_fee_settings")
        .single();
      if (error) throw error;
      return data as unknown as { id: string; value: PaymentFeeSettings; updated_at: string };
    },
  });

  const settings = data?.value;

  const updateSettings = useMutation({
    mutationFn: async ({
      defaultPsc,
      cff,
      challengeId,
      writeReason,
    }: {
      defaultPsc: number;
      cff: number;
      challengeId: string;
      writeReason: string;
    }) => {
      const { error } = await (supabase.rpc as any)("backoffice_update_payment_fee_settings", {
        p_default_platform_service_charge_percentage: defaultPsc,
        p_customer_facing_fee_percentage: cff,
        p_reason: writeReason,
        p_challenge_id: challengeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "payment_fee_settings"] });
      toast.success("Fee settings updated");
    },
    onError: (error: any) => {
      setSecurityError(mapWriteError(error));
    },
  });

  const openDialog = () => {
    setPscInput(String(settings?.default_platform_service_charge_percentage ?? ""));
    setCffInput(String(settings?.customer_facing_fee_percentage ?? ""));
    setReason("");
    setSecurityToken("");
    setSecurityError("");
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (!session?.access_token || !data?.id) {
      setSecurityError("Session expired. Please sign in again.");
      return;
    }
    const psc = Number(pscInput);
    const cff = Number(cffInput);
    if (!Number.isFinite(psc) || psc < 0 || psc > 20 || !Number.isFinite(cff) || cff < 0 || cff > 20) {
      setSecurityError("Enter valid percentages between 0 and 20.");
      return;
    }
    if (securityToken.trim().length !== 6) {
      setSecurityError("Enter your 6-digit 2FA code.");
      return;
    }
    if (!reason.trim()) {
      setSecurityError("Reason is required for audit logging.");
      return;
    }

    const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
      body: {
        token: securityToken.trim(),
        action: "payment_fee_settings_write",
        resourceId: data.id,
        accessToken: session.access_token,
      },
    });

    if (verify.error || !verify.data?.valid || !verify.data?.challengeId) {
      setSecurityError(verify.data?.error || verify.error?.message || "2FA verification failed");
      return;
    }

    await updateSettings.mutateAsync({
      defaultPsc: psc,
      cff,
      challengeId: verify.data.challengeId,
      writeReason: reason.trim(),
    });

    setDialogOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Booking Payment Fees</CardTitle>
            <CardDescription>
              Applied to every Paystack-split booking and invoice payment. Paystack's own card-processing fee is separate
              and always billed to the customer automatically. Nothing to configure here for that part.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1 shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" />
            2FA required for writes
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="py-6 text-center text-muted-foreground">Loading...</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  Default Platform Service Charge
                </div>
                <p className="text-2xl font-semibold">
                  {settings?.default_platform_service_charge_percentage ?? 0}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Used for checkout when the salon has no custom platform rate. Normally deducted from the salon's share; a
                  salon can flip a Business Settings toggle to push it onto the customer instead.
                </p>
              </div>
              <div className="rounded-2xl border p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  Customer-Facing Fee
                </div>
                <p className="text-2xl font-semibold">{settings?.customer_facing_fee_percentage ?? 0}%</p>
                <p className="text-xs text-muted-foreground">
                  Charged to every customer on every booking payment, regardless of the salon's service-charge choice.
                  Goes entirely to Salon Magik.
                </p>
              </div>
            </div>
          )}
          {data?.updated_at && (
            <p className="text-xs text-muted-foreground">
              Last updated {format(new Date(data.updated_at), "MMM d, yyyy HH:mm")}
            </p>
          )}
          <Button onClick={openDialog} disabled={!isSuperAdmin || isLoading}>
            Edit fee settings
          </Button>
          {!isSuperAdmin && (
            <p className="text-xs text-muted-foreground">Only super admins can edit fee settings.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Fee Settings</DialogTitle>
            <DialogDescription>
              This changes platform-wide defaults. Salons with a custom platform percentage retain their override.
            </DialogDescription>
          </DialogHeader>
          <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
            <div className="space-y-2">
              <Label htmlFor="psc-input">Default Platform Service Charge (%)</Label>
              <Input
                id="psc-input"
                type="number"
                min={0}
                max={20}
                step="0.1"
                value={pscInput}
                onChange={(event) => setPscInput(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cff-input">Customer-Facing Fee (%)</Label>
              <Input
                id="cff-input"
                type="number"
                min={0}
                max={20}
                step="0.1"
                value={cffInput}
                onChange={(event) => setCffInput(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-reason">Reason</Label>
              <Textarea
                id="fee-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why are you changing this?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-token">2FA Token</Label>
              <input
                id="fee-token"
                value={securityToken}
                onChange={(event) => setSecurityToken(event.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
              />
            </div>
            {securityError ? <p className="text-sm text-destructive">{securityError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function MoneyOpsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasBackofficePageAccess, backofficeUser } = useBackofficeAuth();
  const activeTab = TAB_FOR_PATH[location.pathname] || "withdrawals";

  const canSeeTab = (pageKey: string) =>
    backofficeUser?.role === "super_admin" || hasBackofficePageAccess(pageKey);

  const tabs: Array<{ key: TabKey; label: string; pageKey: string; badge?: number }> = [
    { key: "withdrawals", label: "Withdrawals", pageKey: "withdrawals" },
    { key: "verification", label: "Payout setup queue", pageKey: "verification_queue" },
    { key: "fees", label: "Fees & margins", pageKey: "payment_fee_settings" },
  ].filter((t) => canSeeTab(t.pageKey)) as any;

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight">Withdrawals, verification &amp; fees</h1>
          <p className="mt-[3px] max-w-2xl text-[12.5px] text-muted-foreground">
            Three small, related money-ops surfaces — previously three separate nav items, now one place with one filter bar.
          </p>
        </div>

        <div className="flex gap-5 border-b">
          {tabs.map((tab: { key: TabKey; label: string }) => (
            <button
              key={tab.key}
              onClick={() => navigate(PATH_FOR_TAB[tab.key])}
              className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "withdrawals" && <WithdrawalsTab />}
        {activeTab === "verification" && <VerificationTab />}
        {activeTab === "fees" && <FeesTab />}
      </div>
    </BackofficeLayout>
  );
}
