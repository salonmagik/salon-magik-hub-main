import { useState, useEffect, useCallback } from "react";
import { endOfDay, startOfDay } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Json, Tables } from "@supabase-client";

type AuditLog = Tables<"audit_logs"> & { branch_location_id?: string | null };
type Profile = Tables<"profiles">;
type Location = Tables<"locations">;

export interface AuditLogEntry extends AuditLog {
  actorName: string | null;
  branchName: string | null;
}

export interface BranchFilterOption {
  id: string;
  name: string;
  city: string | null;
}

export type AuditActionFilterKey =
  | "page_view"
  | "branch_switch"
  | "signed_in"
  | "archived"
  | "delete"
  | "bulk_import"
  | "add_services"
  | "add_packages"
  | "create_voucher"
  | "bookings_on"
  | "bookings_off"
  | "branch_on"
  | "branch_off"
  | "access_denied"
  | "update";

export interface AuditActionFilterOption {
  key: AuditActionFilterKey;
  label: string;
  chainOnly?: boolean;
  actions: string[];
  entityTypes?: string[];
}

export const AUDIT_ACTION_FILTER_OPTIONS: readonly AuditActionFilterOption[] = [
  { key: "page_view", label: "Page View", actions: ["nav.page_view", "page_view"] },
  { key: "branch_switch", label: "Branch Switch", chainOnly: true, actions: ["context.switch"] },
  { key: "signed_in", label: "Signed In", actions: ["auth.login", "login", "signed_in"] },
  { key: "archived", label: "Archived", actions: ["archive", "archived"] },
  { key: "delete", label: "Delete", actions: ["delete", "deleted", "catalog.hard_deleted", "catalog.soft_deleted"] },
  { key: "bulk_import", label: "Bulk Import", actions: ["bulk_import", "import", "catalog.import"] },
  { key: "add_services", label: "Add Services", actions: ["service_created", "create"], entityTypes: ["service"] },
  { key: "add_packages", label: "Add Packages", actions: ["package_created", "create"], entityTypes: ["package"] },
  { key: "create_voucher", label: "Create Voucher", actions: ["voucher_created", "create"], entityTypes: ["voucher"] },
  { key: "bookings_on", label: "Bookings Turned On", actions: ["bookings.turned_on", "bookings_on", "booking.enabled"] },
  { key: "bookings_off", label: "Bookings Turned Off", actions: ["bookings.turned_off", "bookings_off", "booking.disabled"] },
  { key: "branch_on", label: "Branch Turned On", chainOnly: true, actions: ["branch.turned_on", "branch_on", "location.enabled"] },
  { key: "branch_off", label: "Branch Turned Off", chainOnly: true, actions: ["branch.turned_off", "branch_off", "location.disabled"] },
  { key: "access_denied", label: "Access Denied", actions: ["access.denied", "permission.denied"] },
  {
    key: "update",
    label: "Update",
    actions: [
      "update",
      "settings.updated",
      "staff.profile_updated",
      "staff.role_updated",
      "staff.assignment_updated",
      "staff.overrides_updated",
      "service_updated",
      "appointment_updated",
      "customer_updated",
      "booking.staff_assignment_changed",
      "booking.staff_auto_assigned",
    ],
  },
] as const;

export interface AuditLogFilters {
  actionKey?: AuditActionFilterKey;
  branchLocationId?: string;
  startDate?: Date;
  endDate?: Date;
}

const ACTION_FILTER_MAP = new Map(
  AUDIT_ACTION_FILTER_OPTIONS.map((option) => [option.key, option])
);

export function resolveAuditActionFilter(
  key?: AuditActionFilterKey
): AuditActionFilterOption | undefined {
  if (!key) return undefined;
  return ACTION_FILTER_MAP.get(key);
}

export function useAuditLogs(filters?: AuditLogFilters, limit = 50) {
  const { currentTenant } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [branches, setBranches] = useState<BranchFilterOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const fetchLogs = useCallback(
    async (pageNum = 0) => {
      if (!currentTenant?.id) {
        setLogs([]);
        setBranches([]);
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

        const actionFilter = resolveAuditActionFilter(filters?.actionKey);
        if (actionFilter) {
          query = query.in("action", actionFilter.actions);
          if (actionFilter.entityTypes?.length) {
            query = query.in("entity_type", actionFilter.entityTypes);
          }
        }

        if (filters?.branchLocationId) {
          query = query.eq("branch_location_id", filters.branchLocationId);
        }

        if (filters?.startDate && filters?.endDate) {
          query = query
            .gte("created_at", startOfDay(filters.startDate).toISOString())
            .lte("created_at", endOfDay(filters.endDate).toISOString());
        } else if (filters?.startDate) {
          query = query
            .gte("created_at", startOfDay(filters.startDate).toISOString())
            .lte("created_at", endOfDay(filters.startDate).toISOString());
        } else if (filters?.endDate) {
          query = query
            .gte("created_at", startOfDay(filters.endDate).toISOString())
            .lte("created_at", endOfDay(filters.endDate).toISOString());
        }

        const { data, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        const rawLogs = (data || []) as AuditLog[];
        const actorIds = [
          ...new Set(rawLogs.map((log) => log.actor_user_id).filter((id): id is string => Boolean(id))),
        ];
        const branchIds = [
          ...new Set(rawLogs.map((log) => log.branch_location_id).filter((id): id is string => Boolean(id))),
        ];

        const [profilesResult, branchNameResult, branchOptionsResult] = await Promise.all([
          actorIds.length
            ? supabase.from("profiles").select("user_id, full_name").in("user_id", actorIds)
            : Promise.resolve({ data: [] as Pick<Profile, "user_id" | "full_name">[], error: null }),
          branchIds.length
            ? supabase.from("locations").select("id, name").in("id", branchIds)
            : Promise.resolve({ data: [] as Pick<Location, "id" | "name">[], error: null }),
          supabase
            .from("locations")
            .select("id, name, city")
            .eq("tenant_id", currentTenant.id)
            .order("name", { ascending: true }),
        ]);

        const profileMap = new Map(
          ((profilesResult.data || []) as Array<Pick<Profile, "user_id" | "full_name">>).map((profile) => [
            profile.user_id,
            profile.full_name,
          ])
        );

        const locationMap = new Map(
          ((branchNameResult.data || []) as Array<Pick<Location, "id" | "name">>).map((location) => [
            location.id,
            location.name,
          ])
        );

        const branchOptions: BranchFilterOption[] = ((branchOptionsResult.data || []) as Array<
          Pick<Location, "id" | "name" | "city">
        >).map((location) => ({
          id: location.id,
          name: location.name,
          city: location.city ?? null,
        }));

        const logData: AuditLogEntry[] = rawLogs.map((log) => ({
          ...log,
          actorName: log.actor_user_id ? profileMap.get(log.actor_user_id) || null : null,
          branchName: log.branch_location_id ? locationMap.get(log.branch_location_id) || null : null,
        }));

        if (pageNum === 0) {
          setLogs(logData);
          setBranches(branchOptions);
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
    },
    [currentTenant?.id, filters, limit]
  );

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  const loadMore = () => {
    if (hasMore && !isLoading) {
      fetchLogs(page + 1);
    }
  };

  return {
    logs,
    branches,
    isLoading,
    error,
    hasMore,
    loadMore,
    refetch: () => fetchLogs(0),
  };
}

export function getMetadataValue(metadata: Json | null, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length ? value : null;
}
