import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";
import { toast } from "@ui/ui/use-toast";

// Mirrors salon-admin's useNotifications chime (synthesized, not an audio
// asset) so a client gets the same audible "something arrived" signal --
// e.g. a refund rejection -- with the same swiftness as the salon side.
// Browsers suspend AudioContext until the user has interacted with the page
// at least once, so the very first notification of a session may play
// silently; expected, not a bug.
let chimeContext: AudioContext | null = null;

function playNotificationChime() {
  try {
    if (!chimeContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      chimeContext = new AudioContextClass();
    }
    if (chimeContext.state === "suspended") {
      void chimeContext.resume();
    }
    const now = chimeContext.currentTime;
    [880, 1318.51].forEach((frequency, index) => {
      const oscillator = chimeContext!.createOscillator();
      const gain = chimeContext!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const startAt = now + index * 0.09;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.15, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.22);
      oscillator.connect(gain);
      gain.connect(chimeContext!.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.24);
    });
  } catch (err) {
    console.error("Failed to play notification chime:", err);
  }
}

export interface ClientNotification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: string;
  title: string;
  description: string;
  read: boolean;
  urgent: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export function useClientNotifications() {
  const { user, isAuthenticated } = useClientAuth();
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // The sidebar's unread badge and the full notifications page both mount
  // this hook at once, each needing its own realtime subscription. A shared,
  // hardcoded channel name meant the second subscriber tried to add a
  // callback to a channel the first had already called subscribe() on, and
  // Supabase-js throws rather than allowing that. One channel per instance.
  const channelNameRef = useRef(`client-notifications-${crypto.randomUUID()}`);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch notifications for this user
      const { data, error: fetchError } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      setNotifications((data as ClientNotification[]) || []);
    } catch (err) {
      console.error("Error fetching client notifications:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as ClientNotification;
          setNotifications((prev) => [newNotification, ...prev]);

          playNotificationChime();

          // Show toast for urgent notifications
          if (newNotification.urgent) {
            toast({
              title: newNotification.title,
              description: newNotification.description,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user?.id]);

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId)
        .eq("user_id", user?.id);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
