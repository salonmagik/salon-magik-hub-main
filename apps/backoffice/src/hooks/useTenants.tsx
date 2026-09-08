 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/lib/supabase";
 import type { Tables } from "@/lib/supabase";

 type Tenant = Tables<"tenants">;

 export interface TenantOwner {
   userId: string;
   fullName: string | null;
   email?: string;
 }

 export interface TenantWithStats extends Tenant {
   staff_count: number;
   owners: TenantOwner[];
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
         .select("tenant_id, user_id, role, is_active");

       if (rolesError) throw rolesError;

       // Get owner profiles for names. Real email addresses require
       // auth.users, which isn't exposed to this client — the per-tenant
       // get_tenant_owners RPC (self-gated, security definer) is what
       // resolves those, for the one tenant a detail view or the
       // add-co-owner dialog is open on, not for this bulk list.
       const ownerUserIds = [...new Set(
         (roles || [])
           .filter(r => r.role === "owner" && (r.is_active ?? true))
           .map(r => r.user_id),
       )];

      const profilesMap = new Map<string, string | null>();
       if (ownerUserIds.length > 0) {
         const { data: profiles } = await supabase
           .from("profiles")
           .select("user_id, full_name")
           .in("user_id", ownerUserIds);

         profiles?.forEach(p => profilesMap.set(p.user_id, p.full_name));
       }

       // Build tenant stats
       const tenantStatsMap = new Map<string, { staff_count: number; ownerUserIds: string[] }>();
       roles?.forEach(role => {
         const existing = tenantStatsMap.get(role.tenant_id) || { staff_count: 0, ownerUserIds: [] };
         existing.staff_count += 1;
         if (role.role === "owner" && (role.is_active ?? true)) {
           existing.ownerUserIds.push(role.user_id);
         }
         tenantStatsMap.set(role.tenant_id, existing);
       });

       // Combine data
       const tenantsWithStats: TenantWithStats[] = tenants?.map(tenant => {
         const stats = tenantStatsMap.get(tenant.id) || { staff_count: 0, ownerUserIds: [] };
         return {
           ...tenant,
           staff_count: stats.staff_count,
           owners: stats.ownerUserIds.map(userId => ({
             userId,
             fullName: profilesMap.get(userId) ?? null,
           })),
         };
       }) || [];

       return tenantsWithStats;
     },
   });
 }
