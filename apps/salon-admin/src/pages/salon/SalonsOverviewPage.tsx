import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLoader } from "@/components/BrandLoader";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/card";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Progress } from "@ui/progress";
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
  Building2,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  MapPin,
  Clock,
  ChevronRight,
  ChevronDown,
  Activity,
  Star,
  AlertCircle,
  Plus,
  Coins,
  CalendarPlus,
  ClockAlert,
  CreditCard,
  MessageSquare,
  PauseCircle,
  Info,
} from "lucide-react";
import { useSalonsOverview } from "@/hooks/useSalonsOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@shared/currency";
import { countryName } from "@/lib/countryCurrency";
import { Link, useNavigate } from "react-router-dom";
import { AddSalonDialog } from "@/components/dialogs/AddSalonDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";

type DateRange = "today" | "week" | "month";

export default function SalonsOverviewPage() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [addSalonOpen, setAddSalonOpen] = useState(false);
  const [insightDialogType, setInsightDialogType] = useState<"best" | "attention" | null>(null);
  const [insightLocationId, setInsightLocationId] = useState<string | null>(null);
  const [quickActionPopover, setQuickActionPopover] = useState<string | null>(null);
  const navigate = useNavigate();
  const {
    currentTenant,
    currentRole,
    activeContextType,
    activeLocationId,
    availableContexts,
    refreshTenants,
    setActiveContext,
    canUseOwnerHub,
  } = useAuth();

  // Restore hub context when navigating here from a branch context.
  // Must depend on canUseOwnerHub + activeContextType so it re-fires once auth
  // finishes loading (canUseOwnerHub starts false during the initial auth hydration).
  // The ref prevents calling setActiveContext more than once per mount cycle.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current && canUseOwnerHub && activeContextType !== "owner_hub") {
      restoredRef.current = true;
      void setActiveContext("owner_hub", null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseOwnerHub, activeContextType]);

  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { locations, isLoading, error, refetch } = useSalonsOverview(dateRange);
  const activeLocationLabel =
    availableContexts.find((context) => context.type === "location" && context.locationId === activeLocationId)
      ?.label || "Selected branch";

  // Chain tenants can span more than one country/currency. The page always
  // shows exactly one country's worth of branches — no combined "all
  // countries" view, since revenue in different currencies can't be summed
  // or ranked together. The switcher only appears when there's actually
  // more than one country to switch between; single-country tenants (almost
  // everyone) see no change.
  const availableCountries = useMemo(
    () => Array.from(new Set(locations.map((loc) => loc.country))).sort(),
    [locations]
  );
  const effectiveCountry = availableCountries.includes(selectedCountry)
    ? selectedCountry
    : (currentTenant?.country && availableCountries.includes(currentTenant.country) ? currentTenant.country : availableCountries[0]) || "";

  const filteredLocations = useMemo(
    () => (effectiveCountry ? locations.filter((loc) => loc.country === effectiveCountry) : locations),
    [locations, effectiveCountry]
  );

  // Calculate aggregate stats — always within the single selected country,
  // so revenue is always one currency, never summed/ranked across two.
  const aggregateStats = useMemo(() => {
    if (!filteredLocations.length) return null;

    const totalRevenue = filteredLocations.reduce((sum, loc) => sum + loc.revenue, 0);
    const totalBookings = filteredLocations.reduce((sum, loc) => sum + loc.bookingCount, 0);
    const totalStaffOnline = filteredLocations.reduce((sum, loc) => sum + loc.staffOnline, 0);
    const totalOutstanding = filteredLocations.reduce((sum, loc) => sum + loc.outstandingAppointments, 0);
    const totalPendingApprovals = filteredLocations.reduce((sum, loc) => sum + loc.pendingApprovals, 0);
    const totalUnpaidBalances = filteredLocations.reduce((sum, loc) => sum + loc.unpaidBalances, 0);
    const avgSatisfaction =
      filteredLocations.reduce((sum, loc) => sum + (loc.customerSatisfaction || 0), 0) / filteredLocations.length;

    const revenueCurrency = filteredLocations[0]?.currency ?? currentTenant?.currency ?? "USD";
    const bestPerforming = [...filteredLocations].sort((a, b) => b.revenue - a.revenue)[0];
    const worstPerforming = [...filteredLocations].sort((a, b) => a.revenue - b.revenue)[0];

    return {
      totalRevenue,
      revenueCurrency,
      totalBookings,
      totalStaffOnline,
      totalOutstanding,
      totalPendingApprovals,
      totalUnpaidBalances,
      avgSatisfaction,
      bestPerforming,
      worstPerforming,
      locationCount: filteredLocations.length,
    };
  }, [filteredLocations, currentTenant?.currency]);

  const branchContexts = availableContexts.filter((c) => c.type === "location");
  const pausedBranchCount = branchContexts.filter((c) => c.isPaused).length;

  // Map locations by id for per-action branch filtering
  const locationById = useMemo(() => {
    const map = new Map<string, typeof locations[0]>();
    for (const loc of locations) map.set(loc.id, loc);
    return map;
  }, [locations]);

  // All hooks above — safe to return early now.
  // Prevents branch-scoped overview flashing before the hub context resolves.
  if (canUseOwnerHub && activeContextType !== "owner_hub") {
    return <BrandLoader fullScreen />;
  }

  const getBranchesForAction = (key: string) => {
    if (key === "pending-approvals") {
      return branchContexts.filter((ctx) => {
        const loc = locationById.get(ctx.locationId!);
        return loc && loc.pendingApprovals > 0;
      });
    }
    if (key === "unpaid-balances") {
      return branchContexts.filter((ctx) => {
        const loc = locationById.get(ctx.locationId!);
        return loc && loc.unpaidBalances > 0;
      });
    }
    return branchContexts;
  };

  const handleBranchAction = async (locationId: string, destination: string) => {
    setQuickActionPopover(null);
    await setActiveContext("location", locationId);
    navigate(destination);
  };

  const triggerQuickAction = (actionKey: string, destination: string) => {
    const filtered = getBranchesForAction(actionKey);
    if (filtered.length === 1) {
      handleBranchAction(filtered[0].locationId!, destination);
    } else {
      setQuickActionPopover(quickActionPopover === actionKey ? null : actionKey);
    }
  };

  const canViewRevenueAnalytics =
    currentRole === "owner" || (!permissionsLoading && hasPermission("reports"));
  const canShowPerformanceInsights = (aggregateStats?.totalBookings || 0) >= 6;
  const bestRevenue = aggregateStats?.bestPerforming?.revenue ?? 0;
  const worstRevenue = aggregateStats?.worstPerforming?.revenue ?? 0;
  const bestPerformingLocations = canShowPerformanceInsights
    ? filteredLocations.filter((location) => location.revenue === bestRevenue)
    : [];
  const needsAttentionLocations = canShowPerformanceInsights
    ? filteredLocations.filter((location) => location.revenue === worstRevenue)
    : [];
  const insightLocations = insightDialogType === "best" ? bestPerformingLocations : needsAttentionLocations;
  const selectedInsightLocation =
    insightLocations.find((location) => location.id === insightLocationId) || insightLocations[0] || null;

  if (!currentTenant) {
    return (
      <SalonSidebar>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </SalonSidebar>
    );
  }

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Business Overview
            </h1>
            <p className="text-muted-foreground">
              {activeContextType === "owner_hub"
                ? "Track how your branches are performing across bookings, revenue, and staffing."
                : `Branch-scoped overview for ${activeLocationLabel}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {availableCountries.length > 1 && (
              <Select value={effectiveCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCountries.map((c) => (
                    <SelectItem key={c} value={c}>
                      {countryName(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddSalonOpen(true)} className="hidden lg:flex gap-2">
              <Plus className="w-4 h-4" />
              Add Branch
            </Button>
          </div>
        </div>

        {/* Quick Actions — hub context only */}
        {activeContextType === "owner_hub" && branchContexts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
                { key: "new-booking", label: "New Booking", icon: CalendarPlus, destination: "/salon/appointments", count: null as number | null, description: null as string | null },
                { key: "pending-approvals", label: "Pending Approvals", icon: ClockAlert, destination: "/salon/appointments?approvalAction=review", count: aggregateStats?.totalPendingApprovals ?? null, description: "Appointments awaiting your approval or reschedule response — this count always reflects the current backlog, not the date range selected above." },
                { key: "unpaid-balances", label: "Unpaid Balances", icon: CreditCard, destination: "/salon/appointments?tab=unscheduled&payment=unpaid", count: aggregateStats?.totalUnpaidBalances ?? null, description: "Appointments not yet fully paid or refunded — this count always reflects the current backlog, not the date range selected above." },
                { key: "messages", label: "Messages", icon: MessageSquare, destination: "/salon/messaging", count: null as number | null, description: null as string | null },
              ].map(({ key, label, icon: Icon, destination, count, description }) => {
              const urgent = count !== null && count > 0;
              const filteredBranches = getBranchesForAction(key);
              return (
              <Popover
                key={key}
                open={quickActionPopover === key}
                onOpenChange={(open) => setQuickActionPopover(open ? key : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="group flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-all hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                    onClick={() => triggerQuickAction(key, destination)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className={`rounded-md p-2 ${urgent ? "bg-destructive/10" : "bg-muted group-hover:bg-blue-100/60 dark:group-hover:bg-blue-900/30 transition-colors"}`}>
                        <Icon className={`h-4 w-4 ${urgent ? "text-destructive" : "text-muted-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"}`} />
                      </div>
                      {count !== null && count > 0 && (
                        <span className="text-xs font-semibold tabular-nums rounded-full bg-destructive text-destructive-foreground px-2 py-0.5">
                          {count}
                        </span>
                      )}
                    </div>
                    <div className="flex w-full items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span className="text-sm font-medium leading-tight">{label}</span>
                        {description && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                              {description}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                      {filteredBranches.length > 1 && (
                        <ChevronDown className="h-3.5 w-3.5 text-blue-500/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </button>
                </PopoverTrigger>
                {filteredBranches.length > 1 && (
                  <PopoverContent className="w-52 p-1" align="start">
                    <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Select branch</p>
                    {filteredBranches.map((ctx) => (
                      <button
                        key={ctx.locationId}
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => handleBranchAction(ctx.locationId!, destination)}
                      >
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {ctx.label}
                      </button>
                    ))}
                    {filteredBranches.length === 0 && (
                      <p className="px-2 py-2 text-xs text-muted-foreground">
                        No branches with {label.toLowerCase()} right now.
                      </p>
                    )}
                  </PopoverContent>
                )}
              </Popover>
            );
          })}
          </div>

        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
              <h3 className="font-medium mb-2">Failed to load data</h3>
              <p className="text-sm text-muted-foreground mb-4">
                There was an error loading your branch data
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Stats */}
            {aggregateStats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      Branches
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{aggregateStats.locationCount}</div>
                  </CardContent>
                </Card>
                {currentRole === "owner" && pausedBranchCount > 0 && (
                  <Card className="border-orange-200 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
                        <PauseCircle className="w-3 h-3" />
                        Paused Branches
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{pausedBranchCount}</div>
                      <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">Tap a paused branch to revive it</p>
                    </CardContent>
                  </Card>
                )}
                {canViewRevenueAnalytics && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        Total Inflow
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 cursor-default" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            Completed payments across all branches in the selected date range.
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(aggregateStats.totalRevenue, aggregateStats.revenueCurrency)}
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Bookings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{aggregateStats.totalBookings}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Staff Online
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Staff currently clocked in, across all branches.
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-success">
                      {aggregateStats.totalStaffOnline}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Outstanding
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Appointments that are scheduled, started, or paused — not yet completed or cancelled.
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-warning-foreground">
                      {aggregateStats.totalOutstanding}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Best & Worst Performers */}
            {canViewRevenueAnalytics && aggregateStats && aggregateStats.locationCount > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-success/30 bg-success/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-success flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Best Performing
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Branch with the highest inflow this period.
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {canShowPerformanceInsights ? (
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setInsightDialogType("best");
                          setInsightLocationId(bestPerformingLocations[0]?.id || null);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-lg">{aggregateStats.bestPerforming.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(aggregateStats.bestPerforming.revenue, aggregateStats.revenueCurrency)} inflow
                            </p>
                          </div>
                          <Badge variant="secondary" className="bg-success/10 text-success">
                            <Star className="w-3 h-3 mr-1" />
                            Top
                          </Badge>
                        </div>
                      </button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Not enough data yet. At least 6 transactions are required.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-warning/30 bg-warning/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-warning-foreground flex items-center gap-2">
                      <TrendingDown className="w-4 h-4" />
                      Needs Attention
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Branch with the lowest inflow this period — not necessarily a problem, just the one worth a closer look.
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {canShowPerformanceInsights ? (
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setInsightDialogType("attention");
                          setInsightLocationId(needsAttentionLocations[0]?.id || null);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-lg">{aggregateStats.worstPerforming.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(aggregateStats.worstPerforming.revenue, aggregateStats.revenueCurrency)} inflow
                            </p>
                          </div>
                          <Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
                            <Activity className="w-3 h-3 mr-1" />
                            Review
                          </Badge>
                        </div>
                      </button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Not enough data yet. At least 6 transactions are required.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Branch Breakdown Table */}
            <Card>
              <CardHeader>
                <CardTitle>Branch Performance</CardTitle>
                <CardDescription>
                  Detailed metrics for each branch
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredLocations.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-medium mb-1">No branches found</h3>
                    <p className="text-sm text-muted-foreground">
                      Add branches to see performance data
                    </p>
                  </div>
                ) : (
                  <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Branches</TableHead>
                          {canViewRevenueAnalytics && (
                            <TableHead className="text-right">
                              <span className="inline-flex items-center justify-end gap-1">
                                Inflow
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3 w-3 cursor-default" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-56 text-xs">
                                    Completed payments across all branches in the selected date range.
                                  </TooltipContent>
                                </Tooltip>
                              </span>
                            </TableHead>
                          )}
                          <TableHead className="text-right hidden sm:table-cell">Bookings</TableHead>
                          <TableHead className="text-right hidden md:table-cell">
                            <span className="inline-flex items-center justify-end gap-1">
                              Staff Online
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 cursor-default" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-56 text-xs">
                                  Staff currently clocked in at that branch.
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </TableHead>
                          <TableHead className="text-right hidden lg:table-cell">
                            <span className="inline-flex items-center justify-end gap-1">
                              Outstanding
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 cursor-default" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-56 text-xs">
                                  Appointments that are scheduled, started, or paused — not yet completed or cancelled.
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLocations.map((location) => (
                        <TableRow key={location.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{location.name}</p>
                                <p className="text-xs text-muted-foreground">{location.city}</p>
                              </div>
                            </div>
                          </TableCell>
                          {canViewRevenueAnalytics && (
                            <TableCell className="text-right font-medium">
                              {formatCurrency(location.revenue, location.currency)}
                            </TableCell>
                          )}
                          <TableCell className="text-right hidden sm:table-cell">
                            {location.bookingCount}
                          </TableCell>
                          <TableCell className="text-right hidden md:table-cell">
                            <Badge variant={location.staffOnline > 0 ? "secondary" : "outline"}>
                              {location.staffOnline}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right hidden lg:table-cell">
                            {location.outstandingAppointments > 0 ? (
                              <Badge variant="destructive">{location.outstandingAppointments}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={`View ${location.name} reports`}
                              onClick={async () => {
                                await setActiveContext("location", location.id);
                                navigate("/salon/reports");
                              }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Performance Insights Dialog */}
        <Dialog
          open={canViewRevenueAnalytics && Boolean(insightDialogType)}
          onOpenChange={(open) => !open && setInsightDialogType(null)}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {insightDialogType === "best" ? "Best Performing Branches" : "Branches Needing Attention"}
              </DialogTitle>
              <DialogDescription>
                Review branch-level transaction performance for this period.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {insightLocations.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {insightLocations.map((location) => (
                    <Button
                      key={location.id}
                      size="sm"
                      variant={selectedInsightLocation?.id === location.id ? "default" : "outline"}
                      onClick={() => setInsightLocationId(location.id)}
                    >
                      {location.name}
                    </Button>
                  ))}
                </div>
              )}

              {selectedInsightLocation ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center justify-end gap-1">
                          Outstanding
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 cursor-default" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                              Appointments that are scheduled, started, or paused — not yet completed or cancelled.
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{selectedInsightLocation.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(selectedInsightLocation.revenue, selectedInsightLocation.currency)}
                      </TableCell>
                      <TableCell className="text-right">{selectedInsightLocation.bookingCount}</TableCell>
                      <TableCell className="text-right">{selectedInsightLocation.outstandingAppointments}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No data available.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AddSalonDialog
          open={addSalonOpen}
          onOpenChange={setAddSalonOpen}
          onSuccess={async () => {
            await Promise.all([refetch(), refreshTenants()]);
          }}
        />

        {/* Floating action button — mobile & tablet only */}
        <button
          type="button"
          aria-label="Add branch"
          onClick={() => setAddSalonOpen(true)}
          className="lg:hidden fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </SalonSidebar>
  );
}
