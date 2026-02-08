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
  { key: "journal", label: "Journal", description: "View and manage journal entries" },
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
      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
          <CardDescription>Configure what each role can access</CardDescription>
        </CardHeader>
        <CardContent>
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Roles & Permissions</CardTitle>
            <CardDescription>Configure what each role can access in the system</CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium min-w-[200px]">Module</th>
                {ROLES.map((role) => (
                  <th key={role} className="text-center p-3 font-medium min-w-[100px]">
                    <Badge variant={role === "owner" ? "default" : "secondary"}>
                      {ROLE_LABELS[role]}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((module, idx) => (
                <tr key={module.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="p-3">
                    <div>
                      <span className="font-medium">{module.label}</span>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="text-center p-3">
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

        <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-start gap-2">
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
