import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface ReferralCode {
  id: string;
  code: string;
  referrer_tenant_id: string;
  max_redemptions: number;
  consumed: boolean;
  consumed_at: string | null;
  consumed_by_tenant_id: string | null;
}

export interface ReferralDiscount {
  id: string;
  tenant_id: string;
  source: "referrer" | "referee";
  referral_code_id: string;
  percentage: number;
  available: boolean;
  used_on_invoice_id: string | null;
  expires_at: string;
}

interface ReferralCodeRow {
  id: string;
  code: string;
  referrer_tenant_id: string;
  max_redemptions: number;
  consumed: boolean;
  consumed_at: string | null;
  consumed_by_tenant_id: string | null;
}

interface ReferralDiscountRow {
  id: string;
  tenant_id: string;
  source: string;
  referral_code_id: string;
  percentage: number;
  available: boolean;
  used_on_invoice_id: string | null;
  expires_at: string;
}

export function useMyReferralCode() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["my-referral-code", currentTenant?.id],
    queryFn: async (): Promise<string | null> => {
      if (!currentTenant?.id) return null;

      const { data, error } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", currentTenant.id)
        .single();

      if (error) throw error;
      // Use slug as referral code for now
      return data?.slug || null;
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 10,
  });
}

export function useMyReferralCodes() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["my-referral-codes", currentTenant?.id],
    queryFn: async (): Promise<ReferralCode[]> => {
      if (!currentTenant?.id) return [];

      const { data, error } = await supabase
        .from("referral_codes" as "tenants")
        .select("*")
        .eq("referrer_tenant_id" as "id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching referral codes:", error);
        return [];
      }
      
      const codes = data as unknown as ReferralCodeRow[];
      return codes.map((code) => ({
        id: code.id,
        code: code.code,
        referrer_tenant_id: code.referrer_tenant_id,
        max_redemptions: code.max_redemptions,
        consumed: code.consumed,
        consumed_at: code.consumed_at,
        consumed_by_tenant_id: code.consumed_by_tenant_id,
      }));
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 5,
  });
}

export function useMyReferralDiscounts() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["my-referral-discounts", currentTenant?.id],
    queryFn: async (): Promise<ReferralDiscount[]> => {
      if (!currentTenant?.id) return [];

      const { data, error } = await supabase
        .from("referral_discounts" as "tenants")
        .select("*")
        .eq("tenant_id" as "id", currentTenant.id)
        .eq("available" as "online_booking_enabled", true)
        .order("expires_at" as "name", { ascending: true });

      if (error) {
        console.error("Error fetching referral discounts:", error);
        return [];
      }
      
      const discounts = data as unknown as ReferralDiscountRow[];
      return discounts.map((discount) => ({
        id: discount.id,
        tenant_id: discount.tenant_id,
        source: discount.source as "referrer" | "referee",
        referral_code_id: discount.referral_code_id,
        percentage: Number(discount.percentage),
        available: discount.available,
        used_on_invoice_id: discount.used_on_invoice_id,
        expires_at: discount.expires_at,
      }));
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 5,
  });
}

export function useReferralDiscountEligibility() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["referral-discount-eligibility", currentTenant?.id],
    queryFn: async (): Promise<{ eligible: boolean; percentage: number; expiresAt: string | null }> => {
      if (!currentTenant?.id) {
        return { eligible: false, percentage: 0, expiresAt: null };
      }

      // Get tenant signup date
      const { data: tenant } = await supabase
        .from("tenants")
        .select("created_at")
        .eq("id", currentTenant.id)
        .single();

      // Get platform settings
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "referral_discount_config")
        .single();

      const config = settings?.value as {
        percentage?: number;
        window_start_month?: number;
        window_end_month?: number;
      } | null;

      const percentage = config?.percentage ?? 4;
      const windowStart = config?.window_start_month ?? 7;
      const windowEnd = config?.window_end_month ?? 12;

      // Calculate months since signup
      const signupDate = new Date(tenant?.created_at || Date.now());
      const monthsSinceSignup = Math.floor(
        (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      // Check if in the referral window (months 7-12)
      if (monthsSinceSignup < windowStart || monthsSinceSignup > windowEnd) {
        return { eligible: false, percentage: 0, expiresAt: null };
      }

      // Calculate expiry date (end of month 12)
      const expiresAt = new Date(signupDate);
      expiresAt.setMonth(expiresAt.getMonth() + windowEnd);

      return {
        eligible: true,
        percentage,
        expiresAt: expiresAt.toISOString(),
      };
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 10,
  });
}

export function useGenerateReferralCode() {
  const queryClient = useQueryClient();
  const { currentTenant } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<ReferralCode> => {
      if (!currentTenant?.id) {
        throw new Error("No tenant found");
      }

      // Generate unique 8-character code
      const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();

      const { data, error } = await supabase
        .from("referral_codes" as "tenants")
        .insert({
          code,
          referrer_tenant_id: currentTenant.id,
          max_redemptions: 1,
        } as never)
        .select()
        .single();

      if (error) throw error;
      
      const row = data as unknown as ReferralCodeRow;
      return {
        id: row.id,
        code: row.code,
        referrer_tenant_id: row.referrer_tenant_id,
        max_redemptions: row.max_redemptions,
        consumed: row.consumed,
        consumed_at: row.consumed_at,
        consumed_by_tenant_id: row.consumed_by_tenant_id,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-referral-codes"] });
    },
  });
}
