import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface PromoCode {
  id: string;
  code: string;
  discount_percentage: number;
  valid_from: string;
  valid_until: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  applies_to: string;
  is_active: boolean;
}

export interface InvoiceDiscount {
  id: string;
  invoice_id: string;
  tenant_id: string;
  discount_type: string;
  discount_percentage: number;
  discount_amount: number;
  billing_period_start: string;
  billing_period_end: string;
}

interface PromoCodeRow {
  id: string;
  code: string;
  discount_percentage: number;
  valid_from: string;
  valid_until: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  applies_to: string;
  is_active: boolean;
}

interface InvoiceDiscountRow {
  id: string;
  invoice_id: string;
  tenant_id: string;
  discount_type: string;
  discount_percentage: number;
  discount_amount: number;
  billing_period_start: string;
  billing_period_end: string;
}

export function usePromoCodes() {
  return useQuery({
    queryKey: ["promo-codes"],
    queryFn: async (): Promise<PromoCode[]> => {
      const { data, error } = await supabase
        .from("promo_codes" as "tenants") // Type workaround
        .select("*")
        .eq("is_active" as "online_booking_enabled", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching promo codes:", error);
        return [];
      }
      
      const codes = data as unknown as PromoCodeRow[];
      return codes.map((code) => ({
        id: code.id,
        code: code.code,
        discount_percentage: Number(code.discount_percentage),
        valid_from: code.valid_from,
        valid_until: code.valid_until,
        max_redemptions: code.max_redemptions,
        redemption_count: code.redemption_count,
        applies_to: code.applies_to,
        is_active: code.is_active,
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useValidatePromoCode() {
  return useMutation({
    mutationFn: async (code: string): Promise<{ valid: boolean; discount?: number; message?: string }> => {
      const { data, error } = await supabase
        .from("promo_codes" as "tenants")
        .select("*")
        .eq("code" as "slug", code.toUpperCase())
        .eq("is_active" as "online_booking_enabled", true)
        .single();

      if (error || !data) {
        return { valid: false, message: "Invalid promo code" };
      }

      const promoCode = data as unknown as PromoCodeRow;
      const now = new Date();
      const validFrom = new Date(promoCode.valid_from);
      const validUntil = promoCode.valid_until ? new Date(promoCode.valid_until) : null;

      if (now < validFrom) {
        return { valid: false, message: "This code is not yet active" };
      }

      if (validUntil && now > validUntil) {
        return { valid: false, message: "This code has expired" };
      }

      if (promoCode.max_redemptions && promoCode.redemption_count >= promoCode.max_redemptions) {
        return { valid: false, message: "This code has reached its maximum redemptions" };
      }

      return { valid: true, discount: Number(promoCode.discount_percentage) };
    },
  });
}

export function useInvoiceDiscounts() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["invoice-discounts", currentTenant?.id],
    queryFn: async (): Promise<InvoiceDiscount[]> => {
      if (!currentTenant?.id) return [];

      const { data, error } = await supabase
        .from("invoice_discounts" as "tenants")
        .select("*")
        .eq("tenant_id" as "id", currentTenant.id)
        .order("billing_period_start" as "name", { ascending: false });

      if (error) {
        console.error("Error fetching invoice discounts:", error);
        return [];
      }
      
      const discounts = data as unknown as InvoiceDiscountRow[];
      return discounts.map((discount) => ({
        id: discount.id,
        invoice_id: discount.invoice_id,
        tenant_id: discount.tenant_id,
        discount_type: discount.discount_type,
        discount_percentage: Number(discount.discount_percentage),
        discount_amount: Number(discount.discount_amount),
        billing_period_start: discount.billing_period_start,
        billing_period_end: discount.billing_period_end,
      }));
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 5,
  });
}

// Check if tenant is eligible for waitlist discount (months 1-6)
export function useWaitlistDiscountEligibility() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["waitlist-discount-eligibility", currentTenant?.id],
    queryFn: async (): Promise<{ eligible: boolean; percentage: number; monthsRemaining: number }> => {
      if (!currentTenant?.id) {
        return { eligible: false, percentage: 0, monthsRemaining: 0 };
      }

      // Check if tenant was from waitlist
      const { data: tenant } = await supabase
        .from("tenants")
        .select("created_at, slug")
        .eq("id", currentTenant.id)
        .single();

      // Use platform_settings for config
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "waitlist_discount_config")
        .single();

      const config = settings?.value as { percentage?: number; duration_months?: number } | null;
      const percentage = config?.percentage ?? 12;
      const durationMonths = config?.duration_months ?? 6;

      // Calculate months since signup
      const signupDate = new Date(tenant?.created_at || Date.now());
      const monthsSinceSignup = Math.floor(
        (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      if (monthsSinceSignup >= durationMonths) {
        return { eligible: false, percentage: 0, monthsRemaining: 0 };
      }

      return {
        eligible: true,
        percentage,
        monthsRemaining: durationMonths - monthsSinceSignup,
      };
    },
    enabled: !!currentTenant?.id,
    staleTime: 1000 * 60 * 10,
  });
}
