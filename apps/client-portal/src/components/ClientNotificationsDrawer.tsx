import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent, SheetTitle } from "@ui/sheet";
import { Button } from "@ui/button";
import { useClientNotifications } from "@/hooks";
import { cn } from "@shared/utils";

interface ClientNotificationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientNotificationsDrawer({ open, onOpenChange }: ClientNotificationsDrawerProps) {
  const { notifications = [], unreadCount = 0, markAsRead, markAllAsRead } = useClientNotifications();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base font-semibold">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {unreadCount} unread
                </span>
              )}
            </SheetTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={() => void markAllAsRead()}
            className="gap-1.5 text-xs"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void markAsRead(notification.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50",
                      !notification.read && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        notification.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Bell className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", notification.read ? "font-medium text-foreground" : "font-semibold text-foreground")}>
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{notification.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
