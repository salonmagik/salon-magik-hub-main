import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useTenants } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Building2, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AddTenantOwnerDialog } from "@/components/AddTenantOwnerDialog";
import { MigrateTenantBillingDialog } from "@/components/MigrateTenantBillingDialog";

interface ChainUnlockRequestRow {
  id: string;
  tenant_id: string;
  requested_locations: number;
  allowed_locations: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function TenantWorkspacePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  const { backofficeUser } = useBackofficeAuth();
  const { data: tenants, isLoading } = useTenants();
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [migrateBillingOpen, setMigrateBillingOpen] = useState(false);

  const tenant = tenants?.find((t) => t.id === tenantId) || null;

  const { data: chainUnlockRequests = [] } = useQuery({
    queryKey: ["chain-unlock-requests", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("tenant_chain_unlock_requests" as any)
        .select("id, tenant_id, requested_locations, allowed_locations, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "pending") as any);
      if (error) throw error;
      return (data || []) as ChainUnlockRequestRow[];
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["tenant-workspace-staff", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", tenantId as string);
      if (rolesError) throw rolesError;
      const userIds = (roles || []).map((r) => r.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (profilesError) throw profilesError;
      const nameByUserId = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
      return (roles || []).map((r) => ({
        userId: r.user_id,
        role: r.role,
        name: nameByUserId.get(r.user_id) || "Unnamed",
      }));
    },
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["tenant-workspace-activity", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, created_at")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const approveUnlockMutation = useMutation({
    mutationFn: async (request: ChainUnlockRequestRow) => {
      const { error } = await (supabase.rpc as any)("approve_chain_custom_unlock", {
        p_tenant_id: request.tenant_id,
        p_allowed_locations: request.requested_locations,
        p_amount: 0,
        p_currency: "USD",
        p_reason: "Approved from tenant workspace.",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chain unlock approved");
      queryClient.invalidateQueries({ queryKey: ["chain-unlock-requests", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-tenants"] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to approve unlock"),
  });

  if (isLoading) {
    return (
      <BackofficeLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </BackofficeLayout>
    );
  }

  if (!tenant) {
    return (
      <BackofficeLayout>
        <div className="backoffice-page">
          <p className="text-muted-foreground">Salon not found.</p>
          <Link to="/customers/tenants" className="text-sm font-medium text-primary">
            ← Back to salons
          </Link>
        </div>
      </BackofficeLayout>
    );
  }

  const pendingUnlock = chainUnlockRequests[0] || null;

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="text-[12.5px] text-muted-foreground">
          <Link to="/customers/tenants" className="text-muted-foreground hover:text-foreground">Salons</Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">{tenant.name}</span>
        </div>

        <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-muted">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-5 w-5 text-muted-foreground" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[19px] font-bold">{tenant.name}</h1>
                <Badge variant={tenant.subscription_status === "active" ? "success" : "outline"} className="cursor-default">
                  {tenant.subscription_status}
                </Badge>
                <Badge variant="outline">{tenant.plan || "No plan"}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tenant.country} · {tenant.staff_count} staff · joined {format(new Date(tenant.created_at), "MMM yyyy")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMigrateBillingOpen(true)}>
              Migrate billing
            </Button>
            {!tenant.owner_email && backofficeUser?.role === "super_admin" && (
              <Button onClick={() => setAddOwnerOpen(true)}>Add owner</Button>
            )}
          </div>
        </div>

        {/* Underline tabs matching TenantWorkspace.dc.html's .tab class exactly
            (9px 4px padding, 2px bottom border, active = primary-colored border)
            rather than a segmented pill control. */}
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList className="h-auto gap-[22px] rounded-none border-b border-border bg-transparent p-0">
            {(["overview", "billing", "team", "payout", "activity"] as const).map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none border-b-2 border-transparent px-1 py-[9px] text-[13.5px] font-semibold capitalize text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="backoffice-panel px-5 py-[18px]">
              <h2 className="mb-2 text-sm font-semibold">Account</h2>
              <KeyValueRow label="Owner" value={tenant.owner_email || "Not set"} />
              <KeyValueRow label="Plan" value={tenant.plan || "No plan"} />
              <KeyValueRow
                label="Next billing"
                value={tenant.next_billing_at ? format(new Date(tenant.next_billing_at), "MMM d, yyyy") : "Not scheduled"}
              />
              <KeyValueRow label="Staff accounts" value={tenant.staff_count} />
              <KeyValueRow
                label="Online booking"
                value={<Badge variant={tenant.online_booking_enabled ? "success" : "neutral"}>{tenant.online_booking_enabled ? "Enabled" : "Disabled"}</Badge>}
              />
              <KeyValueRow
                label="Payout setup"
                value={<Badge variant={tenant.payment_setup_status === "complete" ? "success" : "warning"}>{tenant.payment_setup_status?.replace(/_/g, " ")}</Badge>}
              />
              <KeyValueRow label="Tenant ID" value={<span className="font-mono text-xs text-muted-foreground">{tenant.id}</span>} />
            </div>

            {pendingUnlock ? (
              <div className="backoffice-panel border-warning px-5 py-[18px]">
                <h2 className="mb-1.5 text-sm font-semibold">Pending unlock request</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Wants to raise the location cap from {pendingUnlock.allowed_locations} to {pendingUnlock.requested_locations}. Submitted{" "}
                  {formatDistanceToNow(new Date(pendingUnlock.created_at), { addSuffix: true })}.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={backofficeUser?.role !== "super_admin" || approveUnlockMutation.isPending}
                  onClick={() => approveUnlockMutation.mutate(pendingUnlock)}
                >
                  {approveUnlockMutation.isPending ? "Approving…" : "Approve"}
                </Button>
              </div>
            ) : (
              <div className="backoffice-panel px-5 py-[18px]">
                <h2 className="mb-1.5 text-sm font-semibold">Unlock requests</h2>
                <p className="text-sm text-muted-foreground">No pending chain-location unlock requests.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="billing">
            <div className="backoffice-panel px-5 py-[18px]">
              <h2 className="mb-2 text-sm font-semibold">Billing</h2>
              <KeyValueRow label="Status" value={tenant.subscription_status} />
              <KeyValueRow label="Plan" value={tenant.plan || "No plan"} />
              <KeyValueRow label="Currency" value={tenant.currency} />
              <KeyValueRow
                label="Next billing"
                value={tenant.next_billing_at ? format(new Date(tenant.next_billing_at), "MMM d, yyyy") : "Not scheduled"}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                For add-on line items and full billing history, see{" "}
                <Link to="/subscriptions" className="font-medium text-primary">Tenant billing</Link>.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="team">
            <div className="backoffice-panel overflow-hidden">
              {staffList.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No staff accounts found.</p>
              ) : (
                <div className="flex flex-col">
                  {staffList.map((member, index) => (
                    <div
                      key={member.userId}
                      className={`flex items-center justify-between px-5 py-3 text-sm ${index < staffList.length - 1 ? "border-b border-border" : ""}`}
                    >
                      <span className="font-medium">{member.name}</span>
                      <Badge variant="outline" className="capitalize">{member.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="payout">
            <div className="backoffice-panel px-5 py-[18px]">
              <h2 className="mb-2 text-sm font-semibold">Payout setup</h2>
              <KeyValueRow
                label="Status"
                value={<Badge variant={tenant.payment_setup_status === "complete" ? "success" : "warning"}>{tenant.payment_setup_status?.replace(/_/g, " ")}</Badge>}
              />
              {tenant.payment_setup_status !== "complete" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  See <Link to="/verification-queue" className="font-medium text-primary">Verification queue</Link> for incomplete payout destinations.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="backoffice-panel overflow-hidden">
              {recentActivity.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No recorded activity for this tenant yet.</p>
              ) : (
                <div className="flex flex-col">
                  {recentActivity.map((log, index) => (
                    <div
                      key={log.id}
                      className={`flex items-center gap-3 px-5 py-3 text-sm ${index < recentActivity.length - 1 ? "border-b border-border" : ""}`}
                    >
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                      <span className="text-muted-foreground">
                        {log.action.replace(/[._]+/g, " ")} {log.entity_type ? `(${log.entity_type.replace(/_/g, " ")})` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AddTenantOwnerDialog
        tenant={addOwnerOpen ? { id: tenant.id, name: tenant.name } : null}
        onOpenChange={(open) => !open && setAddOwnerOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["backoffice-tenants"] })}
      />

      <MigrateTenantBillingDialog
        tenant={migrateBillingOpen ? { id: tenant.id, name: tenant.name } : null}
        onOpenChange={(open) => !open && setMigrateBillingOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["backoffice-tenants"] })}
      />
    </BackofficeLayout>
  );
}
