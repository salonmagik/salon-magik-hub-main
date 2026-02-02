import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

type UserRole = Tables<"user_roles">;
type Profile = Tables<"profiles">;

export interface StaffMember {
  userId: string;
  role: UserRole["role"];
  profile: Profile | null;
}

export function useStaff() {
  const { currentTenant } = useAuth();
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

      const userIds = [...new Set((rolesData || []).map((r) => r.user_id))];

      if (userIds.length === 0) {
        setStaff([]);
        setIsLoading(false);
        return;
      }

      // Get profiles for all users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const profilesMap = new Map((profilesData || []).map((p) => [p.user_id, p]));

      const staffList: StaffMember[] = (rolesData || []).map((role) => ({
        userId: role.user_id,
        role: role.role,
        profile: profilesMap.get(role.user_id) || null,
      }));

      setStaff(staffList);
    } catch (err) {
      console.error("Error fetching staff:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

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
