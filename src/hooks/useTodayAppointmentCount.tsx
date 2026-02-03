import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Hook to fetch today's appointment count independently of any filters.
 * This count is ALWAYS for today only and is not affected by date/status filters.
 */
export function useTodayAppointmentCount() {
  const { currentTenant } = useAuth();
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!currentTenant?.id) {
      setCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    try {
      const { count: aptCount, error } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", currentTenant.id)
        .eq("is_unscheduled", false)
        .gte("scheduled_start", startOfDay)
        .lte("scheduled_start", endOfDay);

      if (error) throw error;
      setCount(aptCount || 0);
    } catch (err) {
      console.error("Error fetching today's appointment count:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  return { count, isLoading, refetch: fetchCount };
}
