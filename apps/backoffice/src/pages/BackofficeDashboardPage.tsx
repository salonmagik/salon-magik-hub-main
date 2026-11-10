import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useWaitlist, useTenants, useBlockedRefundsCount, useBackofficeUsers } from "@/hooks";
import { useCommsUsage } from "@/hooks/useCommsUsage";
import { supabase } from "@/lib/supabase";
import { Link, Navigate } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  Clock,
  CreditCard,
  Wallet,
  ChevronRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@ui/chart";

const CURRENCY_BY_COUNTRY_CODE: Record<string, "NGN" | "GHS"> = {
  NG: "NGN",
  GH: "GHS",
};

const CURRENCY_SYMBOL: Record<"NGN" | "GHS", string> = {
  NGN: "₦",
  GHS: "₵",
};

function formatCompactMoney(amount: number, currency: "NGN" | "GHS") {
  const symbol = CURRENCY_SYMBOL[currency];
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(1)}k`;
  return `${symbol}${amount.toFixed(0)}`;
}

function formatAuditActionText(action: string, entityType: string) {
  const readable = action.replace(/[._]+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  return entityType ? `${readable} (${entityType.replace(/_/g, " ")})` : readable;
}

function adminDisplayName(user: { full_name: string | null; first_name: string | null; last_name: string | null; email: string | null } | undefined) {
  if (!user) return "A team member";
  if (user.full_name?.trim()) {
    const parts = user.full_name.trim().split(/\s+/);
    if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
    return parts[0];
  }
  if (user.first_name) return user.last_name ? `${user.first_name} ${user.last_name[0]}.` : user.first_name;
  if (user.email) return user.email.split("@")[0];
  return "A team member";
}

function timeAgoLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const growthChartConfig: ChartConfig = {
  count: { label: "New tenants", color: "hsl(var(--primary))" },
};

export default function BackofficeDashboardPage() {
  const { backofficeUser, hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();
  const { data: pendingLeads } = useWaitlist("pending");
  const { data: tenants } = useTenants();
  const { data: blockedRefundsCount = 0 } = useBlockedRefundsCount(Boolean(backofficeUser?.user_id));
  const { data: commsUsage } = useCommsUsage();
  const { data: backofficeUsers } = useBackofficeUsers();

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

  const { data: chainUnlockRequests = [] } = useQuery({
    queryKey: ["chain-unlock-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("tenant_chain_unlock_requests" as any)
        .select("id, tenant_id, status, tenant:tenants(id,name)")
        .eq("status", "pending") as any);
      if (error) throw error;
      return (data || []) as Array<{ id: string; tenant_id: string; tenant?: { name: string | null } | null }>;
    },
  });

  const { data: incompletePayoutSetups = [] } = useQuery({
    queryKey: ["payout-recipient-setup-queue-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_payout_destinations")
        .select("id")
        .is("paystack_recipient_code", null);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: planPricingRows } = useQuery({
    queryKey: ["backoffice-dashboard-plan-pricing"],
    queryFn: async () => {
      const [{ data: plans, error: plansError }, { data: pricing, error: pricingError }] = await Promise.all([
        supabase.from("plans").select("id, slug"),
        supabase.from("plan_pricing").select("plan_id, currency, monthly_price").is("valid_until", null),
      ]);
      if (plansError) throw plansError;
      if (pricingError) throw pricingError;
      const slugById = new Map((plans || []).map((p) => [p.id, p.slug]));
      return (pricing || []).map((row) => ({
        slug: slugById.get(row.plan_id) || "",
        currency: row.currency as "NGN" | "GHS",
        monthlyPrice: Number(row.monthly_price) || 0,
      }));
    },
  });

  const { data: recentAuditLogs = [] } = useQuery({
    queryKey: ["backoffice-dashboard-recent-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, actor_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
  });

  const pendingCount = pendingLeads?.length || 0;
  const lowSmsSalonsCount = useMemo(
    () => (commsUsage || []).filter(
      (r) => (Number(r.complimentary_marketing_sms_balance || 0) + Number(r.purchased_sms_balance || 0)) < 10,
    ).length,
    [commsUsage],
  );

  const {
    activeCount,
    trialingCount,
    pastDueCount,
    mrrByCurrency,
    growthSeries,
    planSeries,
  } = useMemo(() => {
    const rows = tenants || [];
    const now = new Date();

    const active = rows.filter((t) => t.subscription_status === "active").length;
    const trialing = rows.filter((t) => t.subscription_status === "trialing").length;
    const pastDue = rows.filter((t) => t.subscription_status === "past_due").length;

    const priceLookup = new Map((planPricingRows || []).map((r) => [`${r.slug}:${r.currency}`, r.monthlyPrice]));
    const mrr: Record<"NGN" | "GHS", number> = { NGN: 0, GHS: 0 };
    rows.forEach((t) => {
      if (t.subscription_status !== "active") return;
      const currency = CURRENCY_BY_COUNTRY_CODE[t.country || ""];
      if (!currency || !t.plan) return;
      mrr[currency] += priceLookup.get(`${t.plan}:${currency}`) || 0;
    });

    const byPlan = new Map<string, number>();
    rows.forEach((t) => {
      const key = t.plan || "unknown";
      byPlan.set(key, (byPlan.get(key) || 0) + 1);
    });
    const totalForPlanShare = rows.length || 1;

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

    return {
      activeCount: active,
      trialingCount: trialing,
      pastDueCount: pastDue,
      mrrByCurrency: mrr,
      growthSeries: months.map((m) => ({ month: m.label, count: monthCounts.get(m.key) || 0 })),
      planSeries: Array.from(byPlan.entries())
        .map(([plan, count]) => ({
          plan: plan.charAt(0).toUpperCase() + plan.slice(1),
          count,
          pct: Math.round((count / totalForPlanShare) * 100),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [tenants, planPricingRows]);

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

  const needsAttentionItems = [
    blockedRefundsCount > 0 && {
      key: "blocked-refunds",
      href: "/transactions",
      icon: AlertTriangle,
      tone: "destructive" as const,
      title: `${blockedRefundsCount} blocked refund ${blockedRefundsCount === 1 ? "attempt" : "attempts"}`,
      description: "Salon already withdrew the funds — review in Payments",
      chip: "Critical",
    },
    chainUnlockRequests.length > 0 && {
      key: "chain-unlocks",
      href: "/customers/tenants",
      icon: Building2,
      tone: "warning" as const,
      title: `${chainUnlockRequests.length} chain-location unlock ${chainUnlockRequests.length === 1 ? "request" : "requests"}`,
      description: "Chain-plan salons asking to exceed their default location cap",
      chip: "Needs review",
    },
    lowSmsSalonsCount > 0 && {
      key: "low-sms",
      href: "/comms-credits",
      icon: Clock,
      tone: "warning" as const,
      title: `${lowSmsSalonsCount} ${lowSmsSalonsCount === 1 ? "salon" : "salons"} under 10 SMS credits`,
      description: "Reminders will silently stop sending",
      chip: "Needs review",
    },
    incompletePayoutSetups.length > 0 && {
      key: "payout-setup",
      href: "/verification-queue",
      icon: Wallet,
      tone: "info" as const,
      title: `${incompletePayoutSetups.length} ${incompletePayoutSetups.length === 1 ? "salon" : "salons"} mid payout setup`,
      description: "Started but haven't finished bank verification",
      chip: "In progress",
    },
    pendingCount > 0 && {
      key: "pending-leads",
      href: "/customers/waitlists",
      icon: Clock,
      tone: "warning" as const,
      title: `${pendingCount} waitlist ${pendingCount === 1 ? "lead" : "leads"} awaiting review`,
      description: "Still awaiting approval and an invite from the backoffice team",
      chip: "Needs review",
    },
  ].filter(Boolean) as Array<{
    key: string;
    href: string;
    icon: typeof AlertTriangle;
    tone: "destructive" | "warning" | "info";
    title: string;
    description: string;
    chip: string;
  }>;

  const toneClasses: Record<string, { iconWrap: string; icon: string; chip: string }> = {
    destructive: { iconWrap: "bg-destructive-bg", icon: "text-destructive", chip: "bg-destructive-bg text-destructive" },
    warning: { iconWrap: "bg-warning-bg", icon: "text-warning", chip: "bg-warning-bg text-warning" },
    info: { iconWrap: "bg-info-bg", icon: "text-info", chip: "bg-info-bg text-info" },
  };

  const statCards = [
    {
      label: "Active salons",
      value: activeCount.toLocaleString(),
      sub: null,
      subTone: "text-success",
    },
    {
      label: "On trial",
      value: trialingCount.toLocaleString(),
      sub: null,
      subTone: "text-muted-foreground",
    },
    {
      label: "Past due",
      value: pastDueCount.toLocaleString(),
      valueTone: pastDueCount > 0 ? "text-destructive" : undefined,
      sub: "Billing retry in progress",
      subTone: "text-muted-foreground",
    },
    {
      label: "MRR (NGN + GHS)",
      value: `${formatCompactMoney(mrrByCurrency.NGN, "NGN")} + ${formatCompactMoney(mrrByCurrency.GHS, "GHS")}`,
      sub: null,
      subTone: "text-success",
    },
  ];

  const backofficeUserById = new Map((backofficeUsers || []).map((u) => [u.user_id, u]));

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">Everything that needs a human, in one place.</p>
        </div>

        {needsAttentionItems.length > 0 && (
          <div className="backoffice-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-[22px] py-[18px]">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">Needs attention</span>
                <span className="rounded-full bg-destructive-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-destructive">
                  {needsAttentionItems.length} open
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Pulled from every module below — nothing to hunt for</span>
            </div>
            <div className="flex flex-col">
              {needsAttentionItems.map((item, index) => {
                const tone = toneClasses[item.tone];
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    className={`flex items-center gap-3.5 px-[22px] py-3.5 hover:bg-muted/50 ${index < needsAttentionItems.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${tone.iconWrap}`}>
                      <item.icon className={`h-4 w-4 ${tone.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${tone.chip}`}>{item.chip}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <div key={stat.label} className="backoffice-panel p-[18px]">
              <div className="text-xs font-semibold text-muted-foreground">{stat.label}</div>
              <div className={`mt-1.5 text-[26px] font-bold tabular-nums ${stat.valueTone || ""}`}>{stat.value}</div>
              {stat.sub && <div className={`mt-1 text-[11.5px] font-semibold ${stat.subTone}`}>{stat.sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="backoffice-panel p-5">
            <div className="mb-3.5 text-[13.5px] font-bold">Tenant growth — last 6 months</div>
            <ChartContainer config={growthChartConfig} className="h-[130px] w-full">
              <BarChart data={growthSeries}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                  {growthSeries.map((_, index) => (
                    <Cell
                      key={index}
                      fill={index === growthSeries.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.18)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          <div className="backoffice-panel p-5">
            <div className="mb-3.5 text-[13.5px] font-bold">Plan distribution</div>
            <div className="flex flex-col gap-3">
              {planSeries.map((p) => (
                <div key={p.plan}>
                  <div className="mb-[5px] flex justify-between text-[12.5px]">
                    <span>{p.plan}</span>
                    <span className="tabular-nums text-muted-foreground">{p.pct}%</span>
                  </div>
                  <div className="h-[7px] rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
              {planSeries.length === 0 && (
                <p className="text-sm text-muted-foreground">No tenants yet.</p>
              )}
            </div>
          </div>
        </div>

        {recentAuditLogs.length > 0 && (
          <div className="backoffice-panel overflow-hidden mb-7">
            <div className="flex items-center justify-between border-b border-border px-[22px] py-4">
              <span className="text-[13.5px] font-bold">Recent admin activity</span>
              <Link to="/audit-logs" className="text-xs font-semibold text-primary">
                View audit log
              </Link>
            </div>
            <div className="flex flex-col">
              {recentAuditLogs.map((log, index) => (
                <div
                  key={log.id}
                  className={`flex items-center gap-3 px-[22px] py-3 text-[13px] ${index < recentAuditLogs.length - 1 ? "border-b border-border" : ""}`}
                >
                  <span className="w-[72px] shrink-0 tabular-nums text-muted-foreground">{timeAgoLabel(log.created_at)}</span>
                  <span className="font-semibold">{adminDisplayName(backofficeUserById.get(log.actor_user_id || ""))}</span>
                  <span className="text-muted-foreground">{formatAuditActionText(log.action, log.entity_type)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CreditCard className="h-3.5 w-3.5" />
          {marketCountries?.length || 0} active markets · {tenants?.length || 0} total tenants
        </div>
      </div>
    </BackofficeLayout>
  );
}
