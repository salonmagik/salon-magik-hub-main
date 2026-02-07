import { useState } from "react";
import * as XLSX from "xlsx";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  Users,
  Calendar,
  Coins,
  PieChart,
  BarChart3,
  ArrowUp,
  ArrowDown,
  UserCheck,
} from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ExportDropdown } from "@/components/ExportDropdown";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
} from "recharts";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const { currentTenant } = useAuth();
  const { stats, isLoading } = useReports(period);

  const currency = currentTenant?.currency || "USD";

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      USD: "$",
      GHS: "₵",
      NGN: "₦",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  };

  const statCards = [
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      change: "+12%",
      trend: "up",
      icon: Coins,
    },
    {
      title: "Appointments",
      value: stats.totalAppointments.toString(),
      change: `${stats.completedAppointments} completed`,
      trend: "neutral",
      icon: Calendar,
    },
    {
      title: "New Customers",
      value: stats.newCustomers.toString(),
      change: "This period",
      trend: "up",
      icon: Users,
    },
  ];

  const hasInsights = stats.busiestDay || stats.topService || stats.peakHour || stats.retentionRate;

  const handleExport = (fileFormat: "csv" | "xlsx") => {
    const data = stats.dailyRevenue.map((d) => ({
      Date: d.date,
      Revenue: d.revenue,
    }));

    if (fileFormat === "csv") {
      const headers = ["Date", "Revenue"];
      const rows = stats.dailyRevenue.map((d) => [d.date, d.revenue.toString()]);
      const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
      
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `revenue-report-${period}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } else {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue");
      XLSX.writeFile(workbook, `revenue-report-${period}.xlsx`);
    }
    
    toast({
      title: "Export Complete",
      description: "Revenue report downloaded successfully",
    });
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Reports</h1>
            <p className="text-muted-foreground">
              Analyze your business performance and trends.
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
            <ExportDropdown onExport={handleExport} disabled={stats.dailyRevenue.length === 0} />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-20 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </CardContent>
                </Card>
              ))
            : statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{stat.title}</p>
                          <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            {stat.trend === "up" && <ArrowUp className="w-3 h-3 text-success" />}
                            {stat.trend === "down" && <ArrowDown className="w-3 h-3 text-destructive" />}
                            {stat.change}
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {/* Insights Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasInsights ? (
              <div className="text-center py-6 text-muted-foreground">
                <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Keep going! Insights will appear once you have more appointment history.</p>
                <p className="text-xs mt-1">Need at least 10 completed appointments for insights.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {stats.busiestDay && (
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-primary">{stats.busiestDay}</p>
                    <p className="text-sm text-muted-foreground">Busiest Day</p>
                  </div>
                )}
                {stats.topService && (
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-lg font-bold text-primary truncate">{stats.topService}</p>
                    <p className="text-sm text-muted-foreground">Top Service</p>
                  </div>
                )}
                {stats.peakHour && (
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-primary">{stats.peakHour}</p>
                    <p className="text-sm text-muted-foreground">Peak Hour</p>
                  </div>
                )}
                {stats.retentionRate !== null && (
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-success">{stats.retentionRate}%</p>
                    <p className="text-sm text-muted-foreground">Retention Rate</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Revenue Trend</CardTitle>
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : stats.dailyRevenue.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={stats.dailyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => formatCurrency(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Payment Methods</CardTitle>
              <PieChart className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : stats.paymentMethodBreakdown.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              ) : (
                <div className="flex items-center gap-8">
                  <ResponsiveContainer width="50%" height={200}>
                    <RechartsPie>
                      <Pie
                        data={stats.paymentMethodBreakdown}
                        dataKey="amount"
                        nameKey="method"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                      >
                        {stats.paymentMethodBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {stats.paymentMethodBreakdown.map((item, index) => (
                      <div key={item.method} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="text-sm capitalize">{item.method.replace("_", " ")}</span>
                        </div>
                        <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Services */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Top Services</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : stats.topServices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No services data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.topServices} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Staff Performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Staff Performance</CardTitle>
            <UserCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : stats.staffPerformance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No staff performance data available.</p>
                <p className="text-xs mt-1">Assign staff to appointments to track performance.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead className="text-right">Appointments</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.staffPerformance.map((staff, index) => (
                    <TableRow key={staff.userId}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {index === 0 && <Badge className="text-xs">Top</Badge>}
                          {staff.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{staff.appointmentsCompleted}</TableCell>
                      <TableCell className="text-right">{formatCurrency(staff.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Appointment Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-success">{stats.completedAppointments}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-destructive">{stats.cancelledAppointments}</p>
              <p className="text-sm text-muted-foreground">Cancelled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{stats.newCustomers}</p>
              <p className="text-sm text-muted-foreground">New Customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{stats.returningCustomers}</p>
              <p className="text-sm text-muted-foreground">Returning</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </SalonSidebar>
  );
}
