import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: "appointment" | "payment" | "customer" | "system" | "staff";
  title: string;
  description: string;
  read: boolean;
  urgent: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

const NOTIFICATIONS_TTL_MS = 15_000;
const NOTIFICATIONS_POLL_MS = 15_000;
const notificationsCache = new Map<
  string,
  { fetchedAt: number; data: Notification[] }
>();

function dedupeNotifications(items: Notification[]) {
  const seen = new Set<string>();
  const unique: Notification[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

export function useNotifications(enabled = true) {
  const { currentTenant, user, activeLocationId, activeContextType } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const notificationsRef = useRef<Notification[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const fetchNotifications = useCallback(async (force = false) => {
    if (!enabled || !currentTenant?.id) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const cacheKey = `${currentTenant.id}:${user?.id || "all"}:${activeLocationId || "hub"}`;
    const cached = notificationsCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.fetchedAt < NOTIFICATIONS_TTL_MS) {
      setNotifications(cached.data);
      setIsLoading(false);
      return;
    }

    if (notificationsRef.current.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      let notifsQuery = supabase
        .from("notifications")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .or(`user_id.is.null,user_id.eq.${user?.id}`);

      // When viewing a specific branch, only show that branch's notifications
      // plus tenant-wide ones (location_id IS NULL).
      if (activeContextType === "location" && activeLocationId) {
        notifsQuery = notifsQuery.or(`location_id.is.null,location_id.eq.${activeLocationId}`);
      }

      const { data, error: fetchError } = await notifsQuery
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      const next = dedupeNotifications((data as Notification[]) || []);
      setNotifications(next);
      notificationsCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data: next,
      });
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, currentTenant?.id, user?.id, activeLocationId, activeContextType]);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications();
  }, [enabled, fetchNotifications]);

  // Poll as fallback for when the Realtime WebSocket drops (common in dev/flaky networks).
  useEffect(() => {
    if (!enabled || !currentTenant?.id) return;
    const id = setInterval(() => fetchNotifications(true), NOTIFICATIONS_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, currentTenant?.id, fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!enabled || !currentTenant?.id) return;

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${currentTenant.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          // Branch scope: skip notifications that belong to a different branch
          const locationMatch =
            activeContextType !== "location" ||
            !activeLocationId ||
            !(newNotification as any).location_id ||
            (newNotification as any).location_id === activeLocationId;
          // Only add if it's for all users or this specific user
          if (locationMatch && (!newNotification.user_id || newNotification.user_id === user?.id)) {
            setNotifications((prev) => {
              const next = dedupeNotifications([newNotification, ...prev]);
              const cacheKey = `${currentTenant.id}:${user?.id || "all"}:${activeLocationId || "hub"}`;
              notificationsCache.set(cacheKey, {
                fetchedAt: Date.now(),
                data: next,
              });
              return next;
            });
            
            // Show toast for urgent notifications
            if (newNotification.urgent) {
              toast({
                title: newNotification.title,
                description: newNotification.description,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, currentTenant?.id, user?.id]);

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);

      if (error) throw error;

      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
        if (currentTenant?.id) {
          notificationsCache.set(`${currentTenant.id}:${user?.id || "all"}`, {
            fetchedAt: Date.now(),
            data: next,
          });
        }
        return next;
      });
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    if (!currentTenant?.id) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("tenant_id", currentTenant.id)
        .eq("read", false);

      if (error) throw error;

      setNotifications((prev) => {
        const next = prev.map((n) => ({ ...n, read: true }));
        notificationsCache.set(`${currentTenant.id}:${user?.id || "all"}`, {
          fetchedAt: Date.now(),
          data: next,
        });
        return next;
      });
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  const refetch = useCallback(() => fetchNotifications(true), [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentNotifications = notifications.filter((n) => n.urgent && !n.read);

  return {
    notifications,
    unreadCount,
    urgentNotifications,
    isLoading,
    error,
    refetch,
    markAsRead,
    markAllAsRead,
  };
}
