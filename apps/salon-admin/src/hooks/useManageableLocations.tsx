import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface ManageableLocationOption {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

export function useManageableLocations() {
  const { currentTenant, currentRole, assignedLocationIds, activeLocationId } = useAuth();
  const [locations, setLocations] = useState<ManageableLocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchLocations = async () => {
      if (!currentTenant?.id) {
        setLocations([]);
        return;
      }

      setIsLoading(true);

      try {
        let query = supabase
          .from("locations")
          .select("id, name, city, country")
          .eq("tenant_id", currentTenant.id)
          .eq("availability", "open")
          .order("name", { ascending: true });

        if (currentRole !== "owner") {
          if (assignedLocationIds.length === 0) {
            if (!cancelled) setLocations([]);
            return;
          }
          query = query.in("id", assignedLocationIds);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!cancelled) {
          setLocations((data || []) as ManageableLocationOption[]);
        }
      } catch (error) {
        console.error("Error fetching manageable locations:", error);
        if (!cancelled) setLocations([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchLocations();

    return () => {
      cancelled = true;
    };
  }, [assignedLocationIds, currentRole, currentTenant?.id]);

  const defaultLocationId = useMemo(() => {
    if (activeLocationId && locations.some((location) => location.id === activeLocationId)) {
      return activeLocationId;
    }
    return locations[0]?.id ?? "";
  }, [activeLocationId, locations]);

  return {
    locations,
    defaultLocationId,
    isLoading,
  };
}
