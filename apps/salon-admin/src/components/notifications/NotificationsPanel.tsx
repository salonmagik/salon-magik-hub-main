import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@ui/sheet";
import { Button } from "@ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Bell, Calendar, CreditCard, UserPlus, Settings, Check, Loader2 } from "lucide-react";
import { cn } from "@shared/utils";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

type NotificationsHookData = ReturnType<typeof useNotifications>;

interface NotificationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notificationsData?: NotificationsHookData;
}

const getIcon = (type: Notification["type"]) => {
  switch (type) {
    case "appointment":
      return Calendar;
    case "payment":
      return CreditCard;
    case "customer":
      return UserPlus;
    case "system":
      return Settings;
    default:
      return Bell;
  }
};

const getIconColor = (type: Notification["type"]) => {
  switch (type) {
    case "appointment":
      return "text-primary bg-primary/10";
    case "payment":
      return "text-success bg-success/10";
    case "customer":
      return "text-purple-600 bg-purple-50";
    case "system":
      return "text-muted-foreground bg-muted";
    default:
      return "text-muted-foreground bg-muted";
  }
};

export function NotificationsPanel({ open, onOpenChange, notificationsData }: NotificationsPanelProps) {
  const navigate = useNavigate();
  const notificationsHook = useNotifications(!notificationsData);
  const { notifications, isLoading, markAsRead, markAllAsRead, refetch } =
    notificationsData || notificationsHook;

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const handleViewSettings = () => {
    onOpenChange(false);
    navigate("/salon/settings?tab=notifications");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentCount = notifications.filter((n) => n.urgent).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-primary" />
            <div>
              <SheetTitle>Notifications</SheetTitle>
              <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </Button>
        </SheetHeader>

        <Tabs defaultValue="all" className="w-full flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="all" className="flex items-center gap-2">
              All
              <Badge variant="secondary" className="h-5 px-1.5">
                {notifications.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex items-center gap-2">
              Unread
              <Badge variant="secondary" className="h-5 px-1.5">
                {unreadCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="urgent" className="flex items-center gap-2">
              Urgent
              <Badge variant="secondary" className="h-5 px-1.5">
                {urgentCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-4 scrollbar-hide">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <>
                <TabsContent value="all" className="space-y-2 mt-0">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={() => markAsRead(notification.id)}
                    />
                  ))}
                </TabsContent>

                <TabsContent value="unread" className="space-y-2 mt-0">
                  {notifications.filter((n) => !n.read).length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">All caught up!</p>
                  ) : (
                    notifications
                      .filter((n) => !n.read)
                      .map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={() => markAsRead(notification.id)}
                        />
                      ))
                  )}
                </TabsContent>

                <TabsContent value="urgent" className="space-y-2 mt-0">
                  {notifications.filter((n) => n.urgent).length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No urgent notifications</p>
                  ) : (
                    notifications
                      .filter((n) => n.urgent)
                      .map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={() => markAsRead(notification.id)}
                        />
                      ))
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>

        <div className="mt-auto p-4 border-t bg-background flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Notifications are updated in real-time
          </p>
          <Button variant="link" size="sm" className="text-primary p-0" onClick={handleViewSettings}>
            View Settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const Icon = getIcon(notification.type);
  const iconColor = getIconColor(notification.type);

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
        notification.read ? "bg-background" : "bg-primary/5 border-primary/20",
        "hover:bg-muted/50"
      )}
    >
      <div className={cn("p-2 rounded-lg", iconColor)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium">{notification.title}</h4>
          {notification.urgent && (
            <Badge className="bg-destructive text-destructive-foreground text-[10px]">
              Urgent
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {notification.description}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
      </div>
      {!notification.read && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead();
          }}
        >
          <Check className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
