import { useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useSalesOps } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";

export default function ConversionsPage() {
  const { backofficeUser } = useBackofficeAuth();
  const { commissionsQuery, redemptionsQuery, agentsQuery } = useSalesOps();
  const commissions = commissionsQuery.data || [];
  const redemptions = redemptionsQuery.data || [];
  const agents = agentsQuery.data || [];
  const [tab, setTab] = useState<"redemptions" | "ledger">("redemptions");
  const [agentFilter, setAgentFilter] = useState("all");
  const getAgentLabel = (agent: any) => {
    const linkedUser = Array.isArray(agent?.backoffice_users)
      ? agent.backoffice_users[0]
      : agent?.backoffice_users;
    const fullName = linkedUser?.profiles?.full_name?.trim?.();
    if (fullName) return fullName;
    if (linkedUser?.email_domain) return linkedUser.email_domain;
    return `Agent (${agent.country_code || "N/A"})`;
  };
  const visibleRedemptions = agentFilter === "all"
    ? redemptions
    : redemptions.filter((row: any) => row.sales_promo_codes?.agent_id === agentFilter);
  const visibleCommissions = agentFilter === "all"
    ? commissions
    : commissions.filter((row: any) => row.agent_id === agentFilter);

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Ops · Conversions & Commissions</h1>
          <p className="text-muted-foreground">Track promo code conversions and commission accruals.</p>
        </div>
        {backofficeUser?.role === "super_admin" ? (
          <div className="max-w-xs">
            <Label>Filter by agent</Label>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {getAgentLabel(agent)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as "redemptions" | "ledger")}>
          <TabsList>
            <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
            <TabsTrigger value="ledger">Commission Ledger</TabsTrigger>
          </TabsList>

          <TabsContent value="redemptions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Redemptions</CardTitle>
                <CardDescription>Promo conversion funnel status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {visibleRedemptions.map((row: any) => (
                  <div key={row.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{row.owner_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.sales_promo_codes?.code || "No code"} · {new Date(row.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={row.status === "finalized" ? "default" : "secondary"}>{row.status}</Badge>
                  </div>
                ))}
                {!visibleRedemptions.length && <p className="text-sm text-muted-foreground">No redemptions yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ledger" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Commission Ledger</CardTitle>
                <CardDescription>Accrued vs cancelled payouts by payment result.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {visibleCommissions.map((row: any) => (
                  <div key={row.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{row.payment_reference || "Pending reference"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{Number(row.total_amount || 0).toLocaleString()}</p>
                      <Badge variant={row.status === "accrued" ? "default" : "secondary"}>{row.status}</Badge>
                    </div>
                  </div>
                ))}
                {!visibleCommissions.length && <p className="text-sm text-muted-foreground">No commission entries yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BackofficeLayout>
  );
}
