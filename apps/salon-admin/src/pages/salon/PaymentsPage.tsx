import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Label } from "@ui/label";
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
  Banknote,
  ChevronRight,
  Plus,
  FileText,
  FileSpreadsheet,
  Info,
  Download,
  Loader2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { toast } from "@ui/ui/use-toast";
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
import { useSalonWalletAvailability } from "@/hooks/useSalonWalletAvailability";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { supabase } from "@/lib/supabase";
import { endOfDay, endOfMonth, format, startOfDay, startOfMonth, subDays } from "date-fns";
import { cn } from "@shared/utils";
import { RequestRefundDialog } from "@/components/dialogs/RequestRefundDialog";
import { RejectRefundDialog } from "@/components/dialogs/RejectRefundDialog";
import { ExportDropdown } from "@/components/ExportDropdown";
import { WithdrawalDialog } from "@/components/billing/WithdrawalDialog";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { PayoutDestinationsManager } from "@/components/billing/PayoutDestinationsManager";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { currencyForCountry } from "@/lib/countryCurrency";
import { CustomerBalancesPanel } from "@/components/payments/CustomerBalancesPanel";
import { DateRangePicker, type DateRangePreset } from "@ui/date-range-picker";

const TRANSACTION_RANGE_PRESETS: DateRangePreset[] = [
  { label: "Today", getRange: () => { const now = new Date(); return { from: now, to: now }; } },
  { label: "Last 7 days", getRange: () => { const now = new Date(); return { from: subDays(now, 6), to: now }; } },
  { label: "Last 30 days", getRange: () => { const now = new Date(); return { from: subDays(now, 29), to: now }; } },
  { label: "This month", getRange: () => { const now = new Date(); return { from: startOfMonth(now), to: endOfMonth(now) }; } },
  { label: "Last 60 days", getRange: () => { const now = new Date(); return { from: subDays(now, 59), to: now }; } },
];

const methodLabels: Record<string, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
  cash: "Cash",
  pos: "POS",
  transfer: "Transfer",
  purse: "Store Credit",
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
  purse_topup: { label: "Store credit top-up", className: "bg-blue-100 text-blue-700" },
  purse_redemption: { label: "Store credit used", className: "bg-purple-100 text-purple-700" },
};

const withdrawalStatusStyles: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  processing: { bg: "bg-primary/10", text: "text-primary" },
  completed: { bg: "bg-success/10", text: "text-success" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
};

export default function PaymentsPage() {
  useWalkthroughAutoTrigger("transactions");
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "all");
  const [payoutsSubTab, setPayoutsSubTab] = useState("history");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [hubTypeFilter, setHubTypeFilter] = useState(() => searchParams.get("type") || "all");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<RefundWithDetails | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [refundRequestsOpen, setRefundRequestsOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [recordCashOpen, setRecordCashOpen] = useState(false);
  const [assigningBranchId, setAssigningBranchId] = useState<string | null>(null);
  const [assignDestId, setAssignDestId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const { currentTenant, activeContextType, currentRole } = useAuth();
  const { transactions, stats, isLoading, refetch: refetchTransactions } = useTransactions();
  const {
    refunds,
    pendingRefunds,
    refetch: refetchRefunds,
    updateRefundStatusLocally,
  } = useRefunds();
  const { locations, isLoading: locationsLoading } = useSalonsOverview("today");

  const isOwnerHub = activeContextType === "owner_hub";
  // Payouts management (accounts, withdrawals, assignments) is restricted to
  // owner/manager/supervisor — stylists and receptionists never see or access it.
  const canManagePayouts = isOwnerHub && (
    currentRole === "owner" || currentRole === "manager" || currentRole === "supervisor"
  );
  const canCompleteRefunds = currentRole === "owner" || currentRole === "manager";

  const { destinations, isLoading: destinationsLoading, refetch: refetchDestinations } = usePayoutDestinations(
    canManagePayouts ? currentTenant?.id : undefined
  );
  const { wallet, isLoading: walletLoading } = useSalonWallet(
    canManagePayouts ? currentTenant?.id : undefined
  );
  const { availability: walletAvailability, isLoading: walletAvailabilityLoading } = useSalonWalletAvailability(
    canManagePayouts ? currentTenant?.id : undefined
  );
  const { withdrawals, isLoading: withdrawalsLoading } = useWithdrawals(
    canManagePayouts ? currentTenant?.id : undefined
  );

  const pageTitle = isOwnerHub ? "Cashflow & Payouts" : "Transactions";
  const currency = currentTenant?.currency || "USD";

  // Chain tenants can span more than one country. The page always shows
  // exactly one country's worth of transactions/accounts — no combined
  // "all countries" view, since amounts in different currencies can't be
  // summed. Only shown when the tenant actually has branches in more than
  // one country; single-country tenants see no change.
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const availableCountries = Array.from(new Set(locations.map((loc) => loc.country))).sort();
  const effectiveCountry = availableCountries.includes(selectedCountry)
    ? selectedCountry
    : (currentTenant?.country && availableCountries.includes(currentTenant.country) ? currentTenant.country : availableCountries[0]) || "";
  const locationCountryById = new Map(locations.map((loc) => [loc.id, loc.country]));

  useEffect(() => {
    const tab = searchParams.get("tab");
    const type = searchParams.get("type");
    if (type) {
      setHubTypeFilter(type);
      if (!isOwnerHub && type === "cash") setActiveTab("cash");
    }
    if (!tab) return;
    // Block URL-based access to payouts tab for unauthorised roles
    if (tab === "payouts" && !canManagePayouts) {
      setActiveTab("all");
      return;
    }
    setActiveTab(tab);
  }, [searchParams, canManagePayouts, isOwnerHub]);

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { USD: "$", GHS: "₵", NGN: "₦", EUR: "€", GBP: "£" };
    return `${symbols[currency] || currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const getDateRange = () => {
    if (!dateRange.from) return null;
    return {
      start: startOfDay(dateRange.from),
      end: endOfDay(dateRange.to || dateRange.from),
    };
  };

  const filteredTransactions = transactions.filter((txn) => {
    const dateRange = getDateRange();
    if (dateRange) {
      const txnDate = new Date(txn.created_at);
      if (txnDate < dateRange.start || txnDate > dateRange.end) return false;
    }
    if (isOwnerHub && effectiveCountry) {
      const locationId = txn.appointment?.location_id;
      if (!locationId || locationCountryById.get(locationId) !== effectiveCountry) return false;
    }
    const matchesSearch =
      txn.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.appointment?.location?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    if (isOwnerHub) {
      if (hubTypeFilter === "revenue") return matchesSearch && txn.type === "payment";
      if (hubTypeFilter === "refunds") return matchesSearch && txn.type === "refund";
      if (hubTypeFilter === "purse") return matchesSearch && (txn.type === "purse_topup" || txn.type === "purse_redemption");
      if (hubTypeFilter === "cash") return matchesSearch && txn.method === "cash";
      return matchesSearch;
    }

    if (activeTab === "cash") return matchesSearch && txn.method === "cash";
    if (activeTab === "all") return matchesSearch;
    if (activeTab === "revenue") return matchesSearch && txn.type === "payment";
    if (activeTab === "refunds") return matchesSearch && txn.type === "refund";
    if (activeTab === "purse") return matchesSearch && (txn.type === "purse_topup" || txn.type === "purse_redemption");
    return matchesSearch;
  });

  // "Today's Inflow" and pending-refund totals are money — they must respect
  // the country filter and never sum two currencies together, same as
  // Business Overview. Store Credit is intentionally excluded: customer
  // purses/wallets have no country dimension in the schema (one balance per
  // tenant), so it can't be split by country without a data model change.
  const appointmentLocationById = new Map(
    transactions
      .filter((txn) => txn.appointment)
      .map((txn) => [txn.appointment!.id, txn.appointment!.location_id])
  );

  const todayRevenueByCurrency = (() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const totals = new Map<string, number>();
    for (const txn of transactions) {
      if (new Date(txn.created_at) < startOfToday) continue;
      if (!(txn.type === "payment" || txn.type === "deposit") || txn.status !== "completed") continue;
      const locationId = txn.appointment?.location_id;
      if (isOwnerHub && effectiveCountry && (!locationId || locationCountryById.get(locationId) !== effectiveCountry)) continue;
      const country = locationId ? locationCountryById.get(locationId) : undefined;
      const txnCurrency = currencyForCountry(country, currency);
      totals.set(txnCurrency, (totals.get(txnCurrency) || 0) + Number(txn.amount));
    }
    return Array.from(totals.entries()).map(([currencyCode, total]) => ({ currency: currencyCode, total }));
  })();

  const countryFilteredPendingRefunds =
    !isOwnerHub || !effectiveCountry
      ? pendingRefunds
      : pendingRefunds.filter((refund) => {
          const appointmentId = refund.transaction?.appointment_id;
          const locationId = appointmentId ? appointmentLocationById.get(appointmentId) : null;
          return locationId && locationCountryById.get(locationId) === effectiveCountry;
        });

  const pendingRefundsTotalByCurrency = (() => {
    const totals = new Map<string, number>();
    for (const refund of countryFilteredPendingRefunds) {
      const appointmentId = refund.transaction?.appointment_id;
      const locationId = appointmentId ? appointmentLocationById.get(appointmentId) : null;
      const country = locationId ? locationCountryById.get(locationId) : undefined;
      const refundCurrency = currencyForCountry(country, refund.transaction?.currency || currency);
      totals.set(refundCurrency, (totals.get(refundCurrency) || 0) + Number(refund.amount));
    }
    return Array.from(totals.entries()).map(([currencyCode, total]) => ({ currency: currencyCode, total }));
  })();

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
  const handleDownloadReceipt = async (appointmentId: string, txnId: string, reference?: string) => {
    setDownloadingReceiptId(txnId);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("generate-booking-receipt", {
        body: { appointmentId },
      });

      if (invokeError) throw invokeError;
      if (!(data instanceof Blob)) throw new Error("Unexpected response from server");

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${reference || appointmentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error("Error downloading receipt:", downloadError);
      toast({
        title: "Couldn't download receipt",
        description: downloadError instanceof Error ? downloadError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const renderTransactionRow = (txn: typeof filteredTransactions[0], showBranch = false) => {
    const style = statusStyles[txn.status] || statusStyles.pending;
    const isIncoming = txn.type === "payment" || txn.type === "purse_topup" || txn.type === "deposit";
    const transactionRefunds = refunds.filter(
      (refund) => refund.transaction_id === txn.id && ["pending", "approved", "completed"].includes(refund.status)
    );
    const completedRefundAmount = transactionRefunds
      .filter((refund) => refund.status === "approved" || refund.status === "completed")
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    const reservedRefundAmount = transactionRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
    const remainingRefundAmount = Math.max(0, Number(txn.amount) - reservedRefundAmount);
    const refundState = completedRefundAmount >= Number(txn.amount)
      ? "Refunded"
      : completedRefundAmount > 0
        ? "Partially refunded"
        : null;
    const canRefund = (txn.type === "payment" || txn.type === "deposit") && txn.customer_id && remainingRefundAmount > 0 && txn.status === "completed";
    const canDownloadReceipt = Boolean(txn.appointment_id) && (txn.type === "payment" || txn.type === "deposit") && txn.status === "completed";
    const chip = typeChips[txn.type];
    const serviceNames = txn.appointment?.services
      ?.map((service) => service.service_name)
      .filter(Boolean)
      .join(", ");
    const transactionDescription = [chip?.label, serviceNames].filter(Boolean).join(", ");
    const isDownloadingThisReceipt = downloadingReceiptId === txn.id;

    const refundAction = canRefund || canDownloadReceipt ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canDownloadReceipt && (
            <DropdownMenuItem
              disabled={isDownloadingThisReceipt}
              onClick={() => handleDownloadReceipt(txn.appointment_id as string, txn.id)}
            >
              {isDownloadingThisReceipt ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download receipt
            </DropdownMenuItem>
          )}
          {canRefund && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => { setSelectedTransaction(txn); setRefundDialogOpen(true); }}
            >
              {canCompleteRefunds ? "Make refund" : "Request refund"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

    return (
      <div key={txn.id} className="md:[&:last-child>div]:border-b-0">
        <article className="rounded-[14px] border border-border/60 bg-white p-4 shadow-sm md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{txn.customer?.full_name || "Guest"}</p>
              {showBranch && txn.appointment?.location?.name && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {txn.appointment.location.name}
                </p>
              )}
            </div>
            <p className={cn("shrink-0 font-serif text-base font-semibold", isIncoming ? "text-success" : "text-destructive")}>
              {isIncoming ? "+" : "-"}{sharedFormatCurrency(Number(txn.amount), txn.currency)}
            </p>
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2.5">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", isIncoming ? "bg-success/10" : "bg-destructive/10")}>
              {isIncoming ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownLeft className="h-4 w-4 text-destructive" />}
            </div>
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {[transactionDescription, methodLabels[txn.method] || txn.method].filter(Boolean).join(" · ")}
            </p>
          </div>

          {(txn.payment_group_id || refundState || transactionRefunds.some((refund) => refund.status === "pending")) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {txn.payment_group_id && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  Split payment
                </span>
              )}
              {refundState && (
                <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                  {refundState}
                </span>
              )}
              {!refundState && transactionRefunds.some((refund) => refund.status === "pending") && (
                <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning-foreground">
                  Refund pending
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              {format(new Date(txn.created_at), "MMM d, yyyy")}
            </p>
            <div className="flex items-center gap-1.5">
              <Badge className={cn("rounded-full px-3 text-xs capitalize", style.bg, style.text)}>{txn.status}</Badge>
              {refundAction}
            </div>
          </div>
        </article>

        <div className="hidden gap-3 border-b px-5 py-4 md:grid md:grid-cols-[100px_minmax(105px,.85fr)_minmax(150px,1.2fr)_minmax(90px,.65fr)_minmax(110px,.75fr)_minmax(125px,.9fr)] md:items-center">
          <p className="text-sm text-muted-foreground">
            {format(new Date(txn.created_at), "MMM d, yyyy")}
          </p>
          <p className="truncate font-medium">{txn.customer?.full_name || "Guest"}</p>
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", isIncoming ? "bg-success/10" : "bg-destructive/10")}>
              {isIncoming ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownLeft className="w-4 h-4 text-destructive" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {chip && (
                  <span className="truncate text-sm font-medium">
                    {transactionDescription}
                  </span>
                )}
                {txn.payment_group_id && (
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                    Split payment
                  </span>
                )}
                {refundState && (
                  <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                    {refundState}
                  </span>
                )}
                {!refundState && transactionRefunds.some((refund) => refund.status === "pending") && (
                  <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning-foreground">
                    Refund pending
                  </span>
                )}
              </div>
              {showBranch && txn.appointment?.location?.name && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {txn.appointment.location.name}
                </p>
              )}
            </div>
          </div>
          <p className="min-w-0 truncate whitespace-nowrap text-sm">{methodLabels[txn.method] || txn.method}</p>
          <p className={cn("font-serif text-base font-semibold", isIncoming ? "text-success" : "text-destructive")}>
              {isIncoming ? "+" : "-"}{sharedFormatCurrency(Number(txn.amount), txn.currency)}
          </p>
          <div className="flex items-center justify-start gap-2">
            <Badge className={cn("rounded-full px-4 text-xs capitalize", style.bg, style.text)}>{txn.status}</Badge>
            {refundAction}
          </div>
        </div>
      </div>
    );
  };

  const transactionTableHeader = (
    <div className="hidden grid-cols-[100px_minmax(105px,.85fr)_minmax(150px,1.2fr)_minmax(90px,.65fr)_minmax(110px,.75fr)_minmax(125px,.9fr)] gap-3 border-b bg-muted/20 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
      <span>Date</span>
      <span>Customer</span>
      <span>Type</span>
      <span>Method</span>
      <span>Amount</span>
      <span>Status</span>
    </div>
  );

  // ─── Hub: All Transactions content ───────────────────────────────────────────
  const renderHubAllTransactions = () => (
    <div className="space-y-6">
      {/* Stats */}
      <div className="scrollbar-hide flex snap-x gap-3 overflow-x-auto overscroll-x-contain pb-1 [&>*]:min-w-[190px] [&>*]:shrink-0 [&>*]:snap-start sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0">
        {[
          {
            title: "Today's Inflow",
            value: sharedFormatCurrency(
              todayRevenueByCurrency[0]?.total ?? 0,
              todayRevenueByCurrency[0]?.currency ?? currencyForCountry(effectiveCountry, currency)
            ),
            icon: TrendingUp,
            color: "text-success",
            bg: "bg-success/10",
            description: "Completed payments collected today.",
          },
          {
            title: "Pending Refunds",
            value: String(countryFilteredPendingRefunds.length),
            icon: AlertCircle,
            color: "text-warning-foreground",
            bg: "bg-warning-bg",
            description: "Refund requests awaiting your approval, across all branches.",
          },
          {
            title: "Store Credit",
            value: formatCurrency(stats.totalPurseBalance),
            icon: Wallet,
            color: "text-primary",
            bg: "bg-primary/10",
            description: "Every customer's combined salon balance — paid funds plus salon-issued credit, added together. Not split by country: customer balances are tracked per tenant, not per branch.",
            subtitle: availableCountries.length > 1 ? "All branches" : undefined,
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="rounded-[14px] border-border/60 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground sm:text-sm">{s.title}</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-56 text-xs">{s.description}</TooltipContent>
                    </Tooltip>
                    {s.subtitle && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{s.subtitle}</span>
                    )}
                  </div>
                  <p className="mt-1 font-serif text-xl font-semibold sm:text-2xl">{s.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${s.bg}`}><Icon className={`h-5 w-5 ${s.color}`} /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pending Refunds */}
      {canCompleteRefunds && countryFilteredPendingRefunds.length > 0 && (
        <Card className="border-warning/40 bg-warning-bg/20">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-bg">
                <AlertCircle className="h-5 w-5 text-warning-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">
                  {countryFilteredPendingRefunds.length} refund {countryFilteredPendingRefunds.length === 1 ? "request" : "requests"} need review
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {pendingRefundsTotalByCurrency.map((entry, i) => (
                    <span key={entry.currency}>
                      {i > 0 && " + "}
                      {sharedFormatCurrency(entry.total, entry.currency)}
                    </span>
                  ))}{" "}
                  pending in total
                </p>
              </div>
            </div>
            <Button variant="outline" className="w-full bg-background sm:w-auto" onClick={() => setRefundRequestsOpen(true)}>
              Review requests <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="scrollbar-hide flex max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {[
          { value: "all", label: "All" },
          { value: "revenue", label: "Inflow" },
          { value: "refunds", label: "Refunds" },
          { value: "purse", label: "Store credit" },
          { value: "cash", label: "Cash" },
        ].map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant={hubTypeFilter === filter.value ? "default" : "outline"}
            className="h-11 shrink-0 rounded-full px-6"
            onClick={() => setHubTypeFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-row items-center gap-3 sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search transactions…" className="h-12 rounded-[12px] bg-white pl-10 shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onChange={(range) => setDateRange(range)}
          onClear={() => setDateRange({})}
          clearLabel="All time"
          placeholder="All time"
          presets={TRANSACTION_RANGE_PRESETS}
          className="h-12 w-[138px] shrink-0 rounded-[12px] bg-white shadow-sm sm:w-auto sm:min-w-[220px]"
        />
        <div className="hidden lg:block [&>button]:h-12 [&>button]:rounded-full">
          <ExportDropdown onExport={handleExport} disabled={filteredTransactions.length === 0} />
        </div>
      </div>

      {/* Transactions */}
      <Card className="overflow-visible border-0 bg-transparent shadow-none md:overflow-hidden md:rounded-[14px] md:border md:border-border/60 md:bg-white md:shadow-sm">
        <CardHeader className="hidden pb-3 md:flex">
          <CardTitle className="text-base">
            All Transactions
            {filteredTransactions.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2 text-sm">({filteredTransactions.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="flex items-center gap-3 p-3"><Skeleton className="w-9 h-9 rounded-full" /><div><Skeleton className="h-4 w-36 mb-1" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-5 w-20 ml-auto" /></div>)}</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-10"><CreditCard className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" /><p className="text-muted-foreground">No transactions found</p></div>
          ) : (
            <div className="space-y-3 md:space-y-0">{transactionTableHeader}{filteredTransactions.map((txn) => renderTransactionRow(txn, true))}</div>
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
                  {Number(walletAvailability?.pending ?? 0) > 0 && (
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
  );

  // ─── Branch-level view (unchanged) ────────────────────────────────────────
  const renderBranchView = () => (
    <>
      {/* Stats */}
      <div className="scrollbar-hide flex snap-x gap-3 overflow-x-auto overscroll-x-contain pb-1 [&>*]:min-w-[190px] [&>*]:shrink-0 [&>*]:snap-start sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0">
        {[
          { title: "Today's Inflow", value: formatCurrency(stats.todayRevenue), icon: TrendingUp, color: "text-success", bg: "bg-success/10", description: "Completed payments collected today." },
          { title: "Pending Refunds", value: String(pendingRefunds.length), icon: AlertCircle, color: "text-warning-foreground", bg: "bg-warning-bg", description: "Refund requests awaiting your approval, across all branches." },
          { title: "Store Credit", value: formatCurrency(stats.totalPurseBalance), icon: Wallet, color: "text-primary", bg: "bg-primary/10", description: "Every customer's combined salon balance — paid funds plus salon-issued credit, added together." },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="rounded-[14px] border-border/60 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground sm:text-sm">{s.title}</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-56 text-xs">{s.description}</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="mt-1 font-serif text-xl font-semibold sm:text-2xl">{s.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${s.bg}`}><Icon className={`h-5 w-5 ${s.color}`} /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pending Refunds */}
      {canCompleteRefunds && pendingRefunds.length > 0 && (
        <Card className="border-warning/40 bg-warning-bg/20">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-bg">
                <AlertCircle className="h-5 w-5 text-warning-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">
                  {pendingRefunds.length} refund {pendingRefunds.length === 1 ? "request" : "requests"} need review
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {formatCurrency(pendingRefunds.reduce((total, refund) => total + Number(refund.amount), 0))} pending in total
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full shrink-0 border-warning/50 bg-background sm:w-auto"
              onClick={() => setRefundRequestsOpen(true)}
            >
              Review requests
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          data-tour-id="tour-transactions-tabs"
          className="scrollbar-hide h-auto max-w-full justify-start overflow-x-auto overscroll-x-contain rounded-full bg-[#eee9e1] p-1.5"
        >
          <TabsTrigger value="all" className="shrink-0 rounded-full px-6">All</TabsTrigger>
          <TabsTrigger value="revenue" className="shrink-0 rounded-full px-6"><ArrowUpRight className="mr-2 w-4 h-4" />Inflow</TabsTrigger>
          <TabsTrigger value="refunds" className="shrink-0 rounded-full px-6"><ArrowDownLeft className="mr-2 w-4 h-4" />Refunds</TabsTrigger>
          <TabsTrigger value="purse" className="shrink-0 rounded-full px-6"><Wallet className="mr-2 w-4 h-4" />Store credit</TabsTrigger>
          <TabsTrigger value="cash" className="shrink-0 rounded-full px-6"><Banknote className="mr-2 w-4 h-4" />Cash</TabsTrigger>
          <TabsTrigger value="balances" className="shrink-0 rounded-full px-6"><Wallet className="mr-2 w-4 h-4" />Customer balances</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          {activeTab === "balances" ? (
            <CustomerBalancesPanel canAdjust={canCompleteRefunds} />
          ) : (
          <>
          <div className="mb-6 flex flex-row items-center gap-3 sm:flex-wrap sm:gap-4">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search transactions…" className="h-12 rounded-[12px] bg-white pl-10 shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <DateRangePicker
              from={dateRange.from}
              to={dateRange.to}
              onChange={(range) => setDateRange(range)}
              onClear={() => setDateRange({})}
              clearLabel="All time"
              placeholder="All time"
              presets={TRANSACTION_RANGE_PRESETS}
              className="h-12 w-[138px] shrink-0 rounded-[12px] bg-white shadow-sm sm:w-auto sm:min-w-[220px]"
            />
            <div className="hidden lg:block [&>button]:h-12 [&>button]:rounded-full">
              <ExportDropdown onExport={handleExport} disabled={filteredTransactions.length === 0} />
            </div>
          </div>
          <Card className="overflow-visible border-0 bg-transparent shadow-none md:overflow-hidden md:rounded-[14px] md:border md:border-border/60 md:bg-white md:shadow-sm">
            <CardHeader className="hidden md:flex"><CardTitle className="text-lg">Transactions</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-4">{[1,2,3,4].map((i) => <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface"><div className="flex items-center gap-4"><Skeleton className="w-10 h-10 rounded-full" /><div><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></div></div><Skeleton className="h-6 w-20" /></div>)}</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-12"><CreditCard className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" /><p className="text-muted-foreground">No transactions found</p></div>
              ) : (
                <div className="space-y-3 md:space-y-0">{transactionTableHeader}{filteredTransactions.map((txn) => renderTransactionRow(txn, false))}</div>
              )}
            </CardContent>
          </Card>
          </>
          )}
        </div>
      </Tabs>
    </>
  );

  return (
    <SalonSidebar>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 sm:space-y-9">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{pageTitle}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2 sm:text-base">
              {isOwnerHub ? "Income, refunds, and payouts across all branches." : "Track transactions, manage refunds, and monitor customer balances."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isOwnerHub && availableCountries.length > 1 && (
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
            <Button onClick={() => setRecordCashOpen(true)} className="hidden h-12 rounded-full px-7 lg:flex">
              <Banknote className="mr-2 h-4 w-4" />
              Record cash payment
            </Button>
          </div>
        </div>

        {isOwnerHub ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList
              data-tour-id="tour-transactions-tabs"
              className="scrollbar-hide max-w-full justify-start overflow-x-auto overscroll-x-contain"
            >
              <TabsTrigger value="all">All Transactions</TabsTrigger>
              <TabsTrigger value="balances">Customer Balances</TabsTrigger>
              {canManagePayouts && (
                <TabsTrigger value="payouts" className="gap-2">
                  <Wallet className="w-4 h-4" />Payouts
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="all" className="mt-6">{renderHubAllTransactions()}</TabsContent>
            <TabsContent value="balances" className="mt-6">
              <CustomerBalancesPanel canAdjust={canCompleteRefunds} />
            </TabsContent>
            {canManagePayouts && (
              <TabsContent value="payouts" className="mt-6">{renderHubPayouts()}</TabsContent>
            )}
          </Tabs>
        ) : (
          renderBranchView()
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Transaction actions"
            className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 lg:hidden"
          >
            <Plus className="h-6 w-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mb-2 w-52">
          <DropdownMenuItem onClick={() => setRecordCashOpen(true)}>
            <Banknote className="mr-2 h-4 w-4" />
            Record cash payment
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={filteredTransactions.length === 0}
            onClick={() => handleExport("csv")}
          >
            <FileText className="mr-2 h-4 w-4" />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={filteredTransactions.length === 0}
            onClick={() => handleExport("xlsx")}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export as XLS
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      <WithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
      <RecordPaymentDialog
        open={recordCashOpen}
        onOpenChange={setRecordCashOpen}
        onSuccess={refetchTransactions}
      />

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

      <RequestRefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        transaction={selectedTransaction}
        mode={canCompleteRefunds ? "complete" : "request"}
        onSuccess={() => { refetchRefunds(); refetchTransactions(); }}
      />

      <RequestRefundDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        mode="complete"
        request={selectedRefund}
        transaction={selectedRefund?.transaction ? {
          ...selectedRefund.transaction,
          customer: selectedRefund.customer,
        } : null}
        onSuccess={() => {
          if (selectedRefund?.id) {
            updateRefundStatusLocally(selectedRefund.id, "completed");
          }
          void refetchRefunds();
          void refetchTransactions();
        }}
      />

      <RejectRefundDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        requestId={selectedRefund?.id || null}
        customerName={selectedRefund?.customer?.full_name}
        onSuccess={(requestId) => {
          updateRefundStatusLocally(requestId, "rejected");
          void refetchRefunds();
          void refetchTransactions();
        }}
      />

      <Dialog open={refundRequestsOpen} onOpenChange={setRefundRequestsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Refund requests</DialogTitle>
            <DialogDescription>
              Review {pendingRefunds.length} pending {pendingRefunds.length === 1 ? "request" : "requests"} without interrupting the transaction list.
            </DialogDescription>
          </DialogHeader>
          <div className={cn(DIALOG_BODY_PADDING, "max-h-[min(32rem,65vh)] space-y-3 overflow-y-auto overscroll-contain")}>
            {pendingRefunds.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-success" />
                <p className="mt-3 font-medium">All caught up</p>
                <p className="mt-1 text-sm text-muted-foreground">There are no refund requests awaiting review.</p>
              </div>
            ) : (
              pendingRefunds.map((refund) => (
                <div
                  key={refund.id}
                  className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{refund.customer?.full_name || "Unknown customer"}</p>
                      <Badge className={cn("text-xs", refundStatusStyles[refund.status]?.bg, refundStatusStyles[refund.status]?.text)}>
                        {refund.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium">
                      {sharedFormatCurrency(Number(refund.amount), refund.transaction?.currency || currency)} · {refund.refund_type.replace("_", " ")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{refund.reason}</p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setSelectedRefund(refund);
                        setRefundRequestsOpen(false);
                        setRejectDialogOpen(true);
                      }}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-success hover:bg-success/90"
                      onClick={() => {
                        setSelectedRefund(refund);
                        setRefundRequestsOpen(false);
                        setApproveDialogOpen(true);
                      }}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </SalonSidebar>
  );
}
