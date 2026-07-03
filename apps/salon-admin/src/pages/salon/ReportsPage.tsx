import { useState } from "react";
import * as XLSX from "xlsx";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
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
} from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@ui/ui/use-toast";
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
  PieChart as RechartsPie,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";

const CHART_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  paystack: "Paystack",
  purse: "Client Wallet",
  other: "Other",
};

const RANK_EMOJI = ["🥇", "🥈", "🥉"];

interface StatChipProps {
  label: string;
  value: string;
  sub?: string;
  changePercent?: number | null;
  prevLabel?: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}

function StatChip({ label, value, sub, changePercent, prevLabel, icon: Icon, color, loading }: StatChipProps) {
  const isPositive = changePercent != null && changePercent >= 0;
  const hasChange = changePercent != null;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <p className="text-2xl font-bold leading-none mb-2">{value}</p>
              {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              {hasChange && (
                <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${isPositive ? "text-green-600" : "text-red-500"}`}>
                  {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{isPositive ? "+" : ""}{changePercent}% vs {prevLabel}</span>
                </div>
              )}
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const { currentTenant } = useAuth();
  const { stats, isLoading } = useReports(period);

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
      Revenue: d.revenue,
      [`Revenue (${stats.prevPeriodLabel})`]: d.prevRevenue,
    }));

    if (fileFormat === "csv") {
      const headers = Object.keys(data[0] || {});
      const rows = data.map((row) => Object.values(row).map(String));
      const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `revenue-report-${period}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Revenue");
      XLSX.writeFile(wb, `revenue-report-${period}.xlsx`);
    }

    toast({ title: "Exported", description: "Report downloaded successfully." });
  };

  const hasInsights = stats.busiestDay || stats.topService || stats.peakHour || stats.retentionRate != null;

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-sm text-muted-foreground">
              How your business is doing compared to {stats.prevPeriodLabel.toLowerCase()}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="w-4 h-4" />
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatChip
            label="Revenue"
            value={fmt(stats.totalRevenue)}
            changePercent={stats.revenueChangePercent}
            prevLabel={stats.prevPeriodLabel}
            icon={Coins}
            color="bg-green-100 text-green-700"
            loading={isLoading}
          />
          <StatChip
            label="Completed"
            value={stats.completedAppointments.toString()}
            sub="appointments done"
            icon={Calendar}
            color="bg-blue-100 text-blue-700"
            loading={isLoading}
          />
          <StatChip
            label="Cancelled"
            value={stats.cancelledAppointments.toString()}
            sub={stats.cancellationRate > 0 ? `${stats.cancellationRate}% of total` : "none this period"}
            icon={XCircle}
            color={stats.cancellationRate > 20 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-700"}
            loading={isLoading}
          />
          <StatChip
            label="New Clients"
            value={stats.newCustomers.toString()}
            sub="joined this period"
            icon={Users}
            color="bg-purple-100 text-purple-700"
            loading={isLoading}
          />
          <StatChip
            label="Returning"
            value={stats.returningCustomers.toString()}
            sub={stats.retentionPercent != null ? `${stats.retentionPercent}% retention` : "clients came back"}
            icon={Repeat2}
            color="bg-teal-100 text-teal-700"
            loading={isLoading}
          />
          <StatChip
            label="Avg. Booking"
            value={fmt(stats.avgTransactionValue)}
            sub="per transaction"
            icon={BarChart3}
            color="bg-amber-100 text-amber-700"
            loading={isLoading}
          />
        </div>

        {/* Revenue Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Revenue Over Time</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stats.periodLabel} (bars) vs {stats.prevPeriodLabel} (line)
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : stats.dailyRevenue.length === 0 ? (
              <div className="h-[260px] flex flex-col items-center justify-center text-muted-foreground gap-2">
                <BarChart3 className="w-8 h-8 opacity-40" />
                <p className="text-sm">No revenue data for this period yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={stats.dailyRevenue} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `${sym}${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [fmt(value), name]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name={stats.periodLabel} fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Line dataKey="prevRevenue" name={stats.prevPeriodLabel} stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Services + Payment Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Services */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Top Services</CardTitle>
              <p className="text-xs text-muted-foreground">Most booked services this period</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : stats.topServices.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No services booked yet this period.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
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
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">How Clients Pay</CardTitle>
              <p className="text-xs text-muted-foreground">Breakdown of payment methods used</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : stats.paymentMethodBreakdown.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No payment data available yet.
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    <RechartsPie width={140} height={140}>
                      <Pie
                        data={stats.paymentMethodBreakdown}
                        dataKey="amount"
                        nameKey="method"
                        cx="50%"
                        cy="50%"
                        outerRadius={62}
                        innerRadius={36}
                        strokeWidth={0}
                      >
                        {stats.paymentMethodBreakdown.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: 12,
                        }}
                        formatter={(v: number) => fmt(v)}
                      />
                    </RechartsPie>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {stats.paymentMethodBreakdown.map((item, i) => {
                      const total = stats.paymentMethodBreakdown.reduce((s, x) => s + x.amount, 0);
                      const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
                      return (
                        <div key={item.method}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-sm">{METHOD_LABELS[item.method] || item.method.replace(/_/g, " ")}</span>
                            </div>
                            <span className="text-sm font-medium">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Staff Performance */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Staff Performance</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Ranked by revenue generated this period</p>
          </CardHeader>
          <CardContent>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Rank</TableHead>
                    <TableHead>Staff Member</TableHead>
                    <TableHead className="text-right">Appointments</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.staffPerformance.map((staff, i) => (
                    <TableRow key={staff.userId} className={i === 0 ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                      <TableCell className="text-lg text-center">
                        {RANK_EMOJI[i] ?? <span className="text-sm text-muted-foreground font-mono">{i + 1}</span>}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{staff.name}</p>
                        {i === 0 && <p className="text-xs text-amber-600 font-medium">Top performer</p>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{staff.appointmentsCompleted}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{fmt(staff.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Quick Insights */}
        {(hasInsights || !isLoading) && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base font-semibold">Quick Insights</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Patterns worth knowing about</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
                </div>
              ) : !hasInsights ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Insights appear once you have more booking history.</p>
                  <p className="text-xs mt-1">Need at least 10 completed appointments.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {stats.busiestDay && (
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
                      <Calendar className="w-5 h-5 mx-auto mb-1 text-blue-600" />
                      <p className="text-lg font-bold text-blue-700">{stats.busiestDay}</p>
                      <p className="text-xs text-blue-600/80">Busiest Day</p>
                    </div>
                  )}
                  {stats.peakHour && (
                    <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 p-4 text-center">
                      <Clock className="w-5 h-5 mx-auto mb-1 text-purple-600" />
                      <p className="text-lg font-bold text-purple-700">{stats.peakHour}</p>
                      <p className="text-xs text-purple-600/80">Peak Hour</p>
                    </div>
                  )}
                  {stats.topService && (
                    <div className="rounded-xl bg-green-50 dark:bg-green-950/30 p-4 text-center">
                      <Star className="w-5 h-5 mx-auto mb-1 text-green-600" />
                      <p className="text-sm font-bold text-green-700 truncate">{stats.topService}</p>
                      <p className="text-xs text-green-600/80">Most Booked</p>
                    </div>
                  )}
                  {stats.retentionRate != null && (
                    <div className="rounded-xl bg-teal-50 dark:bg-teal-950/30 p-4 text-center">
                      <Repeat2 className="w-5 h-5 mx-auto mb-1 text-teal-600" />
                      <p className="text-lg font-bold text-teal-700">{stats.retentionRate}%</p>
                      <p className="text-xs text-teal-600/80">Clients Returned</p>
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
