import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export interface Voucher {
  id: string;
  tenant_id: string;
  code: string;
  amount: number;
  balance: number;
  status: "active" | "redeemed" | "expired" | "cancelled";
  purchased_by_customer_id: string | null;
  redeemed_by_customer_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useVouchers() {
  const { currentTenant } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVouchers = useCallback(async () => {
    if (!currentTenant?.id) {
      setVouchers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("vouchers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setVouchers((data as Voucher[]) || []);
    } catch (err) {
      console.error("Error fetching vouchers:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const createVoucher = async (data: {
    code: string;
    amount: number;
    expiresAt?: string;
    purchasedByCustomerId?: string;
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: voucher, error } = await supabase
        .from("vouchers")
        .insert({
          tenant_id: currentTenant.id,
          code: data.code.toUpperCase(),
          amount: data.amount,
          balance: data.amount,
          expires_at: data.expiresAt || null,
          purchased_by_customer_id: data.purchasedByCustomerId || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Voucher created successfully" });
      await fetchVouchers();
      return voucher;
    } catch (err: any) {
      console.error("Error creating voucher:", err);
      toast({
        title: "Error",
        description: err.message?.includes("unique") ? "Voucher code already exists" : "Failed to create voucher",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateVoucher = async (id: string, updates: Partial<Pick<Voucher, "status" | "balance" | "redeemed_by_customer_id">>) => {
    try {
      const { error } = await supabase
        .from("vouchers")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Voucher updated" });
      await fetchVouchers();
      return true;
    } catch (err) {
      console.error("Error updating voucher:", err);
      toast({ title: "Error", description: "Failed to update voucher", variant: "destructive" });
      return false;
    }
  };

  return {
    vouchers,
    isLoading,
    error,
    refetch: fetchVouchers,
    createVoucher,
    updateVoucher,
  };
}
