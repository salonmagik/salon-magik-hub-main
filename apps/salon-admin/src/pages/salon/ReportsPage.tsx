import { useState } from "react";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import * as XLSX from "xlsx";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import {
  DateRangePicker,
  type DateRangePreset,
} from "@ui/date-range-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  UserCheck,
  Clock,
  Star,
  Repeat2,
  XCircle,
  BarChart3,
  Coins,
  Upload,
  CreditCard,
  Banknote,
  Smartphone,
  Info,
} from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useCustomerSegments } from "@/hooks/useCustomerSegments";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@ui/ui/use-toast";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  paystack: "Paystack",
  purse: "Client Wallet",
  other: "Other",
};

interface StatChipProps {
  label: string;
  value: string;
  sub?: string;
  description?: string;
  changePercent?: number | null;
  prevLabel?: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}

function StatChip({ label, value, sub, description, changePercent, prevLabel, icon: Icon, color, loading }: StatChipProps) {
  const isPositive = changePercent != null && changePercent >= 0;
  const hasChange = changePercent != null;

  return (
    <Card className="rounded-[14px] border-[#141014]/[0.06] bg-white shadow-none">
      <CardContent className="p-4 sm:px-[18px]">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <>
            <div className="mb-2.5 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <p className="min-w-0 text-[11px] font-normal uppercase tracking-[0.04em] text-[#141014]/60">
                  {label}
                </p>
                {description && (
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 shrink-0 text-[#141014]/42 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-xs">
                      {description}
                    </TooltipContent>
                  </UiTooltip>
                )}
              </div>
              <div className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-[15px] w-[15px]" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-serif text-[22px] font-medium leading-none text-[#141014]">{value}</p>
              {sub && <p className="mt-1 text-xs text-[#141014]/42">{sub}</p>}
              {hasChange && (
                <div className={`mt-1 flex items-center gap-1 text-[11px] ${isPositive ? "text-[#2e7d5b]" : "text-[#a23b3b]"}`}>
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{isPositive ? "+" : ""}{changePercent}% vs {prevLabel}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const now = new Date();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("month");
  const [reportRange, setReportRange] = useState({
    start: startOfMonth(now),
    end: endOfMonth(now),
  });
  const { currentTenant } = useAuth();
  const { stats, isLoading } = useReports(period, reportRange);
  const { segments, isLoading: segmentsLoading } = useCustomerSegments();

  const segmentBreakdown = [
    {
      key: "vip",
      label: "VIP",
      icon: Star,
      iconClass: "bg-[#fbf0d4] text-[#7a5e12]",
      count: Object.values(segments).filter((s) => s.is_vip).length,
      revenue: Object.values(segments).filter((s) => s.is_vip).reduce((sum, s) => sum + s.total_paid, 0),
      description: "Marked manually by your team — click the star on a customer to toggle it.",
    },
    {
      key: "big_spender",
      label: "Big spenders",
      icon: Coins,
      iconClass: "bg-[#e3f3eb] text-[#2e7d5b]",
      count: Object.values(segments).filter((s) => s.is_big_spender).length,
      revenue: Object.values(segments).filter((s) => s.is_big_spender).reduce((sum, s) => sum + s.total_paid, 0),
      description: "Top 10% of paying customers at this salon by total amount spent. Only shown once you have at least 5 paying customers.",
    },
    {
      key: "regular",
      label: "Regulars",
      icon: Repeat2,
      iconClass: "bg-[#f1eafa] text-[#4a3878]",
      count: Object.values(segments).filter((s) => s.is_regular).length,
      revenue: Object.values(segments).filter((s) => s.is_regular).reduce((sum, s) => sum + s.total_paid, 0),
      description: "Visited 5 or more times.",
    },
    {
      key: "loves_packages",
      label: "Loves packages",
      icon: BarChart3,
      iconClass: "bg-[#f1eafa] text-[#4a3878]",
      count: Object.values(segments).filter((s) => s.loves_packages).length,
      revenue: Object.values(segments).filter((s) => s.loves_packages).reduce((sum, s) => sum + s.total_paid, 0),
      description: "Bought 3 or more packages in the last 3 months.",
    },
    {
      key: "lapsed",
      label: "Lapsed",
      icon: XCircle,
      iconClass: "bg-[#f7e5e5] text-[#a23b3b]",
      count: Object.values(segments).filter((s) => s.is_lapsed).length,
      revenue: Object.values(segments).filter((s) => s.is_lapsed).reduce((sum, s) => sum + s.total_paid, 0),
      description: "Hasn't visited in over 45 days.",
    },
  ];
  const hasSegmentData = Object.keys(segments).length > 0;
  const reportPresets: DateRangePreset[] = [
    { label: "Today", getRange: () => ({ from: new Date(), to: new Date() }) },
    { label: "This week", getRange: () => ({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) }) },
    { label: "This month", getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  ];

  const currency = currentTenant?.currency || "USD";
  const currencySymbols: Record<string, string> = {
    USD: "$", GHS: "₵", NGN: "₦", EUR: "€", GBP: "£",
  };
  const sym = currencySymbols[currency] || currency;

  const fmt = (amount: number) =>
    `${sym}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const handleExport = (fileFormat: "csv" | "xlsx") => {
    const data = stats.dailyRevenue.map((d) => ({
      Date: d.date,
      Inflow: d.revenue,
      [`Inflow (${stats.prevPeriodLabel})`]: d.prevRevenue,
    }));

    if (fileFormat === "csv") {
      const headers = Object.keys(data[0] || {});
      const rows = data.map((row) => Object.values(row).map(String));
      const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `inflow-report-${period}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inflow");
      XLSX.writeFile(wb, `inflow-report-${period}.xlsx`);
    }

    toast({ title: "Exported", description: "Report downloaded successfully." });
  };

  const hasInsights = stats.busiestDay || stats.topService || stats.peakHour || stats.retentionRate != null;

  return (
    <SalonSidebar>
      <div className="mx-auto w-full max-w-[1500px] space-y-[22px]">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.3px]">Reports</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              How your business is doing compared to {stats.prevPeriodLabel.toLowerCase()}.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <DateRangePicker
              from={reportRange.start}
              to={reportRange.end}
              presets={reportPresets}
              onChange={({ from, to }) => {
                setReportRange({ start: from, end: to });
                setPeriod("custom");
              }}
              className="h-11 min-w-0 flex-1 rounded-full px-4 text-[13.5px] sm:min-w-[220px] sm:flex-none"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 shrink-0 gap-2 rounded-full px-4 text-[13.5px]">
                  <Upload className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>Download as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>Download as Excel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stat Chips */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatChip
            label="Inflow"
            value={fmt(stats.totalRevenue)}
            description="Total money collected in this period — completed payments only, before refunds."
            changePercent={stats.revenueChangePercent}
            prevLabel={stats.prevPeriodLabel}
            icon={Coins}
            color="bg-[#e3f3eb] text-[#2e7d5b]"
            loading={isLoading}
          />
          <StatChip
            label="Completed"
            value={stats.completedAppointments.toString()}
            sub="appointments done"
            description="Appointments marked completed in this period."
            icon={Calendar}
            color="bg-[#f2eefa] text-[#2e1f4e]"
            loading={isLoading}
          />
          <StatChip
            label="Cancelled"
            value={stats.cancelledAppointments.toString()}
            sub={stats.cancellationRate > 0 ? `${stats.cancellationRate}% of total` : "none this period"}
            description="Appointments cancelled in this period, as a share of everything booked."
            icon={XCircle}
            color="bg-[#f7e5e5] text-[#a23b3b]"
            loading={isLoading}
          />
          <StatChip
            label="New Clients"
            value={stats.newCustomers.toString()}
            sub="joined this period"
            description="Customers who booked with you for the very first time in this period."
            icon={Users}
            color="bg-[#2e1f4e]/[0.08] text-[#2e1f4e]"
            loading={isLoading}
          />
          <StatChip
            label="Returning"
            value={stats.returningCustomers.toString()}
            sub={stats.retentionPercent != null ? `${stats.retentionPercent}% retention` : "clients came back"}
            description="Existing customers who booked again in this period. Retention % is this as a share of your total active clients."
            icon={Repeat2}
            color="bg-[#2e7d5b]/10 text-[#2e7d5b]"
            loading={isLoading}
          />
          <StatChip
            label="Average income"
            value={fmt(stats.avgTransactionValue)}
            sub="per transaction"
            description="Total inflow this period divided by number of paid transactions — not per appointment or per client."
            icon={BarChart3}
            color="bg-[#fbf0d4] text-[#7a5e12]"
            loading={isLoading}
          />
        </div>

        {/* Revenue Chart */}
        <Card className="rounded-[22px] border-[#141014]/[0.06] bg-white shadow-sm">
          <CardHeader className="px-5 pb-2 pt-5 sm:px-[26px] sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-normal">Inflow over time</CardTitle>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {stats.periodLabel} (bars) vs {stats.prevPeriodLabel} (line)
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-5 sm:px-[26px] sm:pb-6">
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : stats.dailyRevenue.length === 0 ? (
              <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-muted-foreground">
                <BarChart3 className="w-8 h-8 opacity-40" />
                <p className="text-sm">No inflow data for this period yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={stats.dailyRevenue} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(20,16,20,0.06)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(20,16,20,0.42)" axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="rgba(20,16,20,0.42)"
                    tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid rgba(20,16,20,0.09)",
                      borderRadius: "14px",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [fmt(value), name]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name={stats.periodLabel} fill="#2e1f4e" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Line dataKey="prevRevenue" name={stats.prevPeriodLabel} stroke="#8b7bae" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Services + Payment Methods */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Top Services */}
          <Card className="rounded-[22px] border-[#141014]/[0.06] bg-white shadow-sm">
            <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
              <CardTitle className="text-base font-normal">Top services</CardTitle>
              <p className="text-[13px] text-muted-foreground">Most booked services this period</p>
            </CardHeader>
            <CardContent className="px-3 pb-5 sm:px-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : stats.topServices.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No services booked yet this period.
                </div>
              ) : (
                <div className="scrollbar-hide overflow-x-auto">
                <Table className="min-w-[460px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-[11px] font-normal uppercase text-[#141014]/42">#</TableHead>
                      <TableHead className="text-[11px] font-normal uppercase text-[#141014]/42">Service</TableHead>
                      <TableHead className="text-right text-[11px] font-normal uppercase text-[#141014]/42">Bookings</TableHead>
                      <TableHead className="text-right text-[11px] font-normal uppercase text-[#141014]/42">Inflow</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topServices.map((svc, i) => (
                      <TableRow key={svc.name}>
                        <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{svc.name}</TableCell>
                        <TableCell className="text-right text-sm">{svc.count}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(svc.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="rounded-[22px] border-[#141014]/[0.06] bg-white shadow-sm">
            <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
              <CardTitle className="text-base font-normal">How clients pay</CardTitle>
              <p className="text-[13px] text-muted-foreground">Breakdown of payment methods used</p>
            </CardHeader>
            <CardContent className="px-5 pb-5 sm:px-6">
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : stats.paymentMethodBreakdown.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No payment data available yet.
                </div>
              ) : (
                <div className="space-y-3.5">
                    {stats.paymentMethodBreakdown.map((item) => {
                      const total = stats.paymentMethodBreakdown.reduce((s, x) => s + x.amount, 0);
                      const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
                      const MethodIcon =
                        item.method === "cash"
                          ? Banknote
                          : item.method === "mobile_money"
                            ? Smartphone
                            : CreditCard;
                      return (
                        <div key={item.method} className="flex items-center gap-3">
                          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#f2eefa] text-[#2e1f4e]">
                            <MethodIcon className="h-[15px] w-[15px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <span className="truncate text-[12.5px]">
                                {METHOD_LABELS[item.method] || item.method.replace(/_/g, " ")}
                              </span>
                              <span className="text-[12.5px] font-medium">{pct}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[#f1ece3]">
                            <div
                                className="h-full rounded-full bg-[#2e1f4e] transition-all"
                                style={{ width: `${pct}%` }}
                            />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Staff Performance */}
        <Card className="rounded-[22px] border-[#141014]/[0.06] bg-white shadow-sm">
          <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-normal">Staff performance</CardTitle>
            </div>
            <p className="text-[13px] text-muted-foreground">Ranked by revenue generated this period</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : stats.staffPerformance.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No staff data yet. Assign staff to completed appointments to see rankings.</p>
              </div>
            ) : (
              <div>
                {stats.staffPerformance.map((staff, i) => (
                  <div
                    key={staff.userId}
                    className="flex items-center gap-3.5 border-b border-[#141014]/[0.06] py-3 last:border-b-0"
                  >
                    <div
                      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12.5px] ${
                        i === 0 ? "bg-[#f4c84e] text-[#1f1536]" : "bg-[#f1ece3] text-[#141014]/60"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b8a9d9] font-serif text-[13px] text-[#1f1536]">
                      {staff.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {staff.appointmentsCompleted} appointment{staff.appointmentsCompleted === 1 ? "" : "s"} completed
                      </p>
                    </div>
                    <p className="shrink-0 font-serif text-[15px]">{fmt(staff.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Segments */}
        <Card className="rounded-[22px] border-[#141014]/[0.06] bg-white shadow-sm">
          <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-normal">Customer segments</CardTitle>
            </div>
            <p className="text-[13px] text-muted-foreground">Who your customers are, and what they're worth</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6">
            {segmentsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : !hasSegmentData ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No customers yet. Segments appear once you start adding customers.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {segmentBreakdown.map((segment) => {
                  const Icon = segment.icon;
                  return (
                    <div key={segment.key} className="rounded-xl border border-[#141014]/[0.06] p-3.5">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-[9px] mb-2 ${segment.iconClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-1">
                        <p className="text-[13.5px] font-medium">{segment.label}</p>
                        <UiTooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            {segment.description}
                          </TooltipContent>
                        </UiTooltip>
                      </div>
                      <p className="font-serif text-[19px] mt-0.5">{segment.count}</p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">{fmt(segment.revenue)} lifetime</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Insights */}
        {(hasInsights || !isLoading) && (
          <Card className="rounded-[22px] border-[#141014]/[0.06] bg-white shadow-sm">
            <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-[#f4c84e] text-[#f4c84e]" />
                <CardTitle className="text-base font-normal">Quick insights</CardTitle>
              </div>
              <p className="text-[13px] text-muted-foreground">Patterns worth knowing about</p>
            </CardHeader>
            <CardContent className="px-5 pb-5 sm:px-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
                </div>
              ) : !hasInsights ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Insights appear once you have more booking history.</p>
                  <p className="text-xs mt-1">Need at least 10 completed appointments.</p>
                </div>
              ) : (
                <div>
                  {stats.busiestDay && (
                    <div className="flex items-start gap-3 border-b border-[#141014]/[0.06] py-3.5 last:border-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#fbf0d4] text-[#7a5e12]">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium">{stats.busiestDay} is your busiest day</p>
                        <p className="text-[12.5px] text-muted-foreground">Plan staffing and availability around this demand.</p>
                      </div>
                    </div>
                  )}
                  {stats.peakHour && (
                    <div className="flex items-start gap-3 border-b border-[#141014]/[0.06] py-3.5 last:border-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#fbf0d4] text-[#7a5e12]">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium">{stats.peakHour} is your peak hour</p>
                        <p className="text-[12.5px] text-muted-foreground">Protect this time for your most requested services.</p>
                      </div>
                    </div>
                  )}
                  {stats.topService && (
                    <div className="flex items-start gap-3 border-b border-[#141014]/[0.06] py-3.5 last:border-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#fbf0d4] text-[#7a5e12]">
                        <Star className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium">{stats.topService} is your most-booked service</p>
                        <p className="text-[12.5px] text-muted-foreground">Feature it prominently in your booking experience.</p>
                      </div>
                    </div>
                  )}
                  {stats.retentionRate != null && (
                    <div className="flex items-start gap-3 border-b border-[#141014]/[0.06] py-3.5 last:border-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#fbf0d4] text-[#7a5e12]">
                        <Repeat2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium">{stats.retentionRate}% of clients returned</p>
                        <p className="text-[12.5px] text-muted-foreground">Track this trend as your booking history grows.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </SalonSidebar>
  );
}
