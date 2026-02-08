import { useState, useMemo } from "react";
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
  DollarSign,
  MapPin,
  Clock,
  ArrowUpRight,
  ChevronRight,
  Activity,
  Star,
  AlertCircle,
  Plus,
} from "lucide-react";
import { useSalonsOverview, type LocationPerformance } from "@/hooks/useSalonsOverview";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@shared/currency";
import { Link } from "react-router-dom";
import { AddSalonDialog } from "@/components/dialogs/AddSalonDialog";

type DateRange = "today" | "week" | "month";

export default function SalonsOverviewPage() {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [addSalonOpen, setAddSalonOpen] = useState(false);
  const { currentTenant } = useAuth();
  const { locations, isLoading, error, refetch } = useSalonsOverview(dateRange);

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
              Multi-location performance dashboard for your salon chain
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
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Total Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(aggregateStats.totalRevenue, currency)}
                    </div>
                  </CardContent>
                </Card>
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
            {aggregateStats && aggregateStats.locationCount > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-success/30 bg-success/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-success flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Best Performing
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              </div>
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
                        <TableHead className="text-right">Revenue</TableHead>
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
                          <TableCell className="text-right font-medium">
                            {formatCurrency(location.revenue, currency)}
                          </TableCell>
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
        <AddSalonDialog 
          open={addSalonOpen} 
          onOpenChange={setAddSalonOpen} 
          onSuccess={() => refetch()}
        />
      </div>
    </SalonSidebar>
  );
}
