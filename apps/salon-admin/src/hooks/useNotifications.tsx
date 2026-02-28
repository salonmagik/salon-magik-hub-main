import { useState, useEffect, useCallback } from "react";
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

const NOTIFICATIONS_TTL_MS = 20_000;
const notificationsCache = new Map<
  string,
  { fetchedAt: number; data: Notification[] }
>();

export function useNotifications(enabled = true) {
  const { currentTenant, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchNotifications = useCallback(async (force = false) => {
    if (!enabled || !currentTenant?.id) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const cacheKey = `${currentTenant.id}:${user?.id || "all"}`;
    const cached = notificationsCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.fetchedAt < NOTIFICATIONS_TTL_MS) {
      setNotifications(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("notifications")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .or(`user_id.is.null,user_id.eq.${user?.id}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      setNotifications((data as Notification[]) || []);
      notificationsCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data: (data as Notification[]) || [],
      });
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, currentTenant?.id, user?.id]);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications();
  }, [enabled, fetchNotifications]);

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
          // Only add if it's for all users or this specific user
          if (!newNotification.user_id || newNotification.user_id === user?.id) {
            setNotifications((prev) => {
              const next = [newNotification, ...prev];
              const cacheKey = `${currentTenant.id}:${user?.id || "all"}`;
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

  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentNotifications = notifications.filter((n) => n.urgent && !n.read);

  return {
    notifications,
    unreadCount,
    urgentNotifications,
    isLoading,
    error,
    refetch: () => fetchNotifications(true),
    markAsRead,
    markAllAsRead,
  };
}
