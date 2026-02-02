import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, DollarSign, TrendingUp, Clock, AlertCircle, Check, X } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-muted", text: "text-muted-foreground" },
  started: { bg: "bg-primary/10", text: "text-primary" },
  paused: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  completed: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive" },
};

export default function SalonDashboard() {
  const { currentTenant, profile } = useAuth();
  const { stats, upcomingAppointments, isLoading } = useDashboardStats();

  const statCards = [
    {
      title: "Today's Appointments",
      value: stats.todayAppointments.toString(),
      change: `${stats.confirmedCount} scheduled`,
      icon: Calendar,
      trend: "up",
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers.toString(),
      change: "All time",
      icon: Users,
      trend: "up",
    },
    {
      title: "Revenue Today",
      value: `${currentTenant?.currency || "USD"} ${stats.revenueToday.toFixed(2)}`,
      change: `${stats.completedCount} completed`,
      icon: DollarSign,
      trend: stats.revenueToday > 0 ? "up" : "neutral",
    },
    {
      title: "Cancelled / No-show",
      value: stats.cancelledCount.toString(),
      change: "Today",
      icon: X,
      trend: stats.cancelledCount === 0 ? "neutral" : "down",
    },
  ];

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! Here's what's happening today.
          </p>
        </div>

        {/* Onboarding Checklist Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-1">Complete your salon setup</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Finish setting up your salon to unlock all features. 40% complete.
                </p>
                <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: "40%" }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-success/10 text-success px-2 py-1 rounded">✓ Add services</span>
                  <span className="text-xs bg-success/10 text-success px-2 py-1 rounded">✓ Add products</span>
                  <span className="text-xs bg-warning-bg text-warning-foreground px-2 py-1 rounded">○ Configure payments</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">○ Enable booking</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16 mb-1" />
                    <Skeleton className="h-3 w-20" />
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
                            {stat.trend === "up" && <TrendingUp className="w-3 h-3 text-success" />}
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

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium">Today's Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-4 w-16" />
                      <div>
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No appointments scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium text-primary">{apt.time}</div>
                      <div>
                        <p className="font-medium">{apt.customer}</p>
                        <p className="text-sm text-muted-foreground">{apt.service}</p>
                      </div>
                    </div>
                    <Badge
                      className={`${statusStyles[apt.status]?.bg || "bg-muted"} ${statusStyles[apt.status]?.text || "text-muted-foreground"} capitalize`}
                    >
                      {apt.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SalonSidebar>
  );
}
