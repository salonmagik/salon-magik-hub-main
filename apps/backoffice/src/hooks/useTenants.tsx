 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/lib/supabase";
 import type { Tables } from "@/lib/supabase";
 
 type Tenant = Tables<"tenants">;
 
 export interface TenantWithStats extends Tenant {
   staff_count: number;
   owner_email: string | null;
 }
 
 export function useTenants() {
   return useQuery({
     queryKey: ["backoffice-tenants"],
     queryFn: async () => {
       // Get all tenants
       const { data: tenants, error: tenantsError } = await supabase
         .from("tenants")
         .select("*")
         .order("created_at", { ascending: false });
 
       if (tenantsError) throw tenantsError;
 
       // Get staff counts per tenant
       const { data: roles, error: rolesError } = await supabase
         .from("user_roles")
         .select("tenant_id, user_id, role");
 
       if (rolesError) throw rolesError;
 
       // Get owner profiles for emails
       const ownerUserIds = roles
         ?.filter(r => r.role === "owner")
         .map(r => r.user_id) || [];
 
       let profilesMap = new Map<string, string>();
       if (ownerUserIds.length > 0) {
         const { data: profiles } = await supabase
           .from("profiles")
           .select("user_id, full_name")
           .in("user_id", ownerUserIds);
 
         profiles?.forEach(p => profilesMap.set(p.user_id, p.full_name));
       }
 
       // Build tenant stats
       const tenantStatsMap = new Map<string, { staff_count: number; owner_user_id: string | null }>();
       roles?.forEach(role => {
         const existing = tenantStatsMap.get(role.tenant_id) || { staff_count: 0, owner_user_id: null };
         existing.staff_count += 1;
         if (role.role === "owner" && !existing.owner_user_id) {
           existing.owner_user_id = role.user_id;
         }
         tenantStatsMap.set(role.tenant_id, existing);
       });
 
       // Combine data
       const tenantsWithStats: TenantWithStats[] = tenants?.map(tenant => {
         const stats = tenantStatsMap.get(tenant.id) || { staff_count: 0, owner_user_id: null };
         return {
           ...tenant,
           staff_count: stats.staff_count,
           owner_email: stats.owner_user_id ? profilesMap.get(stats.owner_user_id) || null : null,
         };
       }) || [];
 
       return tenantsWithStats;
     },
   });
 }