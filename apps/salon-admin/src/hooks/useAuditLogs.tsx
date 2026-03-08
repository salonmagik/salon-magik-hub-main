import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";

type AuditLog = Tables<"audit_logs">;
type Profile = Tables<"profiles">;
type Location = Tables<"locations">;

export interface AuditLogEntry extends AuditLog {
  actorName: string | null;
  branchName: string | null;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export function useAuditLogs(filters?: AuditLogFilters, limit = 50) {
  const { currentTenant } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const fetchLogs = useCallback(async (pageNum = 0) => {
    if (!currentTenant?.id) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .range(pageNum * limit, (pageNum + 1) * limit - 1);

      if (filters?.action) {
        query = query.eq("action", filters.action);
      }

      if (filters?.entityType) {
        query = query.eq("entity_type", filters.entityType);
      }

      if (filters?.startDate) {
        query = query.gte("created_at", filters.startDate.toISOString());
      }

      if (filters?.endDate) {
        query = query.lte("created_at", filters.endDate.toISOString());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const rawLogs = (data || []) as AuditLog[];
      const actorIds = [...new Set(rawLogs.map((log) => log.actor_user_id).filter((id): id is string => Boolean(id)))];
      const branchIds = [
        ...new Set(
          rawLogs
            .map((log) => (log as AuditLog & { branch_location_id?: string | null }).branch_location_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [profilesResult, locationsResult] = await Promise.all([
        actorIds.length
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", actorIds)
          : Promise.resolve({ data: [] as Pick<Profile, "user_id" | "full_name">[], error: null }),
        branchIds.length
          ? supabase.from("locations").select("id, name").in("id", branchIds)
          : Promise.resolve({ data: [] as Pick<Location, "id" | "name">[], error: null }),
      ]);

      const profileMap = new Map(
        ((profilesResult.data || []) as Array<Pick<Profile, "user_id" | "full_name">>).map((profile) => [
          profile.user_id,
          profile.full_name,
        ]),
      );
      const locationMap = new Map(
        ((locationsResult.data || []) as Array<Pick<Location, "id" | "name">>).map((location) => [
          location.id,
          location.name,
        ]),
      );
      const logData: AuditLogEntry[] = rawLogs.map((log) => {
        const branchLocationId = (log as AuditLog & { branch_location_id?: string | null }).branch_location_id || null;
        return {
          ...log,
          actorName: log.actor_user_id ? profileMap.get(log.actor_user_id) || null : null,
          branchName: branchLocationId ? locationMap.get(branchLocationId) || null : null,
        };
      });
      
      if (pageNum === 0) {
        setLogs(logData);
      } else {
        setLogs((prev) => [...prev, ...logData]);
      }
      
      setHasMore(logData.length === limit);
      setPage(pageNum);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, filters, limit]);

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  const loadMore = () => {
    if (hasMore && !isLoading) {
      fetchLogs(page + 1);
    }
  };

  // Get unique entity types for filtering
  const entityTypes = [...new Set(logs.map((l) => l.entity_type))];
  const actionTypes = [...new Set(logs.map((l) => l.action))];

  return {
    logs,
    entityTypes,
    actionTypes,
    isLoading,
    error,
    hasMore,
    loadMore,
    refetch: () => fetchLogs(0),
  };
}
