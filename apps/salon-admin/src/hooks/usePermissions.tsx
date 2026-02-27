import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Enums } from "@supabase-client";

type AppRole = Enums<"app_role">;

interface RolePermission {
  id: string;
  tenant_id: string;
  role: AppRole;
  module: string;
  allowed: boolean;
}

interface UserPermissionOverride {
  id: string;
  tenant_id: string;
  user_id: string;
  module: string;
  allowed: boolean;
}

// Default permissions by role - used to seed new tenants
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Record<string, boolean>> = {
  owner: {
    dashboard: true,
    salons_overview: true,
    appointments: true,
    "appointments:own": true,
    calendar: true,
    customers: true,
    "customers:flag": true,
    "customers:vip": true,
    "customers:delete": true,
    services: true,
    payments: true,
    reports: true,
    messaging: true,
    journal: true,
    staff: true,
    audit_log: true,
    settings: true,
    "catalog:edit": true,
    "catalog:delete": true,
    "catalog:request_delete": true,
    "catalog:archive": true,
    "catalog:flag": true,
  },
  manager: {
    dashboard: true,
    salons_overview: true,
    appointments: true,
    "appointments:own": true,
    calendar: true,
    customers: true,
    "customers:flag": true,
    "customers:vip": true,
    "customers:delete": false,
    services: true,
    payments: true,
    reports: true,
    messaging: true,
    journal: true,
    staff: true,
    audit_log: false,
    settings: false,
    "catalog:edit": true,
    "catalog:delete": false,
    "catalog:request_delete": true,
    "catalog:archive": true,
    "catalog:flag": true,
  },
  supervisor: {
    dashboard: true,
    salons_overview: false,
    appointments: true,
    "appointments:own": true,
    calendar: true,
    customers: true,
    "customers:flag": false,
    "customers:vip": false,
    "customers:delete": false,
    services: true,
    payments: false,
    reports: false,
    messaging: true,
    journal: false,
    staff: false,
    audit_log: false,
    settings: false,
    "catalog:edit": false,
    "catalog:delete": false,
    "catalog:request_delete": true,
    "catalog:archive": false,
    "catalog:flag": true,
  },
  receptionist: {
    dashboard: true,
    salons_overview: false,
    appointments: true,
    "appointments:own": true,
    calendar: true,
    customers: true,
    "customers:flag": false,
    "customers:vip": false,
    "customers:delete": false,
    services: false,
    payments: false,
    reports: false,
    messaging: true,
    journal: false,
    staff: false,
    audit_log: false,
    settings: false,
    "catalog:edit": false,
    "catalog:delete": false,
    "catalog:request_delete": false,
    "catalog:archive": false,
    "catalog:flag": false,
  },
  staff: {
    dashboard: false,
    salons_overview: false,
    appointments: false,
    "appointments:own": true,
    calendar: false,
    customers: false,
    "customers:flag": false,
    "customers:vip": false,
    "customers:delete": false,
    services: false,
    payments: false,
    reports: false,
    messaging: false,
    journal: false,
    staff: false,
    audit_log: false,
    settings: false,
    "catalog:edit": false,
    "catalog:delete": false,
    "catalog:request_delete": false,
    "catalog:archive": false,
    "catalog:flag": false,
  },
};

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  salons_overview: "Salons Overview",
  appointments: "All Appointments",
  "appointments:own": "Own Appointments",
  calendar: "Calendar",
  customers: "Customers",
  "customers:flag": "Flag Customers",
  "customers:vip": "Make VIP",
  "customers:delete": "Delete Customers",
  services: "Products & Services",
  payments: "Payments",
  reports: "Reports",
  messaging: "Messaging",
  journal: "Journal",
  staff: "Staff Management",
  audit_log: "Audit Log",
  settings: "Settings",
  "catalog:edit": "Edit Catalog Items",
  "catalog:delete": "Delete Catalog Items",
  "catalog:request_delete": "Request Catalog Deletion",
  "catalog:archive": "Archive Catalog Items",
  "catalog:flag": "Flag Catalog Items",
};

export function usePermissions() {
  const { currentTenant, user, roles } = useAuth();
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [userOverrides, setUserOverrides] = useState<UserPermissionOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get current user's role in this tenant
  const currentRole = useMemo(() => {
    if (!currentTenant || !roles.length) return null;
    const userRole = roles.find((r) => r.tenant_id === currentTenant.id);
    return userRole?.role || null;
  }, [currentTenant, roles]);

  const isOwner = currentRole === "owner";

  // Fetch permissions
  const fetchPermissions = useCallback(async () => {
    if (!currentTenant?.id) {
      setRolePermissions([]);
      setUserOverrides([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Fetch role permissions
      const { data: roleData, error: roleError } = await supabase
        .from("role_permissions")
        .select("*")
        .eq("tenant_id", currentTenant.id);

      if (roleError) throw roleError;

      // Fetch user overrides
      const { data: overrideData, error: overrideError } = await supabase
        .from("user_permission_overrides")
        .select("*")
        .eq("tenant_id", currentTenant.id);

      if (overrideError) throw overrideError;

      setRolePermissions((roleData as RolePermission[]) || []);
      setUserOverrides((overrideData as UserPermissionOverride[]) || []);
    } catch (error) {
      console.error("Error fetching permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Check if user has permission for a module
  const hasPermission = useCallback(
    (module: string): boolean => {
      if (!user?.id || !currentTenant?.id || !currentRole) {
        return false;
      }

      // Owners always have full access across pages/actions.
      if (currentRole === "owner") {
        return true;
      }

      // Check for user-specific override first
      const override = userOverrides.find(
        (o) => o.user_id === user.id && o.module === module
      );
      if (override) {
        return override.allowed;
      }

      // Check role permissions from database
      const rolePermission = rolePermissions.find(
        (rp) => rp.role === currentRole && rp.module === module
      );
      if (rolePermission) {
        return rolePermission.allowed;
      }

      // Fall back to default permissions
      return DEFAULT_ROLE_PERMISSIONS[currentRole]?.[module] ?? false;
    },
    [user?.id, currentTenant?.id, currentRole, rolePermissions, userOverrides]
  );

  // Get all permissions for current user
  const permissions = useMemo(() => {
    const result: Record<string, boolean> = {};
    Object.keys(MODULE_LABELS).forEach((module) => {
      result[module] = hasPermission(module);
    });
    return result;
  }, [hasPermission]);

  return {
    permissions,
    hasPermission,
    isLoading,
    isOwner,
    currentRole,
    rolePermissions,
    userOverrides,
    refetch: fetchPermissions,
  };
}

/**
 * Seed default role permissions for a new tenant
 */
export async function seedDefaultPermissions(tenantId: string): Promise<void> {
  const permissionInserts: Array<{
    tenant_id: string;
    role: AppRole;
    module: string;
    allowed: boolean;
  }> = [];

  (Object.keys(DEFAULT_ROLE_PERMISSIONS) as AppRole[]).forEach((role) => {
    Object.entries(DEFAULT_ROLE_PERMISSIONS[role]).forEach(([module, allowed]) => {
      permissionInserts.push({
        tenant_id: tenantId,
        role,
        module,
        allowed,
      });
    });
  });

  const { error } = await supabase.from("role_permissions").insert(permissionInserts);

  if (error) {
    console.error("Error seeding default permissions:", error);
    throw error;
  }
}
