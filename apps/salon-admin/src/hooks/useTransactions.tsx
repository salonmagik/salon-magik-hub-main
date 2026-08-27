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
  appointment?: {
    id: string;
    status: string;
    payment_status: string;
    amount_paid: number;
    total_amount: number;
    location_id: string | null;
    location?: { id: string; name: string } | null;
    services?: { service_name: string }[] | null;
  } | null;
  // For grouped split payments
  is_split_payment?: boolean;
  split_card_amount?: number;
  split_purse_amount?: number;
  split_transactions?: TransactionWithDetails[];
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
          customer:customers(id, full_name),
          appointment:appointments(id, status, payment_status, amount_paid, total_amount, location_id, location:locations(id, name), services:appointment_services(service_name))
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

      // Keep every payment component as its own ledger row. A card + Salon
      // Balance payment must remain independently refundable against its
      // canonical transaction amount.
      const ledgerTransactions = (data as TransactionWithDetails[] || []);

      // A customer paying online via Paystack only gets a `transactions` row
      // once the webhook confirms success or failure — until then, the only
      // record of that payment is a `payment_intents` row (status: pending).
      // That made the appointment itself show as awaiting payment while the
      // Transactions/Cashflow page showed nothing at all for it. Surface
      // those still-pending intents alongside real transactions so staff see
      // the same pending payment in both places; they naturally drop off
      // this list the moment the webhook flips their status to
      // completed/failed and a real transaction row takes over.
      let pendingIntentRows: TransactionWithDetails[] = [];
      if (!filters?.type || filters.type === "payment" || filters.type === "deposit") {
        let intentQuery = supabase
          .from("payment_intents")
          .select(`
            id, appointment_id, amount, currency, customer_name, customer_email,
            is_deposit, status, created_at,
            appointment:appointments(id, status, payment_status, amount_paid, total_amount, location_id, location:locations(id, name), services:appointment_services(service_name))
          `)
          .eq("tenant_id", currentTenant.id)
          .eq("status", "pending")
          .eq("intent_type", "appointment_payment")
          .order("created_at", { ascending: false });

        if (filters?.startDate) {
          intentQuery = intentQuery.gte("created_at", filters.startDate.toISOString());
        }
        if (filters?.endDate) {
          intentQuery = intentQuery.lte("created_at", filters.endDate.toISOString());
        }

        const { data: pendingIntents, error: intentError } = await intentQuery;
        if (intentError) {
          console.error("Error fetching pending payment intents:", intentError);
        } else {
          type PendingIntentRow = {
            id: string;
            appointment_id: string | null;
            amount: number;
            currency: string;
            customer_name: string | null;
            customer_email: string;
            is_deposit: boolean;
            status: string;
            created_at: string;
            appointment: TransactionWithDetails["appointment"];
          };
          pendingIntentRows = ((pendingIntents || []) as unknown as PendingIntentRow[])
            .filter((intent) => !filters?.type || (filters.type === "deposit") === Boolean(intent.is_deposit))
            .map((intent) => ({
              id: intent.id,
              tenant_id: currentTenant.id,
              customer_id: null,
              appointment_id: intent.appointment_id,
              type: intent.is_deposit ? "deposit" : "payment",
              amount: intent.amount,
              currency: intent.currency,
              method: null,
              provider: "paystack",
              status: "pending",
              created_at: intent.created_at,
              customer: { id: "", full_name: intent.customer_name || intent.customer_email },
              appointment: intent.appointment,
            } as unknown as TransactionWithDetails));
        }
      }

      const allTransactions = [...pendingIntentRows, ...ledgerTransactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTransactions(allTransactions);

      // Calculate today's revenue (use grouped amounts)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayRevenue = ledgerTransactions
        .filter((t) => new Date(t.created_at) >= today && (t.type === "payment" || t.type === "deposit") && t.status === "completed")
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
