import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Checkbox } from "@ui/checkbox";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import { Badge } from "@ui/badge";
import { Loader2, Save, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@ui/ui/use-toast";
import { DEFAULT_ROLE_PERMISSIONS } from "@/hooks/usePermissions";
import type { Database } from "@supabase-client";

type AppRole = Database["public"]["Enums"]["app_role"];

const MODULES = [
  { key: "dashboard", label: "Dashboard", description: "View dashboard and stats" },
  { key: "appointments", label: "All Appointments", description: "Manage all appointments" },
  { key: "appointments:own", label: "Own Appointments", description: "View and manage own appointments only" },
  { key: "calendar", label: "Calendar", description: "View calendar" },
  { key: "customers", label: "Customers", description: "View and manage customers" },
  { key: "customers:flag", label: "Flag Customers", description: "Flag/block customers" },
  { key: "customers:vip", label: "VIP Customers", description: "Mark customers as VIP" },
  { key: "customers:delete", label: "Delete Customers", description: "Delete customer records" },
  { key: "services", label: "Products & Services", description: "Manage catalog" },
  { key: "payments", label: "Payments", description: "View and process payments" },
  { key: "reports", label: "Reports", description: "View analytics and reports" },
  { key: "messaging", label: "Messaging", description: "Send messages to customers" },
  { key: "journal", label: "Cash Tracker", description: "View and manage Cash Tracker entries" },
  { key: "staff", label: "Staff", description: "Manage staff members" },
  { key: "settings", label: "Settings", description: "Manage salon settings" },
];

const ROLES: AppRole[] = ["owner", "manager", "supervisor", "receptionist", "staff"];

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

interface RolePermission {
  id?: string;
  role: AppRole;
  module: string;
  allowed: boolean;
}

export function PermissionsTab() {
  const { currentTenant } = useAuth();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current permissions
  useEffect(() => {
    if (!currentTenant?.id) return;

    const fetchPermissions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("role_permissions")
          .select("*")
          .eq("tenant_id", currentTenant.id);

        if (error) throw error;

        // If no permissions exist, use defaults
        if (!data || data.length === 0) {
          const defaults: RolePermission[] = [];
          for (const role of ROLES) {
            for (const module of MODULES) {
              defaults.push({
                role,
                module: module.key,
                allowed: DEFAULT_ROLE_PERMISSIONS[role]?.[module.key] ?? false,
              });
            }
          }
          setPermissions(defaults);
        } else {
          // Map existing permissions and fill in any missing ones with defaults
          const existing = new Map(data.map((p) => [`${p.role}-${p.module}`, p]));
          const merged: RolePermission[] = [];
          
          for (const role of ROLES) {
            for (const module of MODULES) {
              const key = `${role}-${module.key}`;
              const existing_perm = existing.get(key);
              if (existing_perm) {
                merged.push({
                  id: existing_perm.id,
                  role: existing_perm.role,
                  module: existing_perm.module,
                  allowed: existing_perm.allowed,
                });
              } else {
                merged.push({
                  role,
                  module: module.key,
                  allowed: DEFAULT_ROLE_PERMISSIONS[role]?.[module.key] ?? false,
                });
              }
            }
          }
          setPermissions(merged);
        }
      } catch (err) {
        console.error("Error fetching permissions:", err);
        toast({ title: "Error", description: "Failed to load permissions", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermissions();
  }, [currentTenant?.id]);

  const togglePermission = (role: AppRole, module: string) => {
    // Owner permissions cannot be changed
    if (role === "owner") return;

    setPermissions((prev) =>
      prev.map((p) => {
        if (p.role === role && p.module === module) {
          return { ...p, allowed: !p.allowed };
        }
        return p;
      })
    );
    setHasChanges(true);
  };

  const getPermission = (role: AppRole, module: string): boolean => {
    const perm = permissions.find((p) => p.role === role && p.module === module);
    return perm?.allowed ?? false;
  };

  const handleSave = async () => {
    if (!currentTenant?.id) return;

    setIsSaving(true);
    try {
      // Upsert all permissions (excluding owner which is always full access)
      const nonOwnerPermissions = permissions.filter((p) => p.role !== "owner");
      
      const upsertData = nonOwnerPermissions.map((p) => ({
        tenant_id: currentTenant.id,
        role: p.role,
        module: p.module,
        allowed: p.allowed,
      }));

      // Delete existing and insert new (simpler than upsert with composite key)
      const { error: deleteError } = await supabase
        .from("role_permissions")
        .delete()
        .eq("tenant_id", currentTenant.id)
        .neq("role", "owner");

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from("role_permissions")
        .insert(upsertData);

      if (insertError) throw insertError;

      setHasChanges(false);
      toast({ title: "Saved", description: "Role permissions updated successfully" });
    } catch (err) {
      console.error("Error saving permissions:", err);
      toast({ title: "Error", description: "Failed to save permissions", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-[22px] border-black/[0.06] bg-white shadow-sm">
        <CardHeader className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <CardTitle className="text-base font-normal">Roles & Permissions</CardTitle>
          <CardDescription className="text-[13px]">Configure what each role can access</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[22px] border-black/[0.06] bg-white shadow-sm">
      <CardHeader className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-normal">Roles & Permissions</CardTitle>
            <CardDescription className="mt-1 text-[13px]">
              Configure what each role can access in the system
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving} className="h-10 gap-2 rounded-full px-5">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="scrollbar-hide overflow-x-auto rounded-[14px] border border-black/[0.06]">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#fbf9f6]">
              <tr>
                <th className="min-w-[200px] p-3 text-left text-xs font-normal uppercase tracking-[0.04em] text-muted-foreground">
                  Module
                </th>
                {ROLES.map((role) => (
                  <th key={role} className="min-w-[110px] p-3 text-center font-medium">
                    <Badge
                      variant={role === "owner" ? "default" : "secondary"}
                      className="rounded-full px-3 py-1 font-normal"
                    >
                      {ROLE_LABELS[role]}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((module) => (
                <tr key={module.key} className="border-t border-black/[0.06] bg-white hover:bg-[#fbf9f6]">
                  <td className="p-3.5">
                    <div>
                      <span className="font-medium">{module.label}</span>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="p-3.5 text-center">
                      <Checkbox
                        checked={getPermission(role, module.key)}
                        onCheckedChange={() => togglePermission(role, module.key)}
                        disabled={role === "owner"} // Owner always has full access
                        className="mx-auto"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-[14px] bg-[#f2eefa] p-3.5">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <strong>Owner</strong> permissions cannot be modified as they always have full access.
            Changes to permissions take effect immediately after saving.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
