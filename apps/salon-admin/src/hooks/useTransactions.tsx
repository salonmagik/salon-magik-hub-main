import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type Transaction = Tables<"transactions">;

export interface TransactionWithDetails extends Transaction {
  customer?: {
    id: string;
    full_name: string;
  } | null;
}

export function useTransactions(filters?: {
  type?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const { currentTenant } = useAuth();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState({
    todayRevenue: 0,
    pendingRefunds: 0,
    totalPurseBalance: 0,
  });

  const fetchTransactions = useCallback(async () => {
    if (!currentTenant?.id) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("transactions")
        .select(`
          *,
          customer:customers(id, full_name)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (filters?.type) {
        query = query.eq("type", filters.type);
      }

      if (filters?.startDate) {
        query = query.gte("created_at", filters.startDate.toISOString());
      }

      if (filters?.endDate) {
        query = query.lte("created_at", filters.endDate.toISOString());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTransactions((data as TransactionWithDetails[]) || []);

      // Calculate today's revenue
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayRevenue = (data || [])
        .filter((t) => new Date(t.created_at) >= today && t.type === "payment" && t.status === "completed")
        .reduce((sum, t) => sum + Number(t.amount), 0);

      // Get pending refunds count
      const { count: pendingRefunds } = await supabase
        .from("refund_requests")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending");

      // Get total purse balance
      const { data: purses } = await supabase
        .from("customer_purses")
        .select("balance")
        .eq("tenant_id", currentTenant.id);

      const totalPurseBalance = (purses || []).reduce((sum, p) => sum + Number(p.balance), 0);

      setStats({
        todayRevenue,
        pendingRefunds: pendingRefunds || 0,
        totalPurseBalance,
      });
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, filters?.type, filters?.startDate, filters?.endDate]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const createTransaction = async (data: {
    amount: number;
    type: string;
    method: "card" | "mobile_money" | "cash" | "pos" | "transfer" | "purse";
    customerId?: string;
    appointmentId?: string;
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: transaction, error } = await supabase
        .from("transactions")
        .insert({
          tenant_id: currentTenant.id,
          amount: data.amount,
          type: data.type,
          method: data.method,
          currency: currentTenant.currency,
          customer_id: data.customerId || null,
          appointment_id: data.appointmentId || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Transaction recorded" });
      await fetchTransactions();
      return transaction;
    } catch (err) {
      console.error("Error creating transaction:", err);
      toast({ title: "Error", description: "Failed to record transaction", variant: "destructive" });
      return null;
    }
  };

  return {
    transactions,
    stats,
    isLoading,
    error,
    refetch: fetchTransactions,
    createTransaction,
  };
}
