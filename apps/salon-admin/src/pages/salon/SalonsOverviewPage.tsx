import { useMemo, useState } from "react";
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
  Activity,
  Star,
  AlertCircle,
  Plus,
  Coins,
  CalendarPlus,
  ClockAlert,
  CreditCard,
  MessageSquare,
} from "lucide-react";
import { useSalonsOverview } from "@/hooks/useSalonsOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@shared/currency";
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

type DateRange = "today" | "week" | "month";

export default function SalonsOverviewPage() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
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
  } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { locations, isLoading, error, refetch } = useSalonsOverview(dateRange);
  const activeLocationLabel =
    availableContexts.find((context) => context.type === "location" && context.locationId === activeLocationId)
      ?.label || "Selected branch";

  // Calculate aggregate stats
  const aggregateStats = useMemo(() => {
    if (!locations.length) return null;

    const totalRevenue = locations.reduce((sum, loc) => sum + loc.revenue, 0);
    const totalBookings = locations.reduce((sum, loc) => sum + loc.bookingCount, 0);
    const totalStaffOnline = locations.reduce((sum, loc) => sum + loc.staffOnline, 0);
    const totalOutstanding = locations.reduce((sum, loc) => sum + loc.outstandingAppointments, 0);
    const totalPendingApprovals = locations.reduce((sum, loc) => sum + loc.pendingApprovals, 0);
    const totalUnpaidBalances = locations.reduce((sum, loc) => sum + loc.unpaidBalances, 0);
    const avgSatisfaction = locations.reduce((sum, loc) => sum + (loc.customerSatisfaction || 0), 0) / locations.length;

    const bestPerforming = [...locations].sort((a, b) => b.revenue - a.revenue)[0];
    const worstPerforming = [...locations].sort((a, b) => a.revenue - b.revenue)[0];

    return {
      totalRevenue,
      totalBookings,
      totalStaffOnline,
      totalOutstanding,
      totalPendingApprovals,
      totalUnpaidBalances,
      avgSatisfaction,
      bestPerforming,
      worstPerforming,
      locationCount: locations.length,
    };
  }, [locations]);

  const branchContexts = availableContexts.filter((c) => c.type === "location");

  const handleBranchAction = async (locationId: string, destination: string) => {
    setQuickActionPopover(null);
    await setActiveContext("location", locationId);
    navigate(destination);
  };

  const triggerQuickAction = (actionKey: string, destination: string) => {
    if (branchContexts.length === 1) {
      handleBranchAction(branchContexts[0].locationId!, destination);
    } else {
      setQuickActionPopover(quickActionPopover === actionKey ? null : actionKey);
    }
  };

  const currency = currentTenant?.currency || "USD";
  const canViewRevenueAnalytics =
    currentRole === "owner" || (!permissionsLoading && hasPermission("reports"));
  const canShowPerformanceInsights = (aggregateStats?.totalBookings || 0) >= 6;
  const bestRevenue = aggregateStats?.bestPerforming?.revenue ?? 0;
  const worstRevenue = aggregateStats?.worstPerforming?.revenue ?? 0;
  const bestPerformingLocations = canShowPerformanceInsights
    ? locations.filter((location) => location.revenue === bestRevenue)
    : [];
  const needsAttentionLocations = canShowPerformanceInsights
    ? locations.filter((location) => location.revenue === worstRevenue)
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
            <Button onClick={() => setAddSalonOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Branch</span>
            </Button>
          </div>
        </div>

        {/* Quick Actions — hub context only */}
        {activeContextType === "owner_hub" && branchContexts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
                { key: "new-booking", label: "New Booking", icon: CalendarPlus, destination: "/salon/appointments", count: null as number | null },
                { key: "pending-approvals", label: "Pending Approvals", icon: ClockAlert, destination: "/salon/appointments", count: aggregateStats?.totalPendingApprovals ?? null },
                { key: "unpaid-balances", label: "Unpaid Balances", icon: CreditCard, destination: "/salon/appointments", count: aggregateStats?.totalUnpaidBalances ?? null },
                { key: "messages", label: "Messages", icon: MessageSquare, destination: "/salon/messaging", count: null as number | null },
              ].map(({ key, label, icon: Icon, destination, count }) => {
              const urgent = count !== null && count > 0;
              return (
              <Popover
                key={key}
                open={quickActionPopover === key}
                onOpenChange={(open) => setQuickActionPopover(open ? key : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left hover:bg-accent transition-colors"
                    onClick={() => triggerQuickAction(key, destination)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className={`rounded-md p-2 ${urgent ? "bg-destructive/10" : "bg-muted"}`}>
                        <Icon className={`h-4 w-4 ${urgent ? "text-destructive" : "text-muted-foreground"}`} />
                      </div>
                      {count !== null && count > 0 && (
                        <span className="text-xs font-semibold tabular-nums rounded-full bg-destructive text-destructive-foreground px-2 py-0.5">
                          {count}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium leading-tight">{label}</span>
                  </button>
                </PopoverTrigger>
                {branchContexts.length > 1 && (
                  <PopoverContent className="w-52 p-1" align="start">
                    <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Select branch</p>
                    {branchContexts.map((ctx) => (
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
                {canViewRevenueAnalytics && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        Total Inflow
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(aggregateStats.totalRevenue, currency)}
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
                              {formatCurrency(aggregateStats.bestPerforming.revenue, currency)} inflow
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
                              {formatCurrency(aggregateStats.worstPerforming.revenue, currency)} inflow
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
                {locations.length === 0 ? (
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
                            <TableHead className="text-right">Inflow</TableHead>
                          )}
                          <TableHead className="text-right hidden sm:table-cell">Bookings</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Staff Online</TableHead>
                          <TableHead className="text-right hidden lg:table-cell">Outstanding</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locations.map((location) => (
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
                              {formatCurrency(location.revenue, currency)}
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
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{selectedInsightLocation.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(selectedInsightLocation.revenue, currency)}
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
      </div>
    </SalonSidebar>
  );
}
