import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import {
  Calendar,
  Users,
  Coins,
  TrendingUp,
  Clock,
  AlertCircle,
  Check,
  X,
  Wallet,
  RefreshCcw,
  MessageSquare,
  Lightbulb,
  Star,
  ChevronRight,
  Bell,
  CreditCard,
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@ui/skeleton";
import { Badge } from "@ui/badge";
import { Progress } from "@ui/progress";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";

const statusStyles: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-muted", text: "text-muted-foreground" },
  started: { bg: "bg-primary/10", text: "text-primary" },
  paused: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  completed: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive" },
};

const activityIcons: Record<string, typeof Calendar> = {
  payment: CreditCard,
  refund: RefreshCcw,
  appointment: Calendar,
  system: Bell,
};

export default function SalonDashboard() {
  const navigate = useNavigate();
  const { currentTenant, profile, currentRole } = useAuth();
  const {
    stats,
    upcomingAppointments,
    checklistItems,
    checklistProgress,
    isChecklistComplete,
    insights,
    recentActivity,
    isLoading,
  } = useDashboardStats();
  const { data: chainUnlockRequest } = useQuery({
    queryKey: ["dashboard-chain-unlock-request", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id || String(currentTenant.plan || "").toLowerCase() !== "chain") return null;
      const { data, error } = await (supabase
        .from("tenant_chain_unlock_requests" as any)
        .select("requested_locations, allowed_locations, status")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);
      if (error) throw error;
      return data || null;
    },
    enabled: Boolean(currentTenant?.id),
  });

  const statCards = [
    {
      title: "Today's Appointments",
      value: stats.todayAppointments.toString(),
      change: `${stats.confirmedCount} scheduled`,
      icon: Calendar,
      trend: "neutral",
    },
    {
      title: "Outstanding Fees",
      value: `${currentTenant?.currency || "USD"} ${stats.outstandingFees.toFixed(2)}`,
      change: "From customers",
      icon: Coins,
      trend: stats.outstandingFees > 0 ? "down" : "neutral",
    },
    {
      title: "Purse Balance",
      value: `${currentTenant?.currency || "USD"} ${stats.purseUsage.toFixed(2)}`,
      change: "Customer wallets",
      icon: Wallet,
      trend: "neutral",
    },
    {
      title: "Refunds Pending",
      value: stats.refundsPendingApproval.toString(),
      change: "Awaiting approval",
      icon: RefreshCcw,
      trend: stats.refundsPendingApproval > 0 ? "down" : "neutral",
    },
  ];

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! Here's what's happening
            today.
          </p>
        </div>

        {/* Onboarding Checklist Card - Only show if not complete */}
        {!isChecklistComplete && (currentRole === "owner" || currentRole === "manager") && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium mb-1">Complete your salon setup</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Finish setting up your salon to unlock all features. {checklistProgress}% complete.
                  </p>
                  <Progress value={checklistProgress} className="h-2 mb-3" />
                  <div className="flex flex-wrap gap-2">
                    {checklistItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => !item.completed && navigate(item.href)}
                        disabled={item.completed}
                        className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                          item.completed
                            ? "bg-success/10 text-success cursor-default"
                            : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
                        }`}
                      >
                        {item.completed ? <Check className="w-3 h-3" /> : <span>○</span>}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {chainUnlockRequest && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-amber-900">Chain expansion pending approval</h3>
                  <p className="text-sm text-amber-800">
                    You requested {chainUnlockRequest.requested_locations} stores. {chainUnlockRequest.allowed_locations} are currently active.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate("/salon/overview")}>
                  View salons
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
                            {stat.trend === "down" && <TrendingUp className="w-3 h-3 text-destructive rotate-180" />}
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

        {/* Insights Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : insights.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface border"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {insight.icon === "calendar" ? (
                        <Calendar className="w-5 h-5 text-primary" />
                      ) : (
                        <Star className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{insight.title}</p>
                      <p className="font-medium">{insight.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Lightbulb className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Keep going! Insights will appear once you have more appointment history.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Communication Credits Warning */}
        {stats.lowCommunicationCredits && (
          <Card className="border-warning bg-warning-bg/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-warning-foreground" />
                  <div>
                    <p className="font-medium text-warning-foreground">Low messaging credits</p>
                    <p className="text-sm text-muted-foreground">
                      {stats.communicationCredits} credits remaining. Top up to continue sending SMS/WhatsApp.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/salon/settings?tab=subscription")}
                >
                  Top Up
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Appointments */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-medium">Today's Appointments</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/salon/appointments")}
                  className="text-primary"
                >
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
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

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-medium">Recent Activity</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/salon/journal")}
                  className="text-primary"
                >
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 p-2">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => {
                    const ActivityIcon = activityIcons[activity.type] || Bell;
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <ActivityIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{activity.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SalonSidebar>
  );
}
