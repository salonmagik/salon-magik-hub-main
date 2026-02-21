import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/card";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

interface Agent {
  id: string;
  backoffice_user_id: string;
  employment_status: string;
}

interface PromoCode {
  id: string;
  code: string;
  target_email: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface CommissionRow {
  id: string;
  payment_reference: string | null;
  total_amount: number;
  status: string;
  created_at: string;
}

interface RedemptionRow {
  id: string;
  owner_email: string;
  status: string;
  created_at: string;
  sales_promo_codes?: { code?: string } | null;
}

export default function SalesOpsPage() {
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [targetEmail, setTargetEmail] = useState("");

  const { data: campaigns = [] } = useQuery({
    queryKey: ["sales-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_campaigns" as any)
        .select("id, name, starts_at, ends_at, is_active")
        .order("created_at", { ascending: false }) as any);
      if (error) throw error;
      return (data || []) as Campaign[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["sales-agents"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_agents" as any)
        .select("id, backoffice_user_id, employment_status")
        .order("created_at", { ascending: false }) as any);
      if (error) throw error;
      return (data || []) as Agent[];
    },
  });

  const { data: promoCodes = [] } = useQuery({
    queryKey: ["sales-promo-codes"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_codes" as any)
        .select("id, code, target_email, status, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(25) as any);
      if (error) throw error;
      return (data || []) as PromoCode[];
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["sales-commission-ledger"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_commission_ledger" as any)
        .select("id, payment_reference, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(25) as any);
      if (error) throw error;
      return (data || []) as CommissionRow[];
    },
  });

  const { data: redemptions = [] } = useQuery({
    queryKey: ["sales-redemptions"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_redemptions" as any)
        .select("id, owner_email, status, created_at, sales_promo_codes(code)")
        .order("created_at", { ascending: false })
        .limit(25) as any);
      if (error) throw error;
      return (data || []) as RedemptionRow[];
    },
  });

  const createPromoCode = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("backoffice_generate_sales_promo_code", {
        p_campaign_id: campaignId,
        p_agent_id: agentId,
        p_target_email: targetEmail,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-promo-codes"] });
      toast.success("Promo code generated");
      setTargetEmail("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate promo code: ${error.message}`);
    },
  });

  const activeCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.is_active),
    [campaigns],
  );

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Ops</h1>
          <p className="text-muted-foreground">
            Manage promo campaigns, code generation, and sales-agent conversion visibility.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Promo Code</CardTitle>
            <CardDescription>
              Codes are email-bound, one-time, and expire after 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCampaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sales Agent</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.backoffice_user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Email</Label>
                <Input
                  type="email"
                  value={targetEmail}
                  onChange={(event) => setTargetEmail(event.target.value)}
                  placeholder="owner@salon.com"
                />
              </div>
            </div>
            <Button
              onClick={() => createPromoCode.mutate()}
              disabled={!campaignId || !agentId || !targetEmail || createPromoCode.isPending}
            >
              Generate code
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Promo Codes</CardTitle>
            <CardDescription>Track generation and expiry in real time.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {promoCodes.map((promoCode) => (
                <div key={promoCode.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-1">
                    <p className="font-medium">{promoCode.code}</p>
                    <p className="text-sm text-muted-foreground">{promoCode.target_email}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant={promoCode.status === "active" ? "default" : "secondary"}>
                      {promoCode.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(promoCode.expires_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {!promoCodes.length && (
                <p className="text-sm text-muted-foreground">No promo codes generated yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Redemptions</CardTitle>
              <CardDescription>Promo conversion funnel status.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {redemptions.map((row) => (
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
                {!redemptions.length && (
                  <p className="text-sm text-muted-foreground">No redemptions yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commission Ledger</CardTitle>
              <CardDescription>Accrued vs cancelled payouts by payment result.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {commissions.map((row) => (
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
                {!commissions.length && (
                  <p className="text-sm text-muted-foreground">No commission entries yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BackofficeLayout>
  );
}
