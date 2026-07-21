import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useWaitlist, useTenants } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { StatCard } from "@ui/stat-card";
import { Badge } from "@ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@ui/chart";
import { Link, Navigate } from "react-router-dom";
import { Users, Building2, Clock, UserCog, Sparkles, Globe2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

const growthChartConfig: ChartConfig = {
  count: { label: "New tenants", color: "hsl(var(--primary))" },
};

const planChartConfig: ChartConfig = {
  count: { label: "Tenants", color: "hsl(var(--primary))" },
};

export default function BackofficeDashboardPage() {
  const { backofficeUser, hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();
  const { data: pendingLeads } = useWaitlist("pending");
  const { data: tenants } = useTenants();
  const { data: marketCountries } = useQuery({
    queryKey: ["backoffice-dashboard-market-countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_countries")
        .select("country_code,country_name")
        .eq("is_selectable", true)
        .order("country_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const pendingCount = pendingLeads?.length || 0;

  const {
    activeCount,
    trialingCount,
    totalStaff,
    newThisMonth,
    regions,
    growthSeries,
    planSeries,
  } = useMemo(() => {
    const rows = tenants || [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const active = rows.filter((t) => t.subscription_status === "active").length;
    const trialing = rows.filter((t) => t.subscription_status === "trialing").length;
    const staffSum = rows.reduce((sum, t) => sum + (t.staff_count || 0), 0);
    const recent = rows.filter((t) => t.created_at && new Date(t.created_at) >= thirtyDaysAgo).length;

    const byCountry = new Map<string, { tenants: number; active: number; staff: number }>();
    // Seed every active market with zeros first, so a country with no tenants
    // yet still shows up in the overview instead of disappearing entirely.
    (marketCountries || []).forEach((market) => {
      byCountry.set(market.country_code, { tenants: 0, active: 0, staff: 0 });
    });
    rows.forEach((t) => {
      const key = t.country || "Other";
      const entry = byCountry.get(key) || { tenants: 0, active: 0, staff: 0 };
      entry.tenants += 1;
      if (t.subscription_status === "active" || t.subscription_status === "trialing") entry.active += 1;
      entry.staff += t.staff_count || 0;
      byCountry.set(key, entry);
    });

    const byPlan = new Map<string, number>();
    rows.forEach((t) => {
      const key = t.plan || "unknown";
      byPlan.set(key, (byPlan.get(key) || 0) + 1);
    });

    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString(undefined, { month: "short" }) });
    }
    const monthCounts = new Map(months.map((m) => [m.key, 0]));
    rows.forEach((t) => {
      if (!t.created_at) return;
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthCounts.has(key)) monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    });

    const countryNameByCode = new Map((marketCountries || []).map((m) => [m.country_code, m.country_name]));

    return {
      activeCount: active,
      trialingCount: trialing,
      totalStaff: staffSum,
      newThisMonth: recent,
      regions: Array.from(byCountry.entries()).map(([country, stats]) => ({
        country,
        countryName: countryNameByCode.get(country) || country,
        ...stats,
      })),
      growthSeries: months.map((m) => ({ month: m.label, count: monthCounts.get(m.key) || 0 })),
      planSeries: Array.from(byPlan.entries()).map(([plan, count]) => ({
        plan: plan.charAt(0).toUpperCase() + plan.slice(1),
        count,
      })),
    };
  }, [tenants, marketCountries]);

  if (backofficeUser?.role !== "super_admin") {
    const routeCandidates: Array<{ route: string; pageKey: string; permissionKey?: string }> = [
      { route: "/customers/waitlists", pageKey: "customers_waitlists", permissionKey: "customers.view_waitlists" },
      { route: "/customers/tenants", pageKey: "customers_tenants", permissionKey: "customers.view_tenants" },
      { route: "/customers/ops-monitor", pageKey: "customers_ops_monitor", permissionKey: "customers.view_ops_monitor" },
      { route: "/feature-flags", pageKey: "feature_flags" },
      { route: "/plans", pageKey: "plans", permissionKey: "plans.view" },
      { route: "/comms", pageKey: "comms", permissionKey: "comms.view" },
      { route: "/sales/campaigns", pageKey: "sales_campaigns", permissionKey: "sales.manage_campaigns" },
      { route: "/sales/capture-client", pageKey: "sales_capture_client", permissionKey: "sales.capture_client" },
      { route: "/sales/conversions", pageKey: "sales_conversions", permissionKey: "sales.view_conversions" },
      { route: "/admins", pageKey: "admins" },
      { route: "/audit-logs", pageKey: "audit_logs", permissionKey: "audit_logs.view" },
      { route: "/settings", pageKey: "settings", permissionKey: "settings.view" },
    ];
    const firstAllowed = routeCandidates.find(
      (candidate) =>
        hasBackofficePageAccess(candidate.pageKey) &&
        (!candidate.permissionKey || hasBackofficePermission(candidate.permissionKey)),
    );
    if (firstAllowed) {
      return <Navigate to={firstAllowed.route} replace />;
    }
  }

  const stats = [
    {
      title: "Total Tenants",
      value: tenants?.length || 0,
      description: "All salons",
      icon: Users,
      href: "/customers/tenants",
      tone: "info" as const,
    },
    {
      title: "Active Tenants",
      value: activeCount,
      description: "Currently active",
      icon: Building2,
      href: "/customers/tenants",
      tone: "success" as const,
    },
    {
      title: "Trialing",
      value: trialingCount,
      description: "In free trial",
      icon: Sparkles,
      href: "/customers/tenants",
      tone: "default" as const,
    },
    {
      title: "Pending Leads",
      value: pendingCount,
      description: "Awaiting review",
      icon: Clock,
      href: "/customers/waitlists",
      tone: "warning" as const,
    },
    {
      title: "Total Staff",
      value: totalStaff,
      description: "Across all tenants",
      icon: UserCog,
      href: "/admins",
      tone: "default" as const,
    },
    {
      title: "New This Month",
      value: newThisMonth,
      description: "Signed up in the last 30 days",
      icon: Globe2,
      href: "/customers/tenants",
      tone: "info" as const,
    },
  ];

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Platform overview and quick actions
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <StatCard
              key={stat.title}
              label={stat.title}
              value={stat.value}
              description={stat.description}
              icon={stat.icon}
              tone={stat.tone}
              href={stat.href}
            />
          ))}
        </div>

        {pendingCount > 0 && (
          <Card className="border-warning-bg bg-warning-bg/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <Clock className="h-5 w-5" />
                Action Required
              </CardTitle>
              <CardDescription className="text-warning/80">
                You have {pendingCount} waitlist {pendingCount === 1 ? "lead" : "leads"} awaiting review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/customers/waitlists">Review Waitlist</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {regions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Regional Overview</CardTitle>
              <CardDescription>Tenants broken down by country</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {regions.map((region) => {
                  const activeRate = region.tenants > 0 ? Math.round((region.active / region.tenants) * 100) : 0;
                  return (
                    <div key={region.country} className="rounded-lg border p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-medium">{region.countryName}</span>
                        <Badge variant="info">{region.tenants} tenants</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Active/Trialing</p>
                          <p className="text-xl font-semibold">{region.active}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Staff</p>
                          <p className="text-xl font-semibold">{region.staff}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Active Rate</p>
                          <p className="text-xl font-semibold">{activeRate}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tenant Growth</CardTitle>
              <CardDescription>New tenants per month, last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={growthChartConfig} className="h-64 w-full">
                <LineChart data={growthSeries}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plan Distribution</CardTitle>
              <CardDescription>Tenants by plan tier</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={planChartConfig} className="h-64 w-full">
                <BarChart data={planSeries}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="plan" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </BackofficeLayout>
  );
}
