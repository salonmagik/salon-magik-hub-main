import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";

export function useLocationScope() {
  const { activeContextType, activeLocationId, assignedLocationIds, currentRole } = useAuth();

  const scopedLocationIds = useMemo(() => {
    if (activeContextType === "location") {
      return activeLocationId ? [activeLocationId] : [];
    }

    // owner_hub context: managers/supervisors stay scoped to assigned locations.
    if (currentRole === "manager" || currentRole === "supervisor") {
      return assignedLocationIds;
    }

    // owners/receptionists/staff in hub mode should not normally happen, but return no scope.
    return [];
  }, [activeContextType, activeLocationId, assignedLocationIds, currentRole]);

  const hasScope = scopedLocationIds.length > 0;

  return {
    scopedLocationIds,
    hasScope,
    isHubContext: activeContextType === "owner_hub",
  };
}
