import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";

type Location = Tables<"locations">;

export function useLocations() {
  const { currentTenant } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [defaultLocation, setDefaultLocation] = useState<Location | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLocations = useCallback(async () => {
    if (!currentTenant?.id) {
      setLocations([]);
      setDefaultLocation(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("locations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (fetchError) throw fetchError;

      setLocations(data || []);
      setDefaultLocation(data?.find((l) => l.is_default) || data?.[0] || null);
    } catch (err) {
      console.error("Error fetching locations:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  return {
    locations,
    defaultLocation,
    isLoading,
    error,
    refetch: fetchLocations,
  };
}
