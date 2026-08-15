import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import {
  useBackofficeTransactions,
  useBackofficeTransactionSummary,
  useTenants,
  type BackofficeTransactionRow,
} from "@/hooks";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ui/sheet";
import { EmptyState } from "@ui/empty-state";
import {
  Loader2,
  Search,
  Download,
  Receipt,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Smartphone,
  Banknote,
  Landmark,
  Wallet,
  Gauge,
  Hash,
  QrCode,
} from "lucide-react";
import { format } from "date-fns";

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "₦", GHS: "₵", USD: "$" };

function formatMoney(amount: number, currency: string) {
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_META: Record<string, { label: string; className: string }> = {
  payment: { label: "Payment", className: "bg-sky-50 text-sky-700" },
  deposit: { label: "Deposit", className: "bg-amber-50 text-amber-700" },
  refund: { label: "Refund", className: "bg-red-50 text-red-700" },
  purse_topup: { label: "Store-credit top-up", className: "bg-emerald-50 text-emerald-700" },
  purse_redemption: { label: "Store-credit used", className: "bg-muted text-muted-foreground" },
};

const METHOD_META: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Card", icon: CreditCard },
  mobile_money: { label: "Mobile Money", icon: Smartphone },
  cash: { label: "Cash", icon: Banknote },
  pos: { label: "POS", icon: Landmark },
  transfer: { label: "Transfer", icon: Landmark },
  purse: { label: "Store credit", icon: Wallet },
  ussd: { label: "USSD", icon: Hash },
  qr: { label: "QR", icon: QrCode },
};

const STATUS_META: Record<string, string> = {
  completed: "text-success",
  pending: "text-warning-foreground",
  failed: "text-destructive",
};

const DATE_PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
] as const;

const PAGE_SIZE = 25;

function presetRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export default function TransactionsPage() {
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [range, setRange] = useState(() => presetRange(30));
  const [tenantId, setTenantId] = useState<string>("all");
  const [currency, setCurrency] = useState<string>("all");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<BackofficeTransactionRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: tenants } = useTenants();
  const { data: summary, isLoading: summaryLoading } = useBackofficeTransactionSummary(range.from, range.to);
  const { data: rows, isLoading: rowsLoading } = useBackofficeTransactions({
    from: range.from,
    to: range.to,
    page,
    pageSize: PAGE_SIZE,
    tenantId: tenantId === "all" ? undefined : tenantId,
    currency: currency === "all" ? undefined : currency,
    method: method === "all" ? undefined : method,
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : status,
    search: search.trim() || undefined,
  });

  const totalCount = rows?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const successRate = useMemo(() => {
    if (!summary?.totals.total_count) return null;
    const { total_count, failed_count } = summary.totals;
    return ((total_count - failed_count) / total_count) * 100;
  }, [summary]);

  const typeCountFor = (key: string) => summary?.typeCounts.find((t) => t.type === key)?.tx_count ?? 0;
  const totalTypeCount = summary?.typeCounts.reduce((sum, t) => sum + t.tx_count, 0) ?? 0;

  const selectDatePreset = (key: string, days: number) => {
    setDatePreset(key);
    setRange(presetRange(days));
    setPage(0);
  };

  const resetPageAnd = (fn: () => void) => {
    fn();
    setPage(0);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.rpc("get_backoffice_transactions" as never, {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_limit: 5000,
        p_offset: 0,
        p_tenant_id: tenantId === "all" ? null : tenantId,
        p_currency: currency === "all" ? null : currency,
        p_method: method === "all" ? null : method,
        p_type: type === "all" ? null : type,
        p_status: status === "all" ? null : status,
        p_search: search.trim() || null,
      } as never);
      if (error) throw error;

      const exportRows = (data || []) as unknown as BackofficeTransactionRow[];
      const header = ["Date", "Tenant", "Customer", "Type", "Method", "Provider", "Amount", "Currency", "Status", "Reference"];
      const csvLines = [
        header.join(","),
        ...exportRows.map((r) =>
          [
            format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
            r.tenant_name,
            r.customer_name || "",
            TYPE_META[r.type]?.label || r.type,
            METHOD_META[r.method]?.label || r.method,
            r.provider || "",
            r.amount,
            r.currency,
            r.status,
            r.provider_reference || "",
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        ),
      ];
      const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${format(range.from, "yyyy-MM-dd")}_${format(range.to, "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <BackofficeLayout>
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" />
              All Transactions
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Every customer payment across every tenant — bookings, deposits, refunds, and store-credit activity, in one place. Read-only; refunds and disputes are actioned from each tenant's own Cashflow tab.
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {summaryLoading ? (
            <div className="col-span-full flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {(summary?.byCurrency.length ? summary.byCurrency : [{ currency: "NGN", volume: 0, tx_count: 0 }]).map((c) => (
                <Card key={c.currency}>
                  <CardContent className="p-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                      Volume · {c.currency}
                    </p>
                    <p className="text-xl font-semibold tabular-nums">{formatMoney(c.volume, c.currency)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.tx_count} transactions</p>
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Refunded</p>
                  <p className="text-xl font-semibold tabular-nums text-destructive">{summary?.totals.refund_count ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">across all currencies</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> Success rate
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {successRate === null ? "—" : `${successRate.toFixed(1)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary?.totals.failed_count ?? 0} failed of {summary?.totals.total_count ?? 0}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-muted/50 border rounded-md px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search customer, tenant, or reference…"
                value={search}
                onChange={(e) => resetPageAnd(() => setSearch(e.target.value))}
                className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex items-center gap-1 bg-muted/50 border rounded-md p-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => selectDatePreset(p.key, p.days)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    datePreset === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border" />

            <Select value={tenantId} onValueChange={(v) => resetPageAnd(() => setTenantId(v))}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All tenants" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tenants</SelectItem>
                {(tenants || []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={currency} onValueChange={(v) => resetPageAnd(() => setCurrency(v))}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="All currencies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All currencies</SelectItem>
                <SelectItem value="NGN">NGN</SelectItem>
                <SelectItem value="GHS">GHS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>

            <Select value={method} onValueChange={(v) => resetPageAnd(() => setMethod(v))}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="All methods" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {Object.entries(METHOD_META).map(([key, m]) => (
                  <SelectItem key={key} value={key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => resetPageAnd(() => setStatus(v))}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Type tabs */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => resetPageAnd(() => setType("all"))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              type === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground"
            }`}
          >
            All <span className="opacity-70 tabular-nums">{totalTypeCount}</span>
          </button>
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => resetPageAnd(() => setType(key))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                type === key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground"
              }`}
            >
              {meta.label} <span className="opacity-70 tabular-nums">{typeCountFor(key)}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {rowsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !rows || rows.length === 0 ? (
              <EmptyState icon={Receipt} title="No transactions" description="No transactions match the current filters." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const typeMeta = TYPE_META[row.type] || { label: row.type, className: "bg-muted text-muted-foreground" };
                    const methodMeta = METHOD_META[row.method] || { label: row.method, icon: CreditCard };
                    const MethodIcon = methodMeta.icon;
                    const created = new Date(row.created_at);
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(row)}
                      >
                        <TableCell>
                          <div className="text-sm font-medium">{format(created, "MMM d")}</div>
                          <div className="text-xs text-muted-foreground">{format(created, "h:mm a")}</div>
                        </TableCell>
                        <TableCell className="text-sm">{row.tenant_name}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{row.customer_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.type === "purse_topup" || row.type === "purse_redemption"
                              ? "Store credit"
                              : row.service_name
                                ? `${row.service_name}${row.service_count > 1 ? ` +${row.service_count - 1}` : ""}`
                                : "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={typeMeta.className}>{typeMeta.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MethodIcon className="h-3.5 w-3.5" /> {methodMeta.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">{row.provider || "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${row.type === "refund" ? "text-destructive" : ""}`}>
                          {row.type === "refund" ? "-" : ""}{formatMoney(row.amount, row.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {row.charges ? formatMoney(row.charges, row.currency) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium capitalize ${STATUS_META[row.status] || ""}`}>
                            {row.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {rows && rows.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
                <span>
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="px-2 tabular-nums">{page + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail drawer */}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{TYPE_META[selected.type]?.label || selected.type}</SheetTitle>
                <p className="text-xs text-muted-foreground font-mono">{selected.id}</p>
              </SheetHeader>

              <div className="text-center py-6">
                <p className={`text-3xl font-bold tabular-nums ${selected.type === "refund" ? "text-destructive" : ""}`}>
                  {selected.type === "refund" ? "-" : ""}{formatMoney(selected.amount, selected.currency)}
                </p>
                <span className={`inline-block mt-2 text-xs font-medium capitalize ${STATUS_META[selected.status] || ""}`}>
                  {selected.status}
                </span>
              </div>

              <div className="space-y-1 mb-5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Details</p>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Tenant</span>
                  <span className="font-medium">{selected.tenant_name}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selected.customer_name || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">For</span>
                  <span className="font-medium">
                    {selected.type === "purse_topup" || selected.type === "purse_redemption"
                      ? "Store credit balance"
                      : selected.service_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{format(new Date(selected.created_at), "MMM d, yyyy · h:mm a")}</span>
                </div>
              </div>

              <div className="space-y-1 mb-5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Payment</p>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Method</span>
                  <span className="font-medium">{METHOD_META[selected.method]?.label || selected.method}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Charges (platform + customer fee)</span>
                  <span className="font-medium">{selected.charges ? formatMoney(selected.charges, selected.currency) : "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-medium capitalize">{selected.provider || "—"}</span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-muted-foreground">Provider reference</span>
                  <span className="font-mono text-xs">{selected.provider_reference || "—"}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Platform</p>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-mono text-xs">{selected.id}</span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-muted-foreground">Appointment</span>
                  <span className="font-mono text-xs">{selected.appointment_id || "—"}</span>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </BackofficeLayout>
  );
}
