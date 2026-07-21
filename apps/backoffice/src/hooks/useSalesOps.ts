import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type TablesInsert } from "@/lib/supabase";
import { toast } from "sonner";
import { useBackofficeAuth } from "./useBackofficeAuth";

export function useSalesOps() {
  const queryClient = useQueryClient();
  const { hasBackofficePermission, hasBackofficePageAccess, backofficeUser } = useBackofficeAuth();
  const canCaptureClient = hasBackofficePermission("sales.capture_client");
  const canManageCampaigns = hasBackofficePermission("sales.manage_campaigns");
  const canManageAgentsKyc = hasBackofficePermission("sales.manage_agents_kyc");
  const canViewConversions =
    hasBackofficePermission("sales.view_conversions") ||
    hasBackofficePageAccess("sales_conversions");
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const ownSalesAgentQuery = useQuery({
    queryKey: ["sales-agent-self", backofficeUser?.id],
    enabled: Boolean(backofficeUser?.user_id && !isSuperAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_agents")
        .select("id")
        .eq("backoffice_user_id", backofficeUser!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) || null;
    },
  });

  const campaignsQuery = useQuery({
    queryKey: ["sales-campaigns"],
    enabled: canCaptureClient || canManageCampaigns,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_promo_campaigns")
        .select("id, name, starts_at, ends_at, is_active, discount_type, discount_value, enable_trial_extension, trial_extension_days, billing_targets, max_uses_per_tenant, email_subject_template, email_body_template, code_expiry_hours")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const agentsQuery = useQuery({
    queryKey: ["sales-agents"],
    enabled: canCaptureClient || canManageAgentsKyc,
    queryFn: async () => {
      let query = supabase
        .from("sales_agents")
        .select("id, backoffice_user_id, employment_status, country_code, monthly_base_salary, hire_date, backoffice_users(user_id, email_domain)")
        .order("created_at", { ascending: false });
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = query.eq("id", ownSalesAgentQuery.data);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const usersQuery = useQuery({
    queryKey: ["backoffice-users-options"],
    enabled: canManageAgentsKyc,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("backoffice_list_team_members");
      if (error) throw error;
      return ((data || []) as any[]).filter(
        (user) => user.base_role !== "super_admin" && user.is_sales_agent === true,
      );
    },
  });

  const promoCodesQuery = useQuery({
    queryKey: ["sales-promo-codes"],
    enabled: canCaptureClient && (isSuperAdmin || ownSalesAgentQuery.isSuccess),
    queryFn: async () => {
      let query = supabase
        .from("sales_promo_codes")
        .select(`
          id,
          code,
          target_email,
          status,
          expires_at,
          created_at,
          agent_id,
          claimed_at,
          claimed_tenant_id,
          invalidated_at,
          invalidation_reason,
          last_sent_at,
          send_count,
          sales_promo_campaigns (
            id,
            name,
            ends_at,
            discount_type,
            discount_value,
            billing_targets,
            max_uses_per_tenant
          ),
          sales_promo_redemptions (
            id,
            tenant_id,
            status,
            max_uses,
            uses_consumed,
            remaining_uses,
            claimed_at,
            last_surface,
            last_used_at
          )
        `)
        .order("created_at", { ascending: false });
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = query.eq("agent_id", ownSalesAgentQuery.data);
      }
      const { data, error } = await query.limit(25);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const commissionsQuery = useQuery({
    queryKey: ["sales-commission-ledger"],
    enabled: canViewConversions && (isSuperAdmin || ownSalesAgentQuery.isSuccess),
    queryFn: async () => {
      let query = supabase
        .from("sales_commission_ledger")
        .select("id, payment_reference, total_amount, status, created_at, agent_id")
        .order("created_at", { ascending: false });
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = query.eq("agent_id", ownSalesAgentQuery.data);
      }
      const { data, error } = await query.limit(25);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const redemptionsQuery = useQuery({
    queryKey: ["sales-redemptions"],
    enabled: canViewConversions && (isSuperAdmin || ownSalesAgentQuery.isSuccess),
    queryFn: async () => {
      let query = supabase
        .from("sales_promo_redemptions")
        .select("id, owner_email, status, created_at, sales_promo_codes(code, agent_id)")
        .order("created_at", { ascending: false });
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = query.eq("sales_promo_codes.agent_id", ownSalesAgentQuery.data);
      }
      const { data, error } = await query.limit(25);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const kycRowsQuery = useQuery({
    queryKey: ["sales-agent-kyc"],
    enabled: canManageAgentsKyc,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_agent_kyc")
        .select("sales_agent_id, legal_full_name, national_id_number, national_id_type, next_of_kin_name, next_of_kin_phone, reference_person_name, reference_person_phone, past_workplace, verification_status");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["sales-agent-documents"],
    enabled: canManageAgentsKyc,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_agent_documents")
        .select("id, sales_agent_id, document_type, storage_path, review_status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const createPromoCode = useMutation({
    mutationFn: async ({
      campaignId,
      agentId,
      targetEmail,
      targetFirstName,
    }: {
      campaignId: string;
      agentId?: string;
      targetEmail: string;
      targetFirstName?: string;
    }) => {
      if (!canCaptureClient) throw new Error("You do not have permission to generate promo codes");
      const resolvedAgentId = isSuperAdmin ? agentId : ownSalesAgentQuery.data;
      if (!resolvedAgentId) {
        throw new Error("Sales agent profile not found for your account");
      }
      const { data, error } = await supabase.rpc("backoffice_generate_sales_promo_code", {
        p_campaign_id: campaignId,
        p_agent_id: resolvedAgentId,
        p_target_email: targetEmail,
        // p_target_first_name not yet in generated types but accepted by the function
        ...({ p_target_first_name: targetFirstName?.trim() || null } as object),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-promo-codes"] });
      toast.success("Promo code generated");
    },
    onError: (error: Error) => toast.error(`Failed to generate promo code: ${error.message}`),
  });

  const sendPromoEmail = useMutation({
    mutationFn: async (promoCodeId: string) => {
      const { data, error } = await supabase.functions.invoke("send-sales-promo-email", {
        body: { promoCodeId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-promo-codes"] });
      toast.success("Promo email sent");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to send promo email"),
  });

  const invalidatePromoCode = useMutation({
    mutationFn: async ({ promoCodeId, reason }: { promoCodeId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc("invalidate_sales_promo_code", {
        p_promo_code_id: promoCodeId,
        p_reason: reason || undefined,
      });
      if (error) throw error;
      const result = data as { success?: boolean; message?: string } | null;
      if (!result?.success) throw new Error(result?.message || "Failed to invalidate promo code");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-promo-codes"] });
      toast.success("Promo code invalidated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to invalidate promo code"),
  });

  const ensureOwnAgentProfile = useMutation({
    mutationFn: async () => {
      if (isSuperAdmin) return ownSalesAgentQuery.data;
      const { data, error } = await supabase.rpc("ensure_sales_agent_profile", {});
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-self"] });
      queryClient.invalidateQueries({ queryKey: ["sales-agents"] });
    },
  });

  const ensureAgentProfileForUser = useMutation({
    mutationFn: async (backofficeUserId: string) => {
      const { data, error } = await supabase.rpc("ensure_sales_agent_profile", {
        p_backoffice_user_id: backofficeUserId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agents"] });
      queryClient.invalidateQueries({ queryKey: ["sales-promo-codes"] });
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (payload: {
      name: string;
      startsAt: string;
      endsAt: string;
      discountType: "percentage" | "fixed";
      discountValue: number;
      trialEnabled: boolean;
      trialDays: number;
      billingTargets: string[];
      maxUsesPerTenant: number;
      emailSubjectTemplate: string;
      emailBodyTemplate: string;
      codeExpiryHours: number;
    }) => {
      if (!canManageCampaigns) throw new Error("You do not have permission to manage campaigns");
      const { error } = await supabase
        .from("sales_promo_campaigns")
        .insert({
          name: payload.name.trim(),
          starts_at: new Date(payload.startsAt).toISOString(),
          ends_at: new Date(payload.endsAt).toISOString(),
          discount_type: payload.discountType,
          discount_value: payload.discountValue,
          enable_trial_extension: payload.trialEnabled,
          trial_extension_days: payload.trialEnabled ? payload.trialDays : 0,
          billing_targets: payload.billingTargets,
          max_uses_per_tenant: payload.maxUsesPerTenant,
          email_subject_template: payload.emailSubjectTemplate.trim(),
          email_body_template: payload.emailBodyTemplate.trim(),
          code_expiry_hours: payload.codeExpiryHours,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-campaigns"] });
      toast.success("Campaign created");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create campaign"),
  });

  const toggleCampaign = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!canManageCampaigns) throw new Error("You do not have permission to manage campaigns");
      const { error } = await supabase
        .from("sales_promo_campaigns")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-campaigns"] }),
    onError: (error: Error) => toast.error(error.message || "Failed to update campaign"),
  });

  const createAgent = useMutation({
    mutationFn: async (payload: { backofficeUserId: string; countryCode: string; monthlySalary: number; hireDate: string | null }) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to manage agent profiles");
      const { error } = await supabase
        .from("sales_agents")
        .insert({
          backoffice_user_id: payload.backofficeUserId,
          country_code: payload.countryCode,
          monthly_base_salary: payload.monthlySalary,
          hire_date: payload.hireDate,
          employment_status: "active",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agents"] });
      toast.success("Sales agent profile created");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create agent"),
  });

  const upsertAgentProfile = useMutation({
    mutationFn: async (payload: {
      backofficeUserId: string;
      countryCode: string;
      monthlySalary: number;
      hireDate: string | null;
    }) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to update profiles");
      const { data, error } = await supabase
        .from("sales_agents")
        .upsert(
          {
            backoffice_user_id: payload.backofficeUserId,
            country_code: payload.countryCode,
            monthly_base_salary: payload.monthlySalary,
            hire_date: payload.hireDate,
            employment_status: "active",
          },
          { onConflict: "backoffice_user_id" },
        )
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agents"] });
      toast.success("Profile updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update profile"),
  });

  const upsertKyc = useMutation({
    mutationFn: async (payload: Record<string, string | null>) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to manage KYC");
      const { error } = await supabase
        .from("sales_agent_kyc")
        .upsert(payload as TablesInsert<"sales_agent_kyc">, { onConflict: "sales_agent_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-kyc"] });
      toast.success("KYC updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save KYC"),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ salesAgentId, documentType, file }: { salesAgentId: string; documentType: string; file: File }) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to upload KYC documents");
      const fileExt = file.name.split(".").pop() || "bin";
      const path = `${salesAgentId}/${documentType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("sales-agent-kyc-docs")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("sales_agent_documents")
        .insert({
          sales_agent_id: salesAgentId,
          document_type: documentType,
          storage_path: path,
          review_status: "pending",
        });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-documents"] });
      toast.success("Document uploaded");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload document"),
  });

  const updateKycVerificationStatus = useMutation({
    mutationFn: async ({ salesAgentId, status }: { salesAgentId: string; status: "pending" | "approved" | "rejected" }) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to update KYC status");
      const { error } = await supabase
        .from("sales_agent_kyc")
        .update({ verification_status: status })
        .eq("sales_agent_id", salesAgentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-kyc"] });
      toast.success("KYC verification status updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update verification status"),
  });

  const updateDocumentReviewStatus = useMutation({
    mutationFn: async ({ documentId, status }: { documentId: string; status: "pending" | "approved" | "rejected" }) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to review documents");
      const { error } = await supabase
        .from("sales_agent_documents")
        .update({ review_status: status })
        .eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-documents"] });
      toast.success("Document review status updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update document status"),
  });

  return {
    campaignsQuery,
    agentsQuery,
    usersQuery,
    promoCodesQuery,
    commissionsQuery,
    redemptionsQuery,
    kycRowsQuery,
    documentsQuery,
    createPromoCode,
    sendPromoEmail,
    invalidatePromoCode,
    ensureOwnAgentProfile,
    ensureAgentProfileForUser,
    createCampaign,
    toggleCampaign,
    createAgent,
    upsertAgentProfile,
    upsertKyc,
    uploadDocument,
    updateKycVerificationStatus,
    updateDocumentReviewStatus,
  };
}
