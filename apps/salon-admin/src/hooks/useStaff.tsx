import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";

type UserRole = Tables<"user_roles">;

interface StaffProfile {
  id?: string | null;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StaffMember {
  userId: string;
  role: UserRole["role"];
  isActive: boolean;
  roleAssignedAt: string | null;
  email: string | null;
  joinedAt: string | null;
  profile: StaffProfile | null;
  assignedLocationIds: string[];
  assignedLocationNames: string[];
  assignedLocationCount: number;
  isUnassigned: boolean;
}

interface StaffMemberRow {
  user_id: string;
  role: UserRole["role"];
  is_active: boolean;
  role_assigned_at: string | null;
  email: string | null;
  joined_at: string | null;
  profile_id: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  profile_created_at: string | null;
  profile_updated_at: string | null;
  assigned_location_ids: string[] | null;
  assigned_location_names: string[] | null;
  assigned_location_count: number | null;
  is_unassigned: boolean;
}

export function useStaff() {
  const { currentTenant, activeContextType, activeLocationId } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const updateStaffLocal = useCallback((userId: string, updater: (member: StaffMember) => StaffMember) => {
    setStaff((prev) => prev.map((member) => (member.userId === userId ? updater(member) : member)));
  }, []);

  const fetchStaff = useCallback(async () => {
    if (!currentTenant?.id) {
      setStaff([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await (supabase.rpc as any)("list_tenant_staff_members", {
        p_tenant_id: currentTenant.id,
        p_context_type: activeContextType,
        p_location_id: activeContextType === "location" ? activeLocationId : null,
      });

      if (rpcError) throw rpcError;

      const rows = (Array.isArray(data) ? data : []) as StaffMemberRow[];
      const staffList: StaffMember[] = rows.map((row) => ({
        userId: row.user_id,
        role: row.role,
        isActive: row.is_active !== false,
        roleAssignedAt: row.role_assigned_at,
        email: row.email,
        joinedAt: row.joined_at,
        profile: {
          id: row.profile_id,
          user_id: row.user_id,
          full_name: row.full_name,
          phone: row.phone,
          avatar_url: row.avatar_url,
          created_at: row.profile_created_at,
          updated_at: row.profile_updated_at,
        },
        assignedLocationIds: row.assigned_location_ids || [],
        assignedLocationNames: row.assigned_location_names || [],
        assignedLocationCount: row.assigned_location_count ?? (row.assigned_location_ids?.length || 0),
        isUnassigned: row.is_unassigned,
      }));

      setStaff(staffList);
    } catch (err) {
      console.error("Error fetching staff:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [activeContextType, activeLocationId, currentTenant?.id]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  return {
    staff,
    isLoading,
    error,
    refetch: fetchStaff,
    updateStaffLocal,
  };
}
