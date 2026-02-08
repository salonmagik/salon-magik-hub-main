import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useToast } from "@ui/use-toast";

export type JournalDirection = "inflow" | "outflow";
export type JournalCategory = "service_payment" | "product_sale" | "expense" | "other";
export type JournalStatus = "active" | "pending_approval" | "rejected" | "reversed";
export type PaymentMethod = "cash" | "pos" | "transfer" | "mobile_money" | "card" | "purse";

export interface JournalLineItem {
  id: string;
  journal_entry_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  tenant_id: string;
  direction: JournalDirection;
  payment_method: PaymentMethod;
  amount: number;
  currency: string;
  description: string | null;
  parsed_summary: string | null;
  category: JournalCategory;
  occurred_at: string;
  appointment_id: string | null;
  customer_id: string | null;
  status: JournalStatus;
  created_by_id: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  line_items?: JournalLineItem[];
  customer?: { id: string; full_name: string } | null;
  appointment?: { id: string; scheduled_start: string | null } | null;
}

export interface JournalFilters {
  direction?: JournalDirection;
  category?: JournalCategory;
  status?: JournalStatus;
  paymentMethod?: PaymentMethod;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  unlinkedOnly?: boolean;
}

export interface JournalStats {
  totalInflow: number;
  totalOutflow: number;
  netAmount: number;
  unlinkedCount: number;
  pendingApprovalCount: number;
  cashTotal: number;
  posTotal: number;
}

interface CreateJournalEntryInput {
  direction: JournalDirection;
  payment_method: PaymentMethod;
  amount: number;
  currency?: string;
  description?: string;
  parsed_summary?: string;
  category: JournalCategory;
  occurred_at?: string;
  appointment_id?: string;
  customer_id?: string;
  status?: JournalStatus;
  line_items?: Omit<JournalLineItem, "id" | "journal_entry_id" | "created_at">[];
}

export function useJournal(filters?: JournalFilters, limit = 50) {
  const { currentTenant, user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats>({
    totalInflow: 0,
    totalOutflow: 0,
    netAmount: 0,
    unlinkedCount: 0,
    pendingApprovalCount: 0,
    cashTotal: 0,
    posTotal: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  // Serialize filters to prevent infinite loop from object reference changes
  const filtersKey = JSON.stringify(filters || {});

  const fetchEntries = useCallback(async (pageNum = 0) => {
    if (!currentTenant?.id) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("journal_entries")
        .select(`
          *,
          customer:customers(id, full_name),
          appointment:appointments(id, scheduled_start)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("occurred_at", { ascending: false })
        .range(pageNum * limit, (pageNum + 1) * limit - 1);

      if (filters?.direction) {
        query = query.eq("direction", filters.direction);
      }
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.paymentMethod) {
        query = query.eq("payment_method", filters.paymentMethod);
      }
      if (filters?.startDate) {
        query = query.gte("occurred_at", filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte("occurred_at", filters.endDate.toISOString());
      }
      if (filters?.unlinkedOnly) {
        query = query.is("appointment_id", null).is("customer_id", null);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      let entriesData = (data || []) as JournalEntry[];

      // Apply search filter client-side
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        entriesData = entriesData.filter(
          (entry) =>
            entry.description?.toLowerCase().includes(searchLower) ||
            entry.parsed_summary?.toLowerCase().includes(searchLower) ||
            entry.customer?.full_name?.toLowerCase().includes(searchLower)
        );
      }

      if (pageNum === 0) {
        setEntries(entriesData);
      } else {
        setEntries((prev) => [...prev, ...entriesData]);
      }

      setHasMore(entriesData.length === limit);
      setPage(pageNum);
    } catch (err) {
      console.error("Error fetching journal entries:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, filtersKey, limit]);

  const fetchStats = useCallback(async () => {
    if (!currentTenant?.id) return;

    try {
      const { data, error: statsError } = await supabase
        .from("journal_entries")
        .select("direction, payment_method, amount, status, appointment_id, customer_id")
        .eq("tenant_id", currentTenant.id);

      if (statsError) throw statsError;

      const entries = data || [];
      
      const newStats: JournalStats = {
        totalInflow: entries
          .filter((e) => e.direction === "inflow" && e.status === "active")
          .reduce((sum, e) => sum + Number(e.amount), 0),
        totalOutflow: entries
          .filter((e) => e.direction === "outflow" && e.status === "active")
          .reduce((sum, e) => sum + Number(e.amount), 0),
        netAmount: 0,
        unlinkedCount: entries.filter(
          (e) => !e.appointment_id && !e.customer_id && e.status === "active"
        ).length,
        pendingApprovalCount: entries.filter((e) => e.status === "pending_approval").length,
        cashTotal: entries
          .filter((e) => e.payment_method === "cash" && e.status === "active")
          .reduce((sum, e) => sum + Number(e.amount) * (e.direction === "inflow" ? 1 : -1), 0),
        posTotal: entries
          .filter((e) => e.payment_method === "pos" && e.status === "active")
          .reduce((sum, e) => sum + Number(e.amount) * (e.direction === "inflow" ? 1 : -1), 0),
      };
      
      newStats.netAmount = newStats.totalInflow - newStats.totalOutflow;
      setStats(newStats);
    } catch (err) {
      console.error("Error fetching journal stats:", err);
    }
  }, [currentTenant?.id]);

  // Fetch data only when tenant or filters change (using serialized key)
  useEffect(() => {
    fetchEntries(0);
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id, filtersKey]);

  const loadMore = () => {
    if (hasMore && !isLoading) {
      fetchEntries(page + 1);
    }
  };

  const createEntry = async (input: CreateJournalEntryInput) => {
    if (!currentTenant?.id || !user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return null;
    }

    try {
      const { data: entry, error: createError } = await supabase
        .from("journal_entries")
        .insert({
          tenant_id: currentTenant.id,
          direction: input.direction,
          payment_method: input.payment_method,
          amount: input.amount,
          currency: input.currency || currentTenant.currency || "USD",
          description: input.description,
          parsed_summary: input.parsed_summary,
          category: input.category,
          occurred_at: input.occurred_at || new Date().toISOString(),
          appointment_id: input.appointment_id,
          customer_id: input.customer_id,
          status: input.status || "active",
          created_by_id: user.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Create line items if provided
      if (input.line_items && input.line_items.length > 0 && entry) {
        const { error: lineItemsError } = await supabase
          .from("journal_line_items")
          .insert(
            input.line_items.map((item) => ({
              journal_entry_id: entry.id,
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.total_price,
            }))
          );

        if (lineItemsError) throw lineItemsError;
      }

      toast({ title: "Success", description: "Journal entry created" });
      fetchEntries(0);
      fetchStats();
      return entry;
    } catch (err) {
      console.error("Error creating journal entry:", err);
      toast({ title: "Error", description: "Failed to create entry", variant: "destructive" });
      return null;
    }
  };

  const updateEntry = async (id: string, updates: Partial<CreateJournalEntryInput>) => {
    try {
      const { error: updateError } = await supabase
        .from("journal_entries")
        .update(updates)
        .eq("id", id);

      if (updateError) throw updateError;

      toast({ title: "Success", description: "Journal entry updated" });
      fetchEntries(0);
      fetchStats();
      return true;
    } catch (err) {
      console.error("Error updating journal entry:", err);
      toast({ title: "Error", description: "Failed to update entry", variant: "destructive" });
      return false;
    }
  };

  const approveEntry = async (id: string) => {
    if (!user?.id) return false;

    try {
      const { error: approveError } = await supabase
        .from("journal_entries")
        .update({
          status: "active",
          approved_by_id: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (approveError) throw approveError;

      toast({ title: "Success", description: "Entry approved" });
      fetchEntries(0);
      fetchStats();
      return true;
    } catch (err) {
      console.error("Error approving entry:", err);
      toast({ title: "Error", description: "Failed to approve entry", variant: "destructive" });
      return false;
    }
  };

  const rejectEntry = async (id: string, reason: string) => {
    if (!user?.id) return false;

    try {
      const { error: rejectError } = await supabase
        .from("journal_entries")
        .update({
          status: "rejected",
          approved_by_id: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", id);

      if (rejectError) throw rejectError;

      toast({ title: "Success", description: "Entry rejected" });
      fetchEntries(0);
      fetchStats();
      return true;
    } catch (err) {
      console.error("Error rejecting entry:", err);
      toast({ title: "Error", description: "Failed to reject entry", variant: "destructive" });
      return false;
    }
  };

  const reverseEntry = async (id: string) => {
    try {
      const { error: reverseError } = await supabase
        .from("journal_entries")
        .update({ status: "reversed" })
        .eq("id", id);

      if (reverseError) throw reverseError;

      toast({ title: "Success", description: "Entry reversed" });
      fetchEntries(0);
      fetchStats();
      return true;
    } catch (err) {
      console.error("Error reversing entry:", err);
      toast({ title: "Error", description: "Failed to reverse entry", variant: "destructive" });
      return false;
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from("journal_entries")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast({ title: "Success", description: "Entry deleted" });
      fetchEntries(0);
      fetchStats();
      return true;
    } catch (err) {
      console.error("Error deleting entry:", err);
      toast({ title: "Error", description: "Failed to delete entry", variant: "destructive" });
      return false;
    }
  };

  return {
    entries,
    stats,
    isLoading,
    error,
    hasMore,
    loadMore,
    createEntry,
    updateEntry,
    approveEntry,
    rejectEntry,
    reverseEntry,
    deleteEntry,
    refetch: () => {
      fetchEntries(0);
      fetchStats();
    },
  };
}
