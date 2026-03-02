import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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
      const { data, error } = await (supabase
        .from("sales_agents" as never)
        .select("id")
        .eq("backoffice_user_id", backofficeUser!.id)
        .maybeSingle() as never);
      if (error) throw error;
      return (data?.id as string | undefined) || null;
    },
  });

  const campaignsQuery = useQuery({
    queryKey: ["sales-campaigns"],
    enabled: canCaptureClient || canManageCampaigns,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_campaigns" as never)
        .select("id, name, starts_at, ends_at, is_active, discount_type, discount_value, enable_trial_extension, trial_extension_days")
        .order("created_at", { ascending: false }) as never);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const agentsQuery = useQuery({
    queryKey: ["sales-agents"],
    enabled: canCaptureClient || canManageAgentsKyc,
    queryFn: async () => {
      let query = (supabase
        .from("sales_agents" as never)
        .select("id, backoffice_user_id, employment_status, country_code, monthly_base_salary, hire_date, backoffice_users(user_id, email_domain)")
        .order("created_at", { ascending: false }) as never);
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = (query.eq("id", ownSalesAgentQuery.data) as never);
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
      const { data, error } = await (supabase.rpc as any)("backoffice_list_team_members");
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
      let query = (supabase
        .from("sales_promo_codes" as never)
        .select("id, code, target_email, status, expires_at, created_at, agent_id")
        .order("created_at", { ascending: false })
        .limit(25) as never);
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = (query.eq("agent_id", ownSalesAgentQuery.data) as never);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const commissionsQuery = useQuery({
    queryKey: ["sales-commission-ledger"],
    enabled: canViewConversions && (isSuperAdmin || ownSalesAgentQuery.isSuccess),
    queryFn: async () => {
      let query = (supabase
        .from("sales_commission_ledger" as never)
        .select("id, payment_reference, total_amount, status, created_at, agent_id")
        .order("created_at", { ascending: false })
        .limit(25) as never);
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = (query.eq("agent_id", ownSalesAgentQuery.data) as never);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const redemptionsQuery = useQuery({
    queryKey: ["sales-redemptions"],
    enabled: canViewConversions && (isSuperAdmin || ownSalesAgentQuery.isSuccess),
    queryFn: async () => {
      let query = (supabase
        .from("sales_promo_redemptions" as never)
        .select("id, owner_email, status, created_at, sales_promo_codes(code, agent_id)")
        .order("created_at", { ascending: false })
        .limit(25) as never);
      if (!isSuperAdmin && ownSalesAgentQuery.data) {
        query = (query.eq("sales_promo_codes.agent_id", ownSalesAgentQuery.data) as never);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const kycRowsQuery = useQuery({
    queryKey: ["sales-agent-kyc"],
    enabled: canManageAgentsKyc,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_agent_kyc" as never)
        .select("sales_agent_id, legal_full_name, national_id_number, national_id_type, next_of_kin_name, next_of_kin_phone, reference_person_name, reference_person_phone, past_workplace, verification_status") as never);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["sales-agent-documents"],
    enabled: canManageAgentsKyc,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_agent_documents" as never)
        .select("id, sales_agent_id, document_type, storage_path, review_status, created_at")
        .order("created_at", { ascending: false }) as never);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const createPromoCode = useMutation({
    mutationFn: async ({ campaignId, agentId, targetEmail }: { campaignId: string; agentId?: string; targetEmail: string }) => {
      if (!canCaptureClient) throw new Error("You do not have permission to generate promo codes");
      const resolvedAgentId = isSuperAdmin ? agentId : ownSalesAgentQuery.data;
      if (!resolvedAgentId) {
        throw new Error("Sales agent profile not found for your account");
      }
      const { data, error } = await (supabase.rpc as never)("backoffice_generate_sales_promo_code", {
        p_campaign_id: campaignId,
        p_agent_id: resolvedAgentId,
        p_target_email: targetEmail,
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

  const ensureOwnAgentProfile = useMutation({
    mutationFn: async () => {
      if (isSuperAdmin) return ownSalesAgentQuery.data;
      const { data, error } = await (supabase.rpc as never)("ensure_sales_agent_profile", {
        p_backoffice_user_id: null,
      });
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
      const { data, error } = await (supabase.rpc as never)("ensure_sales_agent_profile", {
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
    }) => {
      if (!canManageCampaigns) throw new Error("You do not have permission to manage campaigns");
      const { error } = await (supabase
        .from("sales_promo_campaigns" as never)
        .insert({
          name: payload.name.trim(),
          starts_at: new Date(payload.startsAt).toISOString(),
          ends_at: new Date(payload.endsAt).toISOString(),
          discount_type: payload.discountType,
          discount_value: payload.discountValue,
          enable_trial_extension: payload.trialEnabled,
          trial_extension_days: payload.trialEnabled ? payload.trialDays : 0,
          is_active: true,
        } as never) as never);
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
      const { error } = await (supabase
        .from("sales_promo_campaigns" as never)
        .update({ is_active: isActive } as never)
        .eq("id", id) as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-campaigns"] }),
    onError: (error: Error) => toast.error(error.message || "Failed to update campaign"),
  });

  const createAgent = useMutation({
    mutationFn: async (payload: { backofficeUserId: string; countryCode: string; monthlySalary: number; hireDate: string | null }) => {
      if (!canManageAgentsKyc) throw new Error("You do not have permission to manage agent profiles");
      const { error } = await (supabase
        .from("sales_agents" as never)
        .insert({
          backoffice_user_id: payload.backofficeUserId,
          country_code: payload.countryCode,
          monthly_base_salary: payload.monthlySalary,
          hire_date: payload.hireDate,
          employment_status: "active",
        } as never) as never);
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
      const { data, error } = await (supabase
        .from("sales_agents" as never)
        .upsert(
          {
            backoffice_user_id: payload.backofficeUserId,
            country_code: payload.countryCode,
            monthly_base_salary: payload.monthlySalary,
            hire_date: payload.hireDate,
            employment_status: "active",
          } as never,
          { onConflict: "backoffice_user_id" },
        )
        .select("id")
        .single() as never);
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
      const { error } = await (supabase
        .from("sales_agent_kyc" as never)
        .upsert(payload as never, { onConflict: "sales_agent_id" }) as never);
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

      const { error: insertError } = await (supabase
        .from("sales_agent_documents" as never)
        .insert({
          sales_agent_id: salesAgentId,
          document_type: documentType,
          storage_path: path,
          review_status: "pending",
        } as never) as never);
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
      const { error } = await (supabase
        .from("sales_agent_kyc" as never)
        .update({ verification_status: status } as never)
        .eq("sales_agent_id", salesAgentId) as never);
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
      const { error } = await (supabase
        .from("sales_agent_documents" as never)
        .update({ review_status: status } as never)
        .eq("id", documentId) as never);
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
