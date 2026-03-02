import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Badge } from "@ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

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

  const isLoading = isImportJobsLoading || isAssistanceLoading || isReactivationLoading;

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers Ops Monitor</h1>
          <p className="text-muted-foreground">Operational monitor for imports, setup assistance, and reactivation activity.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" />Ops Monitor</CardTitle>
            <CardDescription>Cross-functional operations telemetry across growth workflows.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={opsView} onValueChange={(value) => setOpsView(value as OpsView)}>
              <TabsList>
                <TabsTrigger value="imports">Catalog Imports</TabsTrigger>
                <TabsTrigger value="assistance">Setup Assistance</TabsTrigger>
                <TabsTrigger value="reactivation">Reactivation Campaigns</TabsTrigger>
              </TabsList>

              <TabsContent value="imports" className="mt-4 space-y-3">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : importJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No import jobs yet.</p>
                ) : (
                  importJobs.map((job: any) => (
                    <div key={job.id} className="rounded-md border p-3">
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
                    <div key={request.id} className="rounded-md border p-3">
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
                    <div key={campaign.id} className="rounded-md border p-3">
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
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
