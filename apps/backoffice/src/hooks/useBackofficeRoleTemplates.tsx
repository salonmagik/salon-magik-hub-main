import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface RoleTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  permissions: string[];
  pages: string[];
}

export interface RoleWithStats extends RoleTemplate {
  admins_count: number;
  access_pages_count: string;
  access_subpages_count: string;
  permissions_count: string;
}

export interface PermissionKey {
  key: string;
  label: string;
  description: string | null;
}

export interface PageKey {
  key: string;
  label: string;
  route_path: string;
}

interface UpsertTemplatePayload {
  id?: string;
  name: string;
  description?: string;
  permissionKeys: string[];
  pageKeys: string[];
}

const CANONICAL_PERMISSION_KEYS: PermissionKey[] = [
  { key: "customers.view_waitlists", label: "Customers · Waitlists", description: "View waitlist applications and market interest" },
  { key: "customers.view_tenants", label: "Customers · Tenants", description: "View tenants and unlock requests" },
  { key: "customers.view_ops_monitor", label: "Customers · Ops Monitor", description: "View setup/import/reactivation monitoring" },
  { key: "plans.view", label: "Plans", description: "View and manage plans" },
  { key: "settings.view", label: "Settings", description: "View settings" },
  { key: "audit_logs.view", label: "Audit Logs", description: "View audit logs" },
  { key: "impersonation.view", label: "Impersonation", description: "Use impersonation tools" },
  { key: "sales.manage_campaigns", label: "Sales · Manage Campaigns", description: "Create, edit and activate campaigns" },
  { key: "sales.capture_client", label: "Sales · Capture Client", description: "Generate promo codes for clients" },
  { key: "sales.view_conversions", label: "Sales · View Conversions", description: "View redemptions and commission entries" },
  { key: "sales.manage_agents_kyc", label: "Sales · Manage Agents & KYC", description: "Manage agents and KYC workflows" },
  { key: "admins.manage", label: "Admins · Manage", description: "Create roles, add admins and change access" },
];

const CANONICAL_PAGE_KEYS: PageKey[] = [
  { key: "dashboard", label: "Dashboard", route_path: "/" },
  { key: "customers_waitlists", label: "Customers · Waitlists", route_path: "/customers/waitlists" },
  { key: "customers_tenants", label: "Customers · Tenants", route_path: "/customers/tenants" },
  { key: "customers_ops_monitor", label: "Customers · Ops Monitor", route_path: "/customers/ops-monitor" },
  { key: "feature_flags", label: "Feature Flags", route_path: "/feature-flags" },
  { key: "plans", label: "Plans", route_path: "/plans" },
  { key: "sales_campaigns", label: "Sales Ops · Campaigns", route_path: "/sales/campaigns" },
  { key: "sales_capture_client", label: "Sales Ops · Capture Client", route_path: "/sales/capture-client" },
  { key: "sales_conversions", label: "Sales Ops · Conversions", route_path: "/sales/conversions" },
  { key: "admins", label: "Admins", route_path: "/admins" },
  { key: "audit_logs", label: "Audit Logs", route_path: "/audit-logs" },
  { key: "impersonation", label: "Impersonation", route_path: "/impersonation" },
  { key: "settings", label: "Settings", route_path: "/settings" },
];

export function useBackofficeRoleTemplates() {
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["backoffice-role-templates"],
    queryFn: async (): Promise<RoleTemplate[]> => {
      const { data, error } = await (supabase.rpc as any)("backoffice_list_role_templates");
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        is_active: row.is_active,
        is_system: row.is_system,
        permissions: row.permissions || [],
        pages: row.pages || [],
      }));
    },
  });

  const roleStatsQuery = useQuery({
    queryKey: ["backoffice-roles-with-stats"],
    queryFn: async (): Promise<RoleWithStats[]> => {
      const { data, error } = await (supabase.rpc as any)("backoffice_list_roles_with_stats");
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        is_active: row.is_active,
        is_system: row.is_system,
        permissions: row.permissions || [],
        pages: row.pages || [],
        admins_count: Number(row.admins_count || 0),
        access_pages_count: row.access_pages_count || "0",
        access_subpages_count: row.access_subpages_count || "0",
        permissions_count: row.permissions_count || "0",
      }));
    },
  });

  const permissionKeysQuery = useQuery({
    queryKey: ["backoffice-permission-keys"],
    queryFn: async (): Promise<PermissionKey[]> => {
      const { data, error } = await (supabase
        .from("backoffice_permission_keys" as any)
        .select("key, label, description")
        .order("label", { ascending: true }) as any);
      if (error) throw error;
      const dbMap = new Map<string, PermissionKey>(((data || []) as PermissionKey[]).map((item) => [item.key, item]));
      return CANONICAL_PERMISSION_KEYS.map((item) => dbMap.get(item.key) ?? item);
    },
  });

  const pageKeysQuery = useQuery({
    queryKey: ["backoffice-page-keys"],
    queryFn: async (): Promise<PageKey[]> => {
      const { data, error } = await (supabase
        .from("backoffice_page_keys" as any)
        .select("key, label, route_path")
        .order("label", { ascending: true }) as any);
      if (error) throw error;
      const dbMap = new Map<string, PageKey>(((data || []) as PageKey[]).map((item) => [item.key, item]));
      return CANONICAL_PAGE_KEYS.map((item) => dbMap.get(item.key) ?? item);
    },
  });

  const assignTemplate = useMutation({
    mutationFn: async ({ backofficeUserId, roleTemplateId }: { backofficeUserId: string; roleTemplateId: string }) => {
      const { error } = await (supabase.rpc as any)("backoffice_assign_user_role", {
        p_backoffice_user_id: backofficeUserId,
        p_role_id: roleTemplateId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-role-templates"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-roles-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-profile"] });
      toast.success("Role assigned");
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign role: ${error.message}`);
    },
  });

  const upsertTemplate = useMutation({
    mutationFn: async ({ id, name, description, permissionKeys, pageKeys }: UpsertTemplatePayload) => {
      if (id) {
        const { error } = await (supabase.rpc as any)("backoffice_update_role", {
          p_role_id: id,
          p_name: name.trim(),
          p_description: description?.trim() || null,
          p_permission_keys: permissionKeys,
          p_page_keys: pageKeys,
          p_is_active: true,
        });
        if (error) throw error;
        return;
      }

      const { error } = await (supabase.rpc as any)("backoffice_create_role", {
        p_name: name.trim(),
        p_description: description?.trim() || null,
        p_permission_keys: permissionKeys,
        p_page_keys: pageKeys,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-role-templates"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-roles-with-stats"] });
      toast.success("Role saved");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save role: ${error.message}`);
    },
  });

  const toggleTemplateActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const target = (templatesQuery.data || []).find((template) => template.id === id);
      if (!target) throw new Error("Role not found");
      const { error } = await (supabase.rpc as any)("backoffice_update_role", {
        p_role_id: id,
        p_name: target.name,
        p_description: target.description || null,
        p_permission_keys: target.permissions,
        p_page_keys: target.pages,
        p_is_active: isActive,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-role-templates"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-roles-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      toast.success("Role updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
  });

  return {
    templates: templatesQuery.data || [],
    roleStats: roleStatsQuery.data || [],
    isLoadingTemplates: templatesQuery.isLoading || roleStatsQuery.isLoading,
    templatesError: templatesQuery.error || roleStatsQuery.error,
    permissionKeys: permissionKeysQuery.data || [],
    pageKeys: pageKeysQuery.data || [],
    isLoadingKeys: permissionKeysQuery.isLoading || pageKeysQuery.isLoading,
    keysError: permissionKeysQuery.error || pageKeysQuery.error,
    assignTemplate,
    upsertTemplate,
    toggleTemplateActive,
  };
}
