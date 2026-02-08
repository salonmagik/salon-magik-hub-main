import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";

type AuditLog = Tables<"audit_logs">;

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export function useAuditLogs(filters?: AuditLogFilters, limit = 50) {
  const { currentTenant } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
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

      const logData = data || [];
      
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
