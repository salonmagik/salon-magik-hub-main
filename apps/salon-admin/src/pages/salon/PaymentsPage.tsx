import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Check,
  X,
  Building2,
  History,
  Settings2,
  Search,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { useTransactions } from "@/hooks/useTransactions";
import { useRefunds, type RefundWithDetails } from "@/hooks/useRefunds";
import { useAuth } from "@/hooks/useAuth";
import { useSalonsOverview } from "@/hooks/useSalonsOverview";
import { usePayoutDestinations } from "@/hooks/usePayoutDestinations";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { cn } from "@shared/utils";
import { RequestRefundDialog } from "@/components/dialogs/RequestRefundDialog";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { ExportDropdown } from "@/components/ExportDropdown";
import { WithdrawalDialog } from "@/components/billing/WithdrawalDialog";
import { PayoutDestinationsManager } from "@/components/billing/PayoutDestinationsManager";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";

const methodLabels: Record<string, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
  cash: "Cash",
  pos: "POS",
  transfer: "Transfer",
  purse: "Purse",
};

const statusStyles: Record<string, { bg: string; text: string; icon: any }> = {
  completed: { bg: "bg-success/10", text: "text-success", icon: CheckCircle },
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", icon: Clock },
  failed: { bg: "bg-destructive/10", text: "text-destructive", icon: XCircle },
};

const refundStatusStyles: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  approved: { bg: "bg-success/10", text: "text-success" },
  rejected: { bg: "bg-destructive/10", text: "text-destructive" },
  completed: { bg: "bg-success/10", text: "text-success" },
};

const typeChips: Record<string, { label: string; className: string }> = {
  payment: { label: "Inflow", className: "bg-success/10 text-success" },
  deposit: { label: "Deposit", className: "bg-teal-100 text-teal-700" },
  refund: { label: "Outflow", className: "bg-orange-100 text-orange-700" },
  purse_topup: { label: "Purse Top-up", className: "bg-blue-100 text-blue-700" },
  purse_redemption: { label: "Purse Credit", className: "bg-purple-100 text-purple-700" },
};

const withdrawalStatusStyles: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  processing: { bg: "bg-primary/10", text: "text-primary" },
  completed: { bg: "bg-success/10", text: "text-success" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
};

export default function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "all");
  const [payoutsSubTab, setPayoutsSubTab] = useState("history");
  const [dateFilter, setDateFilter] = useState("all-time");
  const [hubTypeFilter, setHubTypeFilter] = useState("all");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<RefundWithDetails | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [assigningBranchId, setAssigningBranchId] = useState<string | null>(null);
  const [assignDestId, setAssignDestId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);

  const { currentTenant, activeContextType, currentRole } = useAuth();
  const { transactions, stats, isLoading, refetch: refetchTransactions } = useTransactions();
  const { refunds, pendingRefunds, isLoading: refundsLoading, refetch: refetchRefunds, approveRefund, rejectRefund } = useRefunds();
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
  const { withdrawals, isLoading: withdrawalsLoading } = useWithdrawals(
    canManagePayouts ? currentTenant?.id : undefined
  );

  const pageTitle = isOwnerHub ? "Cashflow & Payouts" : "Transactions";
  const currency = currentTenant?.currency || "USD";

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) return;
    // Block URL-based access to payouts tab for unauthorised roles
    if (tab === "payouts" && !canManagePayouts) {
      setActiveTab("all");
      return;
    }
    setActiveTab(tab);
  }, [searchParams, canManagePayouts]);

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { USD: "$", GHS: "₵", NGN: "₦", EUR: "€", GBP: "£" };
    return `${symbols[currency] || currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const handleApprove = async () => {
    if (!selectedRefund) return;
    await approveRefund(selectedRefund.id);
    setSelectedRefund(null);
    setApproveDialogOpen(false);
  };

  const handleReject = async () => {
    if (!selectedRefund || !rejectionReason.trim()) return;
    await rejectRefund(selectedRefund.id, rejectionReason);
    setSelectedRefund(null);
    setRejectDialogOpen(false);
    setRejectionReason("");
  };

  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case "today": { const t = new Date(); t.setHours(0,0,0,0); return { start: t, end: now }; }
      case "week": { const w = new Date(); w.setDate(w.getDate()-7); return { start: w, end: now }; }
      case "month": { const m = new Date(); m.setMonth(m.getMonth()-1); return { start: m, end: now }; }
      default: return null;
    }
  };

  const filteredTransactions = transactions.filter((txn) => {
    const dateRange = getDateRange();
    if (dateRange) {
      const txnDate = new Date(txn.created_at);
      if (txnDate < dateRange.start || txnDate > dateRange.end) return false;
    }
    const matchesSearch =
      txn.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.appointment?.location?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    if (isOwnerHub) {
      if (hubTypeFilter === "revenue") return matchesSearch && txn.type === "payment";
      if (hubTypeFilter === "refunds") return matchesSearch && txn.type === "refund";
      if (hubTypeFilter === "purse") return matchesSearch && (txn.type === "purse_topup" || txn.type === "purse_redemption");
      return matchesSearch;
    }

    if (activeTab === "all") return matchesSearch;
    if (activeTab === "revenue") return matchesSearch && txn.type === "payment";
    if (activeTab === "refunds") return matchesSearch && txn.type === "refund";
    if (activeTab === "purse") return matchesSearch && (txn.type === "purse_topup" || txn.type === "purse_redemption");
    return matchesSearch;
  });

  const handleExport = (fileFormat: "csv" | "xlsx") => {
    const data = filteredTransactions.map((txn) => ({
      Date: fileFormat === "csv" ? format(new Date(txn.created_at), "yyyy-MM-dd HH:mm") : new Date(txn.created_at),
      Branch: txn.appointment?.location?.name || "—",
      Customer: txn.customer?.full_name || "Guest",
      Type: txn.type,
      Method: txn.method,
      Amount: Number(txn.amount),
      Status: txn.status,
    }));
    if (fileFormat === "csv") {
      const csvContent = [
        ["Date", "Branch", "Customer", "Type", "Method", "Amount", "Status"],
        ...filteredTransactions.map((txn) => [
          format(new Date(txn.created_at), "yyyy-MM-dd HH:mm"),
          txn.appointment?.location?.name || "—",
          txn.customer?.full_name || "Guest",
          txn.type, txn.method,
          Number(txn.amount).toFixed(2),
          txn.status,
        ]),
      ].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      XLSX.writeFile(wb, `transactions-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    }
  };

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

  // Shared transaction row renderer
  const renderTransactionRow = (txn: typeof filteredTransactions[0], showBranch = false) => {
    const style = statusStyles[txn.status] || statusStyles.pending;
    const isIncoming = txn.type === "payment" || txn.type === "purse_topup" || txn.type === "deposit";
    const hasBeenRefunded = (txn.type === "payment" || txn.type === "deposit") && refunds.some(
      (r) => r.transaction_id === txn.id && (r.status === "completed" || r.status === "approved")
    );
    const canRefund = (txn.type === "payment" || txn.type === "deposit") && txn.customer_id && !hasBeenRefunded && txn.status === "completed";
    const chip = typeChips[txn.type];

    return (
      <div
        key={txn.id}
        className="flex items-center justify-between p-3 rounded-lg bg-surface gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", isIncoming ? "bg-success/10" : "bg-destructive/10")}>
            {isIncoming ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownLeft className="w-4 h-4 text-destructive" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">{txn.customer?.full_name || "Guest"}</p>
              {chip && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0", chip.className)}>
                  {chip.label}
                </span>
              )}
              {showBranch && txn.appointment?.location?.name && (
                <Badge variant="outline" className="text-xs shrink-0">{txn.appointment.location.name}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {txn.is_split_payment ? (
                <span>Card + Purse · {formatCurrency(txn.split_card_amount || 0)} + {formatCurrency(txn.split_purse_amount || 0)}</span>
              ) : (
                <span>{methodLabels[txn.method] || txn.method}</span>
              )}
              <span>·</span>
              <span>{format(new Date(txn.created_at), "MMM d, h:mm a")}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={cn("font-semibold text-sm", isIncoming ? "text-success" : "text-destructive")}>
              {isIncoming ? "+" : "-"}{formatCurrency(Number(txn.amount))}
            </p>
            <Badge className={cn("text-xs", style.bg, style.text)}>{txn.status}</Badge>
          </div>
          {canRefund && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => { setSelectedTransaction(txn); setRefundDialogOpen(true); }}
                >
                  Request Refund
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  };

  // ─── Hub: All Transactions content ───────────────────────────────────────────
  const renderHubAllTransactions = () => (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: "Today's Inflow", value: formatCurrency(stats.todayRevenue), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
          { title: "Pending Refunds", value: String(pendingRefunds.length), icon: AlertCircle, color: "text-warning-foreground", bg: "bg-warning-bg" },
          { title: "Total Purse Balance", value: formatCurrency(stats.totalPurseBalance), icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title}>
              <CardContent className="p-4 flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">{s.title}</p><p className="text-2xl font-semibold mt-1">{s.value}</p></div>
                <div className={`p-2 rounded-lg ${s.bg}`}><Icon className={`w-5 h-5 ${s.color}`} /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pending Refunds */}
      {pendingRefunds.length > 0 && (
        <Card className="border-warning bg-warning-bg/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-warning-foreground" />
              Pending Refund Requests ({pendingRefunds.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingRefunds.map((refund) => (
              <div key={refund.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                <div>
                  <p className="font-medium text-sm">{refund.customer?.full_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(Number(refund.amount))} · {refund.refund_type.replace("_", " ")}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={() => { setSelectedRefund(refund); setRejectDialogOpen(true); }}><X className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" className="bg-success hover:bg-success/90"
                    onClick={() => { setSelectedRefund(refund); setApproveDialogOpen(true); }}><Check className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search customer or branch…" className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all-time">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={hubTypeFilter} onValueChange={setHubTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="revenue">Inflow</SelectItem>
            <SelectItem value="refunds">Refunds</SelectItem>
            <SelectItem value="purse">Purse</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <ExportDropdown onExport={handleExport} disabled={filteredTransactions.length === 0} />
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            All Transactions
            {filteredTransactions.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2 text-sm">({filteredTransactions.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="flex items-center gap-3 p-3"><Skeleton className="w-9 h-9 rounded-full" /><div><Skeleton className="h-4 w-36 mb-1" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-5 w-20 ml-auto" /></div>)}</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-10"><CreditCard className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" /><p className="text-muted-foreground">No transactions found</p></div>
          ) : (
            <div className="space-y-2">{filteredTransactions.map((txn) => renderTransactionRow(txn, true))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ─── Hub: Payouts content ──────────────────────────────────────────────────
  const renderHubPayouts = () => (
    <div className="space-y-4">
      {/* Wallet balance */}
      <Card>
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><Wallet className="w-6 h-6 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              {walletLoading ? <Skeleton className="h-7 w-32 mt-1" /> : (
                <p className="text-2xl font-semibold mt-0.5">
                  {sharedFormatCurrency(Number(wallet?.balance ?? 0), wallet?.currency ?? currency)}
                </p>
              )}
            </div>
          </div>
          <Button onClick={() => setWithdrawalOpen(true)} disabled={!wallet || Number(wallet.balance) <= 0}>
            Request Withdrawal
          </Button>
        </CardContent>
      </Card>

      {/* Payouts sub-tabs */}
      <Tabs value={payoutsSubTab} onValueChange={setPayoutsSubTab}>
        <TabsList>
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
            <CardContent><PayoutDestinationsManager /></CardContent>
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
  );

  // ─── Branch-level view (unchanged) ────────────────────────────────────────
  const renderBranchView = () => (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: "Today's Inflow", value: formatCurrency(stats.todayRevenue), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
          { title: "Pending Refunds", value: String(pendingRefunds.length), icon: AlertCircle, color: "text-warning-foreground", bg: "bg-warning-bg" },
          { title: "Total Purse Balance", value: formatCurrency(stats.totalPurseBalance), icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title}>
              <CardContent className="p-4 flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">{s.title}</p><p className="text-2xl font-semibold mt-1">{s.value}</p></div>
                <div className={`p-2 rounded-lg ${s.bg}`}><Icon className={`w-5 h-5 ${s.color}`} /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pending Refunds */}
      {pendingRefunds.length > 0 && (
        <Card className="border-warning bg-warning-bg/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning-foreground" />
              Pending Refund Requests ({pendingRefunds.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRefunds.map((refund) => (
              <div key={refund.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{refund.customer?.full_name || "Unknown"}</p>
                    <Badge className={cn("text-xs", refundStatusStyles[refund.status]?.bg, refundStatusStyles[refund.status]?.text)}>{refund.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{formatCurrency(Number(refund.amount))} · {refund.refund_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Reason: {refund.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={() => { setSelectedRefund(refund); setRejectDialogOpen(true); }}><X className="w-4 h-4" /></Button>
                  <Button size="sm" className="bg-success hover:bg-success/90"
                    onClick={() => { setSelectedRefund(refund); setApproveDialogOpen(true); }}><Check className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="revenue" className="gap-2"><ArrowUpRight className="w-4 h-4" />Inflow</TabsTrigger>
          <TabsTrigger value="refunds" className="gap-2"><ArrowDownLeft className="w-4 h-4" />Refunds</TabsTrigger>
          <TabsTrigger value="purse" className="gap-2"><Wallet className="w-4 h-4" />Purse</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search transactions…" className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Date range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all-time">All Time</SelectItem>
              </SelectContent>
            </Select>
            <ExportDropdown onExport={handleExport} disabled={filteredTransactions.length === 0} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-lg">Transactions</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">{[1,2,3,4].map((i) => <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface"><div className="flex items-center gap-4"><Skeleton className="w-10 h-10 rounded-full" /><div><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></div></div><Skeleton className="h-6 w-20" /></div>)}</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-12"><CreditCard className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" /><p className="text-muted-foreground">No transactions found</p></div>
              ) : (
                <div className="space-y-3">{filteredTransactions.map((txn) => renderTransactionRow(txn, false))}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </Tabs>
    </>
  );

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{pageTitle}</h1>
            <p className="text-muted-foreground">
              {isOwnerHub ? "Income, refunds, and payouts across all branches." : "Track transactions, manage refunds, and monitor customer balances."}
            </p>
          </div>
        </div>

        {isOwnerHub ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All Transactions</TabsTrigger>
              {canManagePayouts && (
                <TabsTrigger value="payouts" className="gap-2">
                  <Wallet className="w-4 h-4" />Payouts
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="all" className="mt-6">{renderHubAllTransactions()}</TabsContent>
            {canManagePayouts && (
              <TabsContent value="payouts" className="mt-6">{renderHubPayouts()}</TabsContent>
            )}
          </Tabs>
        ) : (
          renderBranchView()
        )}
      </div>

      {/* Dialogs */}
      <WithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />

      <Dialog open={!!assigningBranchId} onOpenChange={(o) => { if (!o) { setAssigningBranchId(null); setAssignDestId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Payout Account to Branch</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setAssigningBranchId(null)}>Cancel</Button>
            <Button onClick={handleAssignDestination} disabled={!assignDestId || isAssigning}>
              {isAssigning ? "Saving…" : "Assign Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RequestRefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        transaction={selectedTransaction}
        onSuccess={() => { refetchRefunds(); refetchTransactions(); }}
      />

      <ConfirmActionDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        title="Approve Refund"
        description={`Are you sure you want to approve this refund of ${selectedRefund ? formatCurrency(Number(selectedRefund.amount)) : ""}?`}
        confirmLabel="Approve"
        onConfirm={handleApprove}
      />

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reject Refund</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this refund request.</p>
            <div className="space-y-2">
              <Label>Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Enter the reason for rejection…" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectionReason.trim()}>Reject Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalonSidebar>
  );
}
