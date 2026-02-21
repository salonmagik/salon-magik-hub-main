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

export function useBackofficeRoleTemplates() {
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["backoffice-role-templates"],
    queryFn: async (): Promise<RoleTemplate[]> => {
      const { data, error } = await (supabase
        .from("backoffice_role_templates" as any)
        .select(
          "id, name, description, is_active, is_system, backoffice_role_template_permissions(permission_key), backoffice_role_template_pages(page_key)",
        )
        .order("is_system", { ascending: false })
        .order("name", { ascending: true }) as any);
      if (error) throw error;

      return ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        is_active: row.is_active,
        is_system: row.is_system,
        permissions: (row.backoffice_role_template_permissions ?? [])
          .map((item: { permission_key?: string }) => item.permission_key)
          .filter(Boolean),
        pages: (row.backoffice_role_template_pages ?? [])
          .map((item: { page_key?: string }) => item.page_key)
          .filter(Boolean),
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
      return (data ?? []) as PermissionKey[];
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
      return (data ?? []) as PageKey[];
    },
  });

  const assignTemplate = useMutation({
    mutationFn: async ({
      backofficeUserId,
      roleTemplateId,
    }: {
      backofficeUserId: string;
      roleTemplateId: string;
    }) => {
      const { error } = await (supabase
        .from("backoffice_user_role_assignments" as any)
        .upsert(
          {
            backoffice_user_id: backofficeUserId,
            role_template_id: roleTemplateId,
          },
          { onConflict: "backoffice_user_id" },
        ) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-profile"] });
      toast.success("Role template assigned");
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign role template: ${error.message}`);
    },
  });

  const upsertTemplate = useMutation({
    mutationFn: async ({ id, name, description, permissionKeys, pageKeys }: UpsertTemplatePayload) => {
      let templateId = id;

      if (templateId) {
        const { error } = await (supabase
          .from("backoffice_role_templates" as any)
          .update({ name: name.trim(), description: description?.trim() || null })
          .eq("id", templateId)
          .eq("is_system", false) as any);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase
          .from("backoffice_role_templates" as any)
          .insert({ name: name.trim(), description: description?.trim() || null, is_system: false, is_active: true })
          .select("id")
          .single() as any);
        if (error) throw error;
        templateId = data.id as string;
      }

      if (!templateId) {
        throw new Error("Template ID missing after save.");
      }

      const { error: deletePermissionError } = await (supabase
        .from("backoffice_role_template_permissions" as any)
        .delete()
        .eq("template_id", templateId) as any);
      if (deletePermissionError) throw deletePermissionError;

      const { error: deletePageError } = await (supabase
        .from("backoffice_role_template_pages" as any)
        .delete()
        .eq("template_id", templateId) as any);
      if (deletePageError) throw deletePageError;

      if (permissionKeys.length > 0) {
        const { error: insertPermissionError } = await (supabase
          .from("backoffice_role_template_permissions" as any)
          .insert(permissionKeys.map((permissionKey) => ({ template_id: templateId, permission_key: permissionKey })) as any) as any);
        if (insertPermissionError) throw insertPermissionError;
      }

      if (pageKeys.length > 0) {
        const { error: insertPageError } = await (supabase
          .from("backoffice_role_template_pages" as any)
          .insert(pageKeys.map((pageKey) => ({ template_id: templateId, page_key: pageKey })) as any) as any);
        if (insertPageError) throw insertPageError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-role-templates"] });
      toast.success("Role template saved");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save template: ${error.message}`);
    },
  });

  const toggleTemplateActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await (supabase
        .from("backoffice_role_templates" as any)
        .update({ is_active: isActive })
        .eq("id", id)
        .eq("is_system", false) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-role-templates"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      toast.success("Template updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update template: ${error.message}`);
    },
  });

  return {
    templates: templatesQuery.data ?? [],
    isLoadingTemplates: templatesQuery.isLoading,
    permissionKeys: permissionKeysQuery.data ?? [],
    pageKeys: pageKeysQuery.data ?? [],
    isLoadingKeys: permissionKeysQuery.isLoading || pageKeysQuery.isLoading,
    assignTemplate,
    upsertTemplate,
    toggleTemplateActive,
  };
}
