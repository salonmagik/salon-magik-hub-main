import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

type StaffSession = Tables<"staff_sessions">;

interface OnlineStaffCount {
  locationId: string;
  count: number;
}

// Consider a session active if last activity was within 5 minutes
const ACTIVITY_THRESHOLD_MINUTES = 5;

export function useStaffSessions() {
  const { user, currentTenant } = useAuth();
  const [currentSession, setCurrentSession] = useState<StaffSession | null>(null);
  const [onlineByLocation, setOnlineByLocation] = useState<OnlineStaffCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch online counts by location
  const fetchOnlineCounts = useCallback(async () => {
    if (!currentTenant?.id) {
      setOnlineByLocation([]);
      return;
    }

    const threshold = new Date();
    threshold.setMinutes(threshold.getMinutes() - ACTIVITY_THRESHOLD_MINUTES);

    const { data, error } = await supabase
      .from("staff_sessions")
      .select("location_id")
      .eq("tenant_id", currentTenant.id)
      .is("ended_at", null)
      .gte("last_activity_at", threshold.toISOString());

    if (error) {
      console.error("Error fetching staff sessions:", error);
      return;
    }

    // Count by location
    const counts: Record<string, number> = {};
    data?.forEach((session) => {
      const locId = session.location_id || "unassigned";
      counts[locId] = (counts[locId] || 0) + 1;
    });

    setOnlineByLocation(
      Object.entries(counts).map(([locationId, count]) => ({
        locationId,
        count,
      }))
    );
  }, [currentTenant?.id]);

  // Start a new session
  const startSession = useCallback(async (locationId?: string) => {
    if (!user?.id || !currentTenant?.id) return null;

    // End any existing session first
    await supabase
      .from("staff_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("tenant_id", currentTenant.id)
      .is("ended_at", null);

    // Start new session
    const { data, error } = await supabase
      .from("staff_sessions")
      .insert({
        user_id: user.id,
        tenant_id: currentTenant.id,
        location_id: locationId || null,
        device_type: getDeviceType(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error starting session:", error);
      return null;
    }

    setCurrentSession(data);
    fetchOnlineCounts();
    return data;
  }, [user?.id, currentTenant?.id, fetchOnlineCounts]);

  // Update activity timestamp (call periodically to stay "online")
  const heartbeat = useCallback(async () => {
    if (!currentSession?.id) return;

    const { error } = await supabase
      .from("staff_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", currentSession.id);

    if (error) {
      console.error("Heartbeat error:", error);
    }
  }, [currentSession?.id]);

  // End current session
  const endSession = useCallback(async () => {
    if (!currentSession?.id) return;

    const { error } = await supabase
      .from("staff_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", currentSession.id);

    if (error) {
      console.error("Error ending session:", error);
      return;
    }

    setCurrentSession(null);
    fetchOnlineCounts();
  }, [currentSession?.id, fetchOnlineCounts]);

  // Get count for a specific location
  const getOnlineCountForLocation = useCallback(
    (locationId: string): number => {
      return onlineByLocation.find((o) => o.locationId === locationId)?.count || 0;
    },
    [onlineByLocation]
  );

  // Get total online count
  const getTotalOnlineCount = useCallback((): number => {
    return onlineByLocation.reduce((sum, o) => sum + o.count, 0);
  }, [onlineByLocation]);

  // Initialize: check for existing session and start if needed
  useEffect(() => {
    const init = async () => {
      if (!user?.id || !currentTenant?.id) {
        setIsLoading(false);
        return;
      }

      // Check for existing active session
      const { data: existingSession } = await supabase
        .from("staff_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .is("ended_at", null)
        .maybeSingle();

      if (existingSession) {
        setCurrentSession(existingSession);
      }

      await fetchOnlineCounts();
      setIsLoading(false);
    };

    init();
  }, [user?.id, currentTenant?.id, fetchOnlineCounts]);

  // Set up heartbeat interval
  useEffect(() => {
    if (!currentSession) return;

    const interval = setInterval(heartbeat, 60000); // Every minute
    return () => clearInterval(interval);
  }, [currentSession, heartbeat]);

  // Set up realtime subscription
  useEffect(() => {
    if (!currentTenant?.id) return;

    const channel = supabase
      .channel("staff-sessions-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_sessions",
          filter: `tenant_id=eq.${currentTenant.id}`,
        },
        () => {
          fetchOnlineCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenant?.id, fetchOnlineCounts]);

  return {
    currentSession,
    onlineByLocation,
    isLoading,
    startSession,
    endSession,
    heartbeat,
    getOnlineCountForLocation,
    getTotalOnlineCount,
    refetch: fetchOnlineCounts,
  };
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/mobile/i.test(ua)) return "mobile";
  if (/tablet/i.test(ua)) return "tablet";
  return "desktop";
}
