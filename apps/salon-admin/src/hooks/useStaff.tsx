import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import type { Tables } from "@supabase-client";

type UserRole = Tables<"user_roles">;
type Profile = Tables<"profiles">;

export interface StaffMember {
  userId: string;
  role: UserRole["role"];
  isActive: boolean;
  profile: Profile | null;
  assignedLocationIds: string[];
  assignedLocationNames: string[];
  assignedLocationCount: number;
  isUnassigned: boolean;
}

export function useStaff() {
  const { currentTenant, currentRole } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!currentTenant?.id) {
      setStaff([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get all user roles for this tenant
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .eq("tenant_id", currentTenant.id);

      if (rolesError) throw rolesError;

      const { data: staffLocationRows, error: staffLocationError } = await supabase
        .from("staff_locations")
        .select("user_id, location_id")
        .eq("tenant_id", currentTenant.id);

      if (staffLocationError) throw staffLocationError;

      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name")
        .eq("tenant_id", currentTenant.id);

      if (locationsError) throw locationsError;

      const locationNameById = new Map((locationsData || []).map((location) => [location.id, location.name]));
      const allLocationIds = (locationsData || []).map((location) => location.id);
      const allLocationNames = (locationsData || []).map((location) => location.name);

      const assignmentMap = new Map<string, string[]>();
      (staffLocationRows || []).forEach((row) => {
        const current = assignmentMap.get(row.user_id) || [];
        current.push(row.location_id);
        assignmentMap.set(row.user_id, current);
      });

      const userIds = [...new Set((rolesData || []).map((r) => r.user_id))];
      let scopedUserIds = userIds;

      const isOwnerView = currentRole === "owner";
      if (!isOwnerView && hasScope) {
        scopedUserIds = userIds.filter((userId) => {
          const assigned = assignmentMap.get(userId) || [];
          return assigned.some((locationId) => scopedLocationIds.includes(locationId));
        });
      }

      if (scopedUserIds.length === 0) {
        setStaff([]);
        setIsLoading(false);
        return;
      }

      // Get profiles for all users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", scopedUserIds);

      if (profilesError) throw profilesError;

      const profilesMap = new Map((profilesData || []).map((p) => [p.user_id, p]));

      const scopedSet = new Set(scopedUserIds);
      const staffList: StaffMember[] = (rolesData || [])
        .filter((role) => scopedSet.has(role.user_id))
        .map((role) => {
          const rawAssignedIds = assignmentMap.get(role.user_id) || [];
          const assignedLocationIds = role.role === "owner" ? allLocationIds : rawAssignedIds;
          const assignedLocationNames =
            role.role === "owner"
              ? allLocationNames
              : assignedLocationIds
                  .map((locationId) => locationNameById.get(locationId))
                  .filter(Boolean) as string[];

          return {
            userId: role.user_id,
            role: role.role,
            isActive: role.is_active !== false,
            profile: profilesMap.get(role.user_id) || null,
            assignedLocationIds,
            assignedLocationNames,
            assignedLocationCount: assignedLocationIds.length,
            isUnassigned: role.role === "owner" ? false : assignedLocationIds.length === 0,
          };
        });

      setStaff(staffList);
    } catch (err) {
      console.error("Error fetching staff:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentRole, currentTenant?.id, hasScope, scopedLocationIds]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  return {
    staff,
    isLoading,
    error,
    refetch: fetchStaff,
  };
}
