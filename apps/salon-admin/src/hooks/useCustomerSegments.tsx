import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface CustomerSegment {
  customer_id: string;
  tenant_id: string;
  is_vip: boolean;
  is_regular: boolean;
  is_lapsed: boolean;
  loves_packages: boolean;
  is_big_spender: boolean;
  total_paid: number;
  packages_last_quarter: number;
}

export type CustomerTag =
  | "vip"
  | "big_spender"
  | "regular"
  | "loves_packages"
  | "lapsed";

export const CUSTOMER_TAG_META: Record<
  CustomerTag,
  { label: string; className: string; description: string }
> = {
  vip: {
    label: "VIP",
    className: "bg-amber-100 text-amber-800",
    description: "Marked manually by your team — click the star on a customer to toggle it.",
  },
  big_spender: {
    label: "Big spender",
    className: "bg-success-bg text-success",
    description: "Top 10% of paying customers at this salon by total amount spent. Only shown once you have at least 5 paying customers.",
  },
  regular: {
    label: "Regular",
    className: "bg-primary/10 text-primary",
    description: "Visited 5 or more times.",
  },
  loves_packages: {
    label: "Loves packages",
    className: "bg-primary/10 text-primary",
    description: "Bought 3 or more packages in the last 3 months.",
  },
  lapsed: {
    label: "Lapsed",
    className: "bg-warning-bg text-warning-foreground",
    description: "Hasn't visited in over 45 days.",
  },
};

/** Ordered tag list for a segment row (most notable first). */
export function segmentTags(segment: CustomerSegment | undefined): CustomerTag[] {
  if (!segment) return [];
  const tags: CustomerTag[] = [];
  if (segment.is_vip) tags.push("vip");
  if (segment.is_big_spender) tags.push("big_spender");
  if (segment.is_regular) tags.push("regular");
  if (segment.loves_packages) tags.push("loves_packages");
  if (segment.is_lapsed) tags.push("lapsed");
  return tags;
}

/**
 * Reads the customer_segments view for the current tenant and returns a map of
 * customer_id -> derived tags (VIP/Big spender/Regular/Loves packages/Lapsed).
 */
export function useCustomerSegments() {
  const { currentTenant } = useAuth();
  const [segments, setSegments] = useState<Record<string, CustomerSegment>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSegments = useCallback(async () => {
    if (!currentTenant?.id) {
      setSegments({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // customer_segments is a view; not yet in generated types.
      const { data, error: fetchError } = await (supabase
        .from("customer_segments" as never)
        .select("*")
        .eq("tenant_id", currentTenant.id) as unknown as Promise<{
        data: CustomerSegment[] | null;
        error: Error | null;
      }>);

      if (fetchError) throw fetchError;

      const map: Record<string, CustomerSegment> = {};
      for (const row of data || []) {
        map[row.customer_id] = row;
      }
      setSegments(map);
    } catch (err) {
      console.error("Error fetching customer segments:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  return { segments, isLoading, error, refetch: fetchSegments };
}
