import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export type CatalogIntegrityItemType = "service" | "product" | "package" | "voucher";
export type CatalogIntegritySeverity = "warning" | "blocking";

export interface CatalogIntegrityIssue {
  id: string;
  tenant_id: string;
  item_type: CatalogIntegrityItemType;
  item_id: string;
  severity: CatalogIntegritySeverity;
  issue_code: string;
  issue_message: string;
  branch_location_ids: string[];
  branch_location_names: string[];
  metadata: Record<string, unknown>;
  detected_at: string;
}

export function useCatalogIntegrityIssues() {
  const { currentTenant } = useAuth();
  const [issues, setIssues] = useState<CatalogIntegrityIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchIssues = useCallback(async () => {
    if (!currentTenant?.id) {
      setIssues([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("list_catalog_item_integrity_issues", {
        p_tenant_id: currentTenant.id,
        p_item_type: null,
        p_item_id: null,
        p_severity: null,
      });
      if (error) throw error;
      setIssues((data || []) as CatalogIntegrityIssue[]);
    } catch (error) {
      console.error("Error fetching catalog integrity issues:", error);
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const issuesByItemKey = useMemo(() => {
    const map = new Map<string, CatalogIntegrityIssue[]>();
    issues.forEach((issue) => {
      const key = `${issue.item_type}:${issue.item_id}`;
      const bucket = map.get(key) || [];
      bucket.push(issue);
      map.set(key, bucket);
    });
    return map;
  }, [issues]);

  return {
    issues,
    issuesByItemKey,
    isLoading,
    refetch: fetchIssues,
  };
}

