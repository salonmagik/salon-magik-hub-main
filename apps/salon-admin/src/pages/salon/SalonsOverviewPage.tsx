import { useEffect, useMemo, useState } from "react";
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
  ArrowUpRight,
  ChevronRight,
  Activity,
  Star,
  AlertCircle,
  Plus,
  Coins,
} from "lucide-react";
import { useSalonsOverview, type LocationPerformance } from "@/hooks/useSalonsOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@shared/currency";
import { Link } from "react-router-dom";
import { AddSalonDialog } from "@/components/dialogs/AddSalonDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { toast } from "@ui/ui/use-toast";

type DateRange = "today" | "week" | "month";

export default function SalonsOverviewPage() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [addSalonOpen, setAddSalonOpen] = useState(false);
  const [insightDialogType, setInsightDialogType] = useState<"best" | "attention" | null>(null);
  const [insightLocationId, setInsightLocationId] = useState<string | null>(null);
  const [selectedCompareLocationIds, setSelectedCompareLocationIds] = useState<string[]>([]);
  const { currentTenant, currentRole, activeContextType, activeLocationId, availableContexts } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { locations, isLoading, error, refetch } = useSalonsOverview(dateRange);
  const activeLocationLabel =
    availableContexts.find((context) => context.type === "location" && context.locationId === activeLocationId)
      ?.label || "Selected location";

  // Calculate aggregate stats
  const aggregateStats = useMemo(() => {
    if (!locations.length) return null;

    const totalRevenue = locations.reduce((sum, loc) => sum + loc.revenue, 0);
    const totalBookings = locations.reduce((sum, loc) => sum + loc.bookingCount, 0);
    const totalStaffOnline = locations.reduce((sum, loc) => sum + loc.staffOnline, 0);
    const totalOutstanding = locations.reduce((sum, loc) => sum + loc.outstandingAppointments, 0);
    const avgSatisfaction = locations.reduce((sum, loc) => sum + (loc.customerSatisfaction || 0), 0) / locations.length;

    const bestPerforming = [...locations].sort((a, b) => b.revenue - a.revenue)[0];
    const worstPerforming = [...locations].sort((a, b) => a.revenue - b.revenue)[0];

    return {
      totalRevenue,
      totalBookings,
      totalStaffOnline,
      totalOutstanding,
      avgSatisfaction,
      bestPerforming,
      worstPerforming,
      locationCount: locations.length,
    };
  }, [locations]);

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
  const selectedCompareLocations = locations.filter((location) =>
    selectedCompareLocationIds.includes(location.id)
  );

  useEffect(() => {
    if (!locations.length) {
      setSelectedCompareLocationIds([]);
      return;
    }
    setSelectedCompareLocationIds((prev) => {
      const validIds = prev.filter((id) => locations.some((location) => location.id === id));
      if (validIds.length > 0) return validIds.slice(0, 3);
      return locations.slice(0, Math.min(3, locations.length)).map((location) => location.id);
    });
  }, [locations]);

  const toggleCompareLocation = (locationId: string) => {
    setSelectedCompareLocationIds((prev) => {
      if (prev.includes(locationId)) {
        return prev.filter((id) => id !== locationId);
      }
      if (prev.length >= 3) {
        toast({
          title: "Comparison limit reached",
          description: "You can compare up to 3 salons at a time.",
        });
        return prev;
      }
      return [...prev, locationId];
    });
  };

  const compareLeader = useMemo(() => {
    if (!selectedCompareLocations.length) return null;
    return [...selectedCompareLocations].sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.bookingCount - a.bookingCount;
    })[0];
  }, [selectedCompareLocations]);

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
              Salons Overview
            </h1>
            <p className="text-muted-foreground">
              {activeContextType === "owner_hub"
                ? "Hub-level overview for your accessible salons"
                : `Location-scoped overview for ${activeLocationLabel}`}
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
              <span className="hidden sm:inline">Add Salon</span>
            </Button>
          </div>
        </div>

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
                There was an error loading your salon data
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
                      Locations
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
                        Total Revenue
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
                              {formatCurrency(aggregateStats.bestPerforming.revenue, currency)} revenue
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
                              {formatCurrency(aggregateStats.worstPerforming.revenue, currency)} revenue
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

            {canViewRevenueAnalytics &&
              activeContextType === "owner_hub" &&
              aggregateStats &&
              aggregateStats.locationCount > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Compare Salon Health</CardTitle>
                  <CardDescription>
                    Select up to 3 salons to compare transactions and bookings in this period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {locations.map((location) => {
                      const isSelected = selectedCompareLocationIds.includes(location.id);
                      const selectionCapReached = selectedCompareLocationIds.length >= 3 && !isSelected;
                      return (
                        <Button
                          key={location.id}
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => toggleCompareLocation(location.id)}
                          disabled={selectionCapReached}
                        >
                          {location.name}
                        </Button>
                      );
                    })}
                  </div>

                  {selectedCompareLocations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Select at least one salon to compare health metrics.
                    </p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Salon</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Bookings</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Staff Online</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedCompareLocations.map((location) => (
                            <TableRow key={location.id}>
                              <TableCell>{location.name}</TableCell>
                              <TableCell className="text-right">{formatCurrency(location.revenue, currency)}</TableCell>
                              <TableCell className="text-right">{location.bookingCount}</TableCell>
                              <TableCell className="text-right">{location.outstandingAppointments}</TableCell>
                              <TableCell className="text-right">{location.staffOnline}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {compareLeader && (
                        <p className="text-sm text-muted-foreground">
                          Current leader in selection:{" "}
                          <span className="font-medium text-foreground">{compareLeader.name}</span>
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Location Breakdown Table */}
            <Card>
              <CardHeader>
                <CardTitle>Location Performance</CardTitle>
                <CardDescription>
                  Detailed metrics for each salon location
                </CardDescription>
              </CardHeader>
              <CardContent>
                {locations.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-medium mb-1">No locations found</h3>
                    <p className="text-sm text-muted-foreground">
                      Add locations to see performance data
                    </p>
                  </div>
                ) : (
                  <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          {canViewRevenueAnalytics && (
                            <TableHead className="text-right">Revenue</TableHead>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8">
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

        {/* Add Salon Dialog */}
        <Dialog
          open={canViewRevenueAnalytics && Boolean(insightDialogType)}
          onOpenChange={(open) => !open && setInsightDialogType(null)}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {insightDialogType === "best" ? "Best Performing Salons" : "Salons Needing Attention"}
              </DialogTitle>
              <DialogDescription>
                Review location-level transaction performance for this period.
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
                      <TableHead>Location</TableHead>
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
          onSuccess={() => refetch()}
        />
      </div>
    </SalonSidebar>
  );
}
