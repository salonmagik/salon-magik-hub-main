import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent } from "@ui/card";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { Bell, Calendar, CreditCard, UserPlus, Settings, CheckCheck } from "lucide-react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@shared/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const getIcon = (type: Notification["type"]) => {
  switch (type) {
    case "appointment": return Calendar;
    case "payment": return CreditCard;
    case "customer": return UserPlus;
    case "system": return Settings;
    default: return Bell;
  }
};

const getIconColor = (type: Notification["type"]) => {
  switch (type) {
    case "appointment": return "text-primary bg-primary/10";
    case "payment": return "text-success bg-success/10";
    case "customer": return "text-purple-600 bg-purple-50";
    default: return "text-muted-foreground bg-muted";
  }
};

type FilterType = "all" | "unread" | "urgent";

export default function AllNotificationsPage() {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications();
  const { activeContextType, setActiveContext, assignedLocationIds } = useAuth();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "urgent") return n.urgent;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const switchToLocationIfNeeded = async () => {
    if (activeContextType !== "owner_hub") return;
    const targetLocation = assignedLocationIds[0] ?? null;
    if (targetLocation) await setActiveContext("location", targetLocation);
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markAsRead(n.id);
    if (n.type === "appointment" && n.entity_id) {
      await switchToLocationIfNeeded();
      navigate(`/salon/appointments?appointmentId=${n.entity_id}&open=details`);
    } else if (n.type === "payment") {
      await switchToLocationIfNeeded();
      navigate("/salon/transactions");
    } else if (n.type === "customer") {
      await switchToLocationIfNeeded();
      navigate("/salon/customers");
    }
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">All Notifications</h1>
            <p className="text-muted-foreground">Activity across all branches.</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread" className="gap-2">
              Unread
              {unreadCount > 0 && (
                <Badge className="bg-primary/10 text-primary text-xs h-5 px-1.5">{unreadCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="urgent">Urgent</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0 divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-4">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-72" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Bell className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">
                  {filter === "unread" ? "No unread notifications" : filter === "urgent" ? "No urgent notifications" : "No notifications yet"}
                </p>
              </div>
            ) : (
              filtered.map((n) => {
                const Icon = getIcon(n.type);
                const iconColor = getIconColor(n.type);
                return (
                  <button
                    key={n.id}
                    className={cn(
                      "w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors",
                      !n.read && "bg-primary/5"
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", iconColor)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm", !n.read && "font-semibold")}>{n.title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {n.urgent && (
                            <Badge className="bg-destructive/10 text-destructive text-xs h-4 px-1">Urgent</Badge>
                          )}
                          {!n.read && (
                            <span className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </SalonSidebar>
  );
}
