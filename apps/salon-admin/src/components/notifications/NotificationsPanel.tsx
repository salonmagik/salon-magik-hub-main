import { useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

type AppointmentNotificationMeta = {
  id: string;
  location_id: string | null;
  status: string;
  approval_status: string | null;
  confirmation_status: string | null;
  booking_reference: string | null;
  booking_metadata: {
    line_item?: {
      type?: string | null;
      fulfillment_type?: string | null;
    } | null;
  } | null;
  services: Array<{ id: string }>;
};

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
  const { activeContextType, setActiveContext, assignedLocationIds } = useAuth();
  const notificationsHook = useNotifications(!notificationsData);
  const { notifications, isLoading, markAsRead, markAllAsRead, refetch } =
    notificationsData || notificationsHook;
  const [appointmentMetaById, setAppointmentMetaById] = useState<Record<string, AppointmentNotificationMeta>>({});

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const appointmentNotificationIds = useMemo(
    () =>
      notifications
        .filter((notification) => notification.type === "appointment" && notification.entity_id)
        .map((notification) => notification.entity_id as string),
    [notifications],
  );

  useEffect(() => {
    if (!open || appointmentNotificationIds.length === 0) return;

    let cancelled = false;

    const loadAppointmentMeta = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, location_id, status, approval_status, confirmation_status, booking_reference, booking_metadata, services:appointment_services(id)")
        .in("id", appointmentNotificationIds);

      if (error) {
        console.error("Failed to load appointment notification metadata:", error);
        return;
      }

      if (cancelled) return;

      const map = Object.fromEntries(
        ((data as AppointmentNotificationMeta[]) || []).map((appointment) => [appointment.id, appointment]),
      );
      setAppointmentMetaById(map);
    };

    void loadAppointmentMeta();

    return () => {
      cancelled = true;
    };
  }, [open, appointmentNotificationIds]);

  const handleViewSettings = () => {
    onOpenChange(false);
    navigate("/salon/settings?tab=notifications");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentCount = notifications.filter((n) => n.urgent).length;

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    onOpenChange(false);

    // When in owner_hub context, switch to the appropriate branch context first
    // so the sidebar and active context correctly reflect the destination page.
    const switchToLocationIfNeeded = async (locationId?: string | null) => {
      if (activeContextType !== "owner_hub") return;
      const targetLocation = locationId && assignedLocationIds.includes(locationId)
        ? locationId
        : (assignedLocationIds[0] ?? null);
      if (targetLocation) {
        await setActiveContext("location", targetLocation);
      }
    };

    if (notification.type === "appointment" && notification.entity_id) {
      const appointmentMeta = appointmentMetaById[notification.entity_id];
      await switchToLocationIfNeeded(appointmentMeta?.location_id);
      navigate(`/salon/appointments?appointmentId=${notification.entity_id}&open=details`);
      return;
    }
    if (notification.type === "payment") {
      await switchToLocationIfNeeded();
      navigate("/salon/transactions");
      return;
    }
    if (notification.type === "customer") {
      await switchToLocationIfNeeded();
      navigate("/salon/customers");
      return;
    }
  };

  const handleAppointmentAction = async (
    notification: Notification,
    action: "approve" | "decline" | "reschedule" | "review",
  ) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    onOpenChange(false);
    if (notification.entity_id) {
      // Switch branch context if currently in owner_hub before navigating.
      if (activeContextType === "owner_hub") {
        const appointmentMeta = appointmentMetaById[notification.entity_id];
        const locationId = appointmentMeta?.location_id;
        const targetLocation = locationId && assignedLocationIds.includes(locationId)
          ? locationId
          : (assignedLocationIds[0] ?? null);
        if (targetLocation) {
          await setActiveContext("location", targetLocation);
        }
      }
      navigate(`/salon/appointments?appointmentId=${notification.entity_id}&approvalAction=${action}`);
    }
  };

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
                      onClick={() => void handleNotificationClick(notification)}
                      appointmentMeta={notification.entity_id ? appointmentMetaById[notification.entity_id] : undefined}
                      onAppointmentAction={(action) => void handleAppointmentAction(notification, action)}
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
                          onClick={() => void handleNotificationClick(notification)}
                          appointmentMeta={notification.entity_id ? appointmentMetaById[notification.entity_id] : undefined}
                          onAppointmentAction={(action) => void handleAppointmentAction(notification, action)}
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
                          onClick={() => void handleNotificationClick(notification)}
                          appointmentMeta={notification.entity_id ? appointmentMetaById[notification.entity_id] : undefined}
                          onAppointmentAction={(action) => void handleAppointmentAction(notification, action)}
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
  onClick,
  appointmentMeta,
  onAppointmentAction,
}: {
  notification: Notification;
  onMarkRead: () => void;
  onClick: () => void;
  appointmentMeta?: AppointmentNotificationMeta;
  onAppointmentAction: (action: "approve" | "decline" | "reschedule" | "review") => void;
}) {
  const Icon = getIcon(notification.type);
  const iconColor = getIconColor(notification.type);

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });
  const isActionableAppointment =
    notification.type === "appointment" &&
    appointmentMeta &&
    (appointmentMeta.approval_status === "pending" || appointmentMeta.approval_status === "reschedule_proposed");
  const canRescheduleAppointment =
    !!appointmentMeta &&
    (() => {
      const lineItemType = appointmentMeta.booking_metadata?.line_item?.type || null;
      const fulfillmentType = appointmentMeta.booking_metadata?.line_item?.fulfillment_type || null;
      if (lineItemType === "service") return true;
      if (lineItemType === "product" || lineItemType === "package") return false;
      if (fulfillmentType === "pickup" || fulfillmentType === "delivery") return false;
      return appointmentMeta.services.length > 0;
    })();
  const reviewActionLabel =
    appointmentMeta?.booking_metadata?.line_item?.type === "product" ||
    appointmentMeta?.booking_metadata?.line_item?.type === "package"
      ? "Review order"
      : "Review booking";
  const confirmationBadge = (() => {
    if (!appointmentMeta) return null;
    switch (appointmentMeta.approval_status) {
      case "pending":
        return { label: "Unconfirmed", className: "bg-amber-100 text-amber-800" };
      case "approved":
        return { label: "Accepted", className: "bg-emerald-100 text-emerald-800" };
      case "declined":
        return { label: "Declined", className: "bg-rose-100 text-rose-800" };
      case "reschedule_proposed":
        return { label: "Reschedule Proposed", className: "bg-sky-100 text-sky-800" };
      case "reschedule_accepted":
        return { label: "Reschedule Accepted", className: "bg-emerald-100 text-emerald-800" };
      case "reschedule_declined":
        return { label: "Reschedule Declined", className: "bg-orange-100 text-orange-800" };
      default:
        return {
          label: appointmentMeta.confirmation_status === "auto" ? "Auto-confirmed" : "Confirmed",
          className: "bg-slate-100 text-slate-800",
        };
    }
  })();

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
        notification.read ? "bg-background" : "bg-primary/5 border-primary/20",
        "hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <div className={cn("p-2 rounded-lg", iconColor)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium">{notification.title}</h4>
          <div className="flex items-center gap-1 flex-shrink-0">
            {notification.is_gifted && (
              <Badge className="bg-purple-100 text-purple-800 text-[10px]">
                Gift
              </Badge>
            )}
            {notification.urgent && (
              <Badge className="bg-destructive text-destructive-foreground text-[10px]">
                Urgent
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {notification.description}
        </p>
        {appointmentMeta && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-muted text-foreground capitalize">
              {appointmentMeta.status}
            </Badge>
            {confirmationBadge && (
              <Badge variant="secondary" className={confirmationBadge.className}>
                {confirmationBadge.label}
              </Badge>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
        {isActionableAppointment && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAppointmentAction("approve");
              }}
            >
              Accept
            </Button>
            {canRescheduleAppointment && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAppointmentAction("reschedule");
                }}
              >
                Reschedule
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAppointmentAction("decline");
              }}
            >
              Decline
            </Button>
            {appointmentMeta.booking_reference && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAppointmentAction("review");
                }}
              >
                {reviewActionLabel}
              </Button>
            )}
          </div>
        )}
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
