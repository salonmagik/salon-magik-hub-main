import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { supabase } from "@/lib/supabase";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Loader2 } from "lucide-react";
import { SupportTicketsPanel, useSupportTickets } from "@/pages/customers/CustomersSupportPage";

type OpsView = "imports" | "assistance" | "reactivation";

export default function CustomersOpsMonitorPage() {
  const [opsView, setOpsView] = useState<OpsView>("imports");

  const { data: importJobs = [], isLoading: isImportJobsLoading } = useQuery({
    queryKey: ["ops-catalog-import-jobs"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("catalog_import_jobs" as any)
        .select("id, tenant_id, import_type, status, created_at, finished_at, summary_json")
        .order("created_at", { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: assistanceRequests = [], isLoading: isAssistanceLoading } = useQuery({
    queryKey: ["ops-setup-assistance-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("setup_assistance_requests" as any)
        .select("id, tenant_id, request_type, status, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reactivationCampaigns = [], isLoading: isReactivationLoading } = useQuery({
    queryKey: ["ops-reactivation-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("customer_reactivation_campaigns" as any)
        .select("id, tenant_id, channel, status, name, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: supportTickets = [] } = useSupportTickets();
  const openTicketCount = supportTickets.filter((t) => t.status === "open").length;

  const isLoading = isImportJobsLoading || isAssistanceLoading || isReactivationLoading;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentImportCount = importJobs.filter((j: any) => new Date(j.created_at).getTime() >= sevenDaysAgo).length;

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight">Ops monitor &amp; support</h1>
          <p className="mt-[3px] text-[12.5px] text-muted-foreground">
            Cross-functional telemetry (imports, plan-config requests, broadcasts) alongside the live support ticket queue.
          </p>
        </div>

        <Tabs defaultValue="telemetry" className="space-y-4">
          <TabsList className="h-auto justify-start gap-[22px] rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger
              value="telemetry"
              className="rounded-none border-b-2 border-transparent px-1 py-[9px] text-[13.5px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Ops telemetry
            </TabsTrigger>
            <TabsTrigger
              value="support"
              className="rounded-none border-b-2 border-transparent px-1 py-[9px] text-[13.5px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Support tickets
              {openTicketCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 rounded-full">{openTicketCount} open</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="telemetry" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="backoffice-panel p-4">
                <div className="text-[11.5px] font-semibold text-muted-foreground">Catalog imports, 7d</div>
                <div className="mt-1 text-[22px] font-bold tabular-nums">{recentImportCount}</div>
              </div>
              <div className="backoffice-panel p-4">
                <div className="text-[11.5px] font-semibold text-muted-foreground">Setup assistance requests</div>
                <div className="mt-1 text-[22px] font-bold tabular-nums">{assistanceRequests.length}</div>
              </div>
              <div className="backoffice-panel p-4">
                <div className="text-[11.5px] font-semibold text-muted-foreground">Reactivation campaigns</div>
                <div className="mt-1 text-[22px] font-bold tabular-nums">{reactivationCampaigns.length}</div>
              </div>
            </div>

            <Tabs value={opsView} onValueChange={(value) => setOpsView(value as OpsView)}>
              <TabsList>
                <TabsTrigger value="imports">Catalog imports</TabsTrigger>
                <TabsTrigger value="assistance">Setup assistance</TabsTrigger>
                <TabsTrigger value="reactivation">Reactivation campaigns</TabsTrigger>
              </TabsList>

              <TabsContent value="imports" className="mt-4 space-y-3">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : importJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No import jobs yet.</p>
                ) : (
                  importJobs.map((job: any) => (
                    <div key={job.id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{job.import_type} · Tenant {job.tenant_id?.slice?.(0, 8) || "-"}</p>
                          <p className="text-xs text-muted-foreground">Started {new Date(job.created_at).toLocaleString()}</p>
                        </div>
                        <Badge variant="outline">{job.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="assistance" className="mt-4 space-y-3">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : assistanceRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assistance requests yet.</p>
                ) : (
                  assistanceRequests.map((request: any) => (
                    <div key={request.id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{request.request_type}</p>
                          <p className="text-xs text-muted-foreground">Tenant {request.tenant_id?.slice?.(0, 8) || "-"} · {new Date(request.created_at).toLocaleString()}</p>
                        </div>
                        <Badge variant="outline">{request.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="reactivation" className="mt-4 space-y-3">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : reactivationCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reactivation campaigns yet.</p>
                ) : (
                  reactivationCampaigns.map((campaign: any) => (
                    <div key={campaign.id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{campaign.name || campaign.channel}</p>
                          <p className="text-xs text-muted-foreground">{campaign.channel} · {new Date(campaign.created_at).toLocaleString()}</p>
                        </div>
                        <Badge variant="outline">{campaign.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="support">
            <SupportTicketsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </BackofficeLayout>
  );
}
