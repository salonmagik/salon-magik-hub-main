import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useSubscriptionLedger, useTenantBillingActivity, type SubscriptionLedgerRow } from "@/hooks";
import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Loader2, ArrowUpDown, Building2, TrendingUp, TriangleAlert, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@ui/empty-state";

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  const symbols: Record<string, string> = { GHS: "₵", NGN: "₦", USD: "$" };
  const symbol = currency ? symbols[currency] || `${currency} ` : "";
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PLAN_BADGE: Record<string, string> = {
  solo: "bg-sky-50 text-sky-700",
  studio: "bg-violet-50 text-violet-700",
  chain: "bg-amber-50 text-amber-700",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  trialing: "bg-sky-50 text-sky-700",
  past_due: "bg-red-50 text-red-700",
  canceled: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
};

type SortKey = "tenant_name" | "addon_mrr" | "comms_balance" | "next_billing_at";

export default function SubscriptionLedgerPage() {
  const { data: ledger, isLoading } = useSubscriptionLedger();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("addon_mrr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedTenant, setSelectedTenant] = useState<SubscriptionLedgerRow | null>(null);

  const rows = ledger || [];

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.subscription_status === "active");
    const trialing = rows.filter((r) => r.subscription_status === "trialing");
    const pastDue = rows.filter((r) => r.subscription_status === "past_due");
    const withAddons = rows.filter((r) => r.addon_mrr > 0);
    return { active: active.length, trialing: trialing.length, pastDue: pastDue.length, withAddons: withAddons.length };
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.tenant_name?.toLowerCase().includes(q));
    }
    if (planFilter !== "all") {
      result = result.filter((r) => (r.plan || "").toLowerCase() === planFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((r) => r.subscription_status === statusFilter);
    }
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "tenant_name") cmp = (a.tenant_name || "").localeCompare(b.tenant_name || "");
      else if (sortKey === "addon_mrr") cmp = (a.addon_mrr || 0) - (b.addon_mrr || 0);
      else if (sortKey === "comms_balance") cmp = (a.comms_balance || 0) - (b.comms_balance || 0);
      else if (sortKey === "next_billing_at") cmp = new Date(a.next_billing_at || 0).getTime() - new Date(b.next_billing_at || 0).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, planFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const availablePlans = useMemo(
    () => Array.from(new Set(rows.map((r) => r.plan).filter(Boolean))) as string[],
    [rows],
  );

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Subscriptions &amp; Add-ons</h1>
            <p className="mt-1 text-muted-foreground">
              {rows.length.toLocaleString()} salons · {summary.active.toLocaleString()} active ·{" "}
              {summary.trialing.toLocaleString()} trial · {summary.pastDue.toLocaleString()} past due
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Active subscriptions", value: summary.active, icon: Building2, tone: "text-emerald-700 bg-emerald-50" },
            { label: "Trialing", value: summary.trialing, icon: Sparkles, tone: "text-sky-700 bg-sky-50" },
            { label: "Past due", value: summary.pastDue, icon: TriangleAlert, tone: "text-red-700 bg-red-50" },
            { label: "Salons with add-ons", value: summary.withAddons, icon: TrendingUp, tone: "text-amber-700 bg-amber-50" },
          ].map((metric) => (
            <Card key={metric.label} className="backoffice-panel">
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-2xl font-medium">{metric.value.toLocaleString()}</p>
                </div>
                <div className={`rounded-xl p-3 ${metric.tone}`}>
                  <metric.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px]">
          <Input
            placeholder="Search salon name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl bg-white"
          />
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue placeholder="All plans" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {availablePlans.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trialing">Trialing</SelectItem>
              <SelectItem value="past_due">Past due</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="backoffice-panel overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="No salons match" description="Try a different search or filter." className="py-12" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("tenant_name")}>
                        <span className="inline-flex items-center gap-1">Salon <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("addon_mrr")}>
                        <span className="inline-flex items-center gap-1">Add-ons <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead>MRR</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("comms_balance")}>
                        <span className="inline-flex items-center gap-1">Comms credits <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("next_billing_at")}>
                        <span className="inline-flex items-center gap-1">Next billing <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow
                        key={row.tenant_id}
                        className="cursor-pointer"
                        onClick={() => setSelectedTenant(row)}
                      >
                        <TableCell>
                          <div className="font-medium">{row.tenant_name}</div>
                          <div className="text-xs text-muted-foreground">{row.country || "—"}</div>
                        </TableCell>
                        <TableCell>
                          {row.plan && (
                            <Badge variant="secondary" className={`capitalize ${PLAN_BADGE[row.plan] || ""}`}>
                              {row.plan}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.subscription_status && (
                            <Badge variant="secondary" className={`capitalize ${STATUS_BADGE[row.subscription_status] || ""}`}>
                              {row.subscription_status.replace("_", " ")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.addon_mrr > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(row.addon_breakdown?.extra_seats ?? 0) > 0 && (
                                <Badge variant="outline" className="text-xs font-normal">+{row.addon_breakdown!.extra_seats} seats</Badge>
                              )}
                              {(row.addon_breakdown?.location_addon_total ?? 0) > 0 && (
                                <Badge variant="outline" className="text-xs font-normal">extra branch</Badge>
                              )}
                              {row.addon_breakdown?.staff_operations_enabled && (
                                <Badge variant="outline" className="text-xs font-normal">Staff Ops</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatMoney(row.base_mrr + row.addon_mrr, row.currency)}</div>
                          {row.addon_mrr > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {formatMoney(row.base_mrr, row.currency)} base + {formatMoney(row.addon_mrr, row.currency)} add-ons
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={row.comms_balance !== null && row.comms_balance < 10 ? "text-red-600 font-medium" : ""}>
                            {row.comms_balance ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.next_billing_at ? format(new Date(row.next_billing_at), "MMM d, yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TenantBillingDrawer tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
    </BackofficeLayout>
  );
}

function TenantBillingDrawer({ tenant, onClose }: { tenant: SubscriptionLedgerRow | null; onClose: () => void }) {
  const { data: activity, isLoading } = useTenantBillingActivity(tenant?.tenant_id ?? null);

  return (
    <Sheet open={Boolean(tenant)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{tenant?.tenant_name}</SheetTitle>
          <SheetDescription>
            {tenant?.plan && <span className="capitalize">{tenant.plan} plan</span>}
            {tenant?.subscription_status && <> · <span className="capitalize">{tenant.subscription_status.replace("_", " ")}</span></>}
            {tenant?.country && <> · {tenant.country}</>}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="activity" className="mt-4">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="addons">Add-ons</TabsTrigger>
          </TabsList>
          <TabsContent value="activity" className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !activity || activity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No billing activity recorded yet.</p>
            ) : (
              <ul className="space-y-4">
                {activity.map((event, i) => (
                  <li key={i} className="relative border-l-2 border-border pl-4 pb-1 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span>{event.description}</span>
                      {event.amount !== null && (
                        <span className="font-serif text-emerald-700">{formatMoney(event.amount, event.currency)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(event.occurred_at), "MMM d, yyyy · h:mma")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="addons" className="mt-4 space-y-3">
            {tenant?.addon_mrr ? (
              <>
                {(tenant.addon_breakdown?.extra_seats ?? 0) > 0 && (
                  <div className="flex justify-between items-center border-b pb-2">
                    <div>
                      <p className="text-sm font-medium">Extra seats</p>
                      <p className="text-xs text-muted-foreground">{tenant.addon_breakdown!.extra_seats} unit(s)</p>
                    </div>
                    <p className="font-serif text-sm">{formatMoney(tenant.addon_breakdown!.seat_addon_total, tenant.currency)}/mo</p>
                  </div>
                )}
                {(tenant.addon_breakdown?.location_addon_total ?? 0) > 0 && (
                  <div className="flex justify-between items-center border-b pb-2">
                    <p className="text-sm font-medium">Extra branches</p>
                    <p className="font-serif text-sm">{formatMoney(tenant.addon_breakdown!.location_addon_total, tenant.currency)}/mo</p>
                  </div>
                )}
                {tenant.addon_breakdown?.staff_operations_enabled && (
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Staff Operations</p>
                    <p className="font-serif text-sm">{formatMoney(tenant.addon_breakdown!.staff_operations_total, tenant.currency)}/mo</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active add-ons.</p>
            )}
            <div className="flex justify-between items-center pt-3 border-t">
              <p className="text-sm font-medium">Comms credits</p>
              <p className="font-serif text-sm">{tenant?.comms_balance ?? "—"} remaining</p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
