import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, DollarSign, TrendingUp, Clock, AlertCircle } from "lucide-react";

const stats = [
  {
    title: "Today's Appointments",
    value: "8",
    change: "+2 from yesterday",
    icon: Calendar,
    trend: "up",
  },
  {
    title: "Total Customers",
    value: "124",
    change: "+12 this month",
    icon: Users,
    trend: "up",
  },
  {
    title: "Revenue Today",
    value: "$580",
    change: "+15% vs avg",
    icon: DollarSign,
    trend: "up",
  },
  {
    title: "Avg Service Time",
    value: "45m",
    change: "On target",
    icon: Clock,
    trend: "neutral",
  },
];

const upcomingAppointments = [
  { time: "09:00 AM", customer: "Sarah Johnson", service: "Hair Cut & Style", status: "confirmed" },
  { time: "10:30 AM", customer: "Mike Chen", service: "Beard Trim", status: "confirmed" },
  { time: "11:00 AM", customer: "Emily Davis", service: "Color Treatment", status: "pending" },
  { time: "02:00 PM", customer: "Alex Turner", service: "Full Service", status: "confirmed" },
];

export default function SalonDashboard() {
  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
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
          {stats.map((stat) => {
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
            <div className="space-y-3">
              {upcomingAppointments.map((apt, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-primary">{apt.time}</div>
                    <div>
                      <p className="font-medium">{apt.customer}</p>
                      <p className="text-sm text-muted-foreground">{apt.service}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      apt.status === "confirmed"
                        ? "bg-success/10 text-success"
                        : "bg-warning-bg text-warning-foreground"
                    }`}
                  >
                    {apt.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SalonSidebar>
  );
}
