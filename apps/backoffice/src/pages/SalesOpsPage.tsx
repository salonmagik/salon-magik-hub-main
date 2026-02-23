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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Textarea } from "@ui/textarea";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  enable_trial_extension: boolean;
  trial_extension_days: number;
}

interface Agent {
  id: string;
  backoffice_user_id: string;
  employment_status: "active" | "inactive" | "suspended";
  country_code: string;
  monthly_base_salary: number;
  hire_date: string | null;
}

interface BackofficeUserOption {
  id: string;
  email_domain: string;
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

interface AgentKyc {
  sales_agent_id: string;
  legal_full_name: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  reference_person_name: string | null;
  reference_person_phone: string | null;
  past_workplace: string | null;
  verification_status: "pending" | "approved" | "rejected";
}

interface AgentDocument {
  id: string;
  sales_agent_id: string;
  document_type: "national_id_front" | "national_id_back" | "passport_photo" | "other";
  storage_path: string;
  review_status: "pending" | "approved" | "rejected";
  created_at: string;
}

export default function SalesOpsPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"promo" | "agents" | "conversions">("promo");

  const [campaignId, setCampaignId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [targetEmail, setTargetEmail] = useState("");

  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignStartsAt, setNewCampaignStartsAt] = useState("");
  const [newCampaignEndsAt, setNewCampaignEndsAt] = useState("");
  const [newCampaignDiscountType, setNewCampaignDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [newCampaignDiscountValue, setNewCampaignDiscountValue] = useState("10");
  const [newCampaignTrialEnabled, setNewCampaignTrialEnabled] = useState(false);
  const [newCampaignTrialDays, setNewCampaignTrialDays] = useState("0");

  const [newAgentBackofficeUserId, setNewAgentBackofficeUserId] = useState("");
  const [newAgentCountryCode, setNewAgentCountryCode] = useState("NG");
  const [newAgentSalary, setNewAgentSalary] = useState("0");
  const [newAgentHireDate, setNewAgentHireDate] = useState("");

  const [selectedAgentForKyc, setSelectedAgentForKyc] = useState("");
  const [kycLegalFullName, setKycLegalFullName] = useState("");
  const [kycNationalIdNumber, setKycNationalIdNumber] = useState("");
  const [kycNationalIdType, setKycNationalIdType] = useState("");
  const [kycNextOfKinName, setKycNextOfKinName] = useState("");
  const [kycNextOfKinPhone, setKycNextOfKinPhone] = useState("");
  const [kycReferenceName, setKycReferenceName] = useState("");
  const [kycReferencePhone, setKycReferencePhone] = useState("");
  const [kycPastWorkplace, setKycPastWorkplace] = useState("");
  const [uploadDocType, setUploadDocType] = useState<"national_id_front" | "national_id_back" | "passport_photo" | "other">("national_id_front");

  const { data: campaigns = [] } = useQuery({
    queryKey: ["sales-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_campaigns" as never)
        .select("id, name, starts_at, ends_at, is_active, discount_type, discount_value, enable_trial_extension, trial_extension_days")
        .order("created_at", { ascending: false }) as never);
      if (error) throw error;
      return (data || []) as Campaign[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["sales-agents"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_agents" as never)
        .select("id, backoffice_user_id, employment_status, country_code, monthly_base_salary, hire_date")
        .order("created_at", { ascending: false }) as never);
      if (error) throw error;
      return (data || []) as Agent[];
    },
  });

  const { data: backofficeUsers = [] } = useQuery({
    queryKey: ["backoffice-users-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backoffice_users")
        .select("id, email_domain")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BackofficeUserOption[];
    },
  });

  const { data: promoCodes = [] } = useQuery({
    queryKey: ["sales-promo-codes"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_codes" as never)
        .select("id, code, target_email, status, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(25) as never);
      if (error) throw error;
      return (data || []) as PromoCode[];
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["sales-commission-ledger"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_commission_ledger" as never)
        .select("id, payment_reference, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(25) as never);
      if (error) throw error;
      return (data || []) as CommissionRow[];
    },
  });

  const { data: redemptions = [] } = useQuery({
    queryKey: ["sales-redemptions"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_promo_redemptions" as never)
        .select("id, owner_email, status, created_at, sales_promo_codes(code)")
        .order("created_at", { ascending: false })
        .limit(25) as never);
      if (error) throw error;
      return (data || []) as RedemptionRow[];
    },
  });

  const { data: kycRows = [] } = useQuery({
    queryKey: ["sales-agent-kyc"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_agent_kyc" as never)
        .select("sales_agent_id, legal_full_name, national_id_number, national_id_type, next_of_kin_name, next_of_kin_phone, reference_person_name, reference_person_phone, past_workplace, verification_status") as never);
      if (error) throw error;
      return (data || []) as AgentKyc[];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["sales-agent-documents"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sales_agent_documents" as never)
        .select("id, sales_agent_id, document_type, storage_path, review_status, created_at")
        .order("created_at", { ascending: false }) as never);
      if (error) throw error;
      return (data || []) as AgentDocument[];
    },
  });

  const createPromoCode = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as never)("backoffice_generate_sales_promo_code", {
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

  const createCampaign = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(newCampaignStartsAt).toISOString();
      const endsAt = new Date(newCampaignEndsAt).toISOString();
      const discountValue = Number(newCampaignDiscountValue);
      const trialDays = Number(newCampaignTrialDays || 0);
      const { error } = await (supabase
        .from("sales_promo_campaigns" as never)
        .insert({
          name: newCampaignName.trim(),
          starts_at: startsAt,
          ends_at: endsAt,
          discount_type: newCampaignDiscountType,
          discount_value: discountValue,
          enable_trial_extension: newCampaignTrialEnabled,
          trial_extension_days: newCampaignTrialEnabled ? trialDays : 0,
          is_active: true,
        } as never) as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-campaigns"] });
      toast.success("Campaign created");
      setNewCampaignName("");
      setNewCampaignStartsAt("");
      setNewCampaignEndsAt("");
      setNewCampaignDiscountValue("10");
      setNewCampaignTrialEnabled(false);
      setNewCampaignTrialDays("0");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create campaign"),
  });

  const toggleCampaign = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await (supabase
        .from("sales_promo_campaigns" as never)
        .update({ is_active: isActive } as never)
        .eq("id", id) as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-campaigns"] }),
    onError: (error: Error) => toast.error(error.message || "Failed to update campaign"),
  });

  const createAgent = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase
        .from("sales_agents" as never)
        .insert({
          backoffice_user_id: newAgentBackofficeUserId,
          country_code: newAgentCountryCode,
          monthly_base_salary: Number(newAgentSalary || 0),
          hire_date: newAgentHireDate || null,
          employment_status: "active",
        } as never) as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agents"] });
      toast.success("Sales agent profile created");
      setNewAgentBackofficeUserId("");
      setNewAgentCountryCode("NG");
      setNewAgentSalary("0");
      setNewAgentHireDate("");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create agent"),
  });

  const upsertKyc = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase
        .from("sales_agent_kyc" as never)
        .upsert(
          {
            sales_agent_id: selectedAgentForKyc,
            legal_full_name: kycLegalFullName || null,
            national_id_number: kycNationalIdNumber || null,
            national_id_type: kycNationalIdType || null,
            next_of_kin_name: kycNextOfKinName || null,
            next_of_kin_phone: kycNextOfKinPhone || null,
            reference_person_name: kycReferenceName || null,
            reference_person_phone: kycReferencePhone || null,
            past_workplace: kycPastWorkplace || null,
          } as never,
          { onConflict: "sales_agent_id" },
        ) as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-kyc"] });
      toast.success("KYC updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save KYC"),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      if (!selectedAgentForKyc) throw new Error("Select an agent first");
      const fileExt = file.name.split(".").pop() || "bin";
      const path = `${selectedAgentForKyc}/${uploadDocType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("sales-agent-kyc-docs")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: insertError } = await (supabase
        .from("sales_agent_documents" as never)
        .insert({
          sales_agent_id: selectedAgentForKyc,
          document_type: uploadDocType,
          storage_path: path,
          review_status: "pending",
        } as never) as never);
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-documents"] });
      toast.success("Document uploaded");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload document"),
  });

  const updateKycVerificationStatus = useMutation({
    mutationFn: async (status: "pending" | "approved" | "rejected") => {
      if (!selectedAgentForKyc) throw new Error("Select an agent first");
      const { error } = await (supabase
        .from("sales_agent_kyc" as never)
        .update({ verification_status: status } as never)
        .eq("sales_agent_id", selectedAgentForKyc) as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-kyc"] });
      toast.success("KYC verification status updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update verification status"),
  });

  const updateDocumentReviewStatus = useMutation({
    mutationFn: async ({
      documentId,
      status,
    }: {
      documentId: string;
      status: "pending" | "approved" | "rejected";
    }) => {
      const { error } = await (supabase
        .from("sales_agent_documents" as never)
        .update({ review_status: status } as never)
        .eq("id", documentId) as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-agent-documents"] });
      toast.success("Document review status updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update document status"),
  });

  const activeCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.is_active),
    [campaigns],
  );

  const selectedAgentKyc = useMemo(
    () => kycRows.find((row) => row.sales_agent_id === selectedAgentForKyc) || null,
    [kycRows, selectedAgentForKyc],
  );

  const selectedAgentDocuments = useMemo(
    () => documents.filter((row) => row.sales_agent_id === selectedAgentForKyc),
    [documents, selectedAgentForKyc],
  );

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Ops</h1>
          <p className="text-muted-foreground">
            Manage campaign configuration, agent KYC, promo generation, and conversion/commission tracking.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "promo" | "agents" | "conversions")}> 
          <TabsList>
            <TabsTrigger value="promo">Promo & Campaigns</TabsTrigger>
            <TabsTrigger value="agents">Agents & KYC</TabsTrigger>
            <TabsTrigger value="conversions">Conversions & Commissions</TabsTrigger>
          </TabsList>

          <TabsContent value="promo" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Campaign</CardTitle>
                <CardDescription>Define discount period and optional trial extension.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="Q1 Annual Push" />
                </div>
                <div className="space-y-2">
                  <Label>Starts</Label>
                  <Input type="datetime-local" value={newCampaignStartsAt} onChange={(e) => setNewCampaignStartsAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ends</Label>
                  <Input type="datetime-local" value={newCampaignEndsAt} onChange={(e) => setNewCampaignEndsAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <Select value={newCampaignDiscountType} onValueChange={(v) => setNewCampaignDiscountType(v as "percentage" | "fixed")}> 
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discount Value</Label>
                  <Input value={newCampaignDiscountValue} onChange={(e) => setNewCampaignDiscountValue(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Trial Extension Days</Label>
                  <Input value={newCampaignTrialDays} onChange={(e) => setNewCampaignTrialDays(e.target.value)} disabled={!newCampaignTrialEnabled} />
                </div>
                <div className="md:col-span-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={newCampaignTrialEnabled}
                    onChange={(event) => setNewCampaignTrialEnabled(event.target.checked)}
                  />
                  <span className="text-sm">Enable trial extension bonus</span>
                </div>
                <div className="md:col-span-3">
                  <Button
                    onClick={() => createCampaign.mutate()}
                    disabled={!newCampaignName || !newCampaignStartsAt || !newCampaignEndsAt || createCampaign.isPending}
                  >
                    Create Campaign
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generate Promo Code</CardTitle>
                <CardDescription>Codes are email-bound, one-time, and expire after 24 hours.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Campaign</Label>
                    <Select value={campaignId} onValueChange={setCampaignId}>
                      <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                      <SelectContent>
                        {activeCampaigns.map((campaign) => (
                          <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sales Agent</Label>
                    <Select value={agentId} onValueChange={setAgentId}>
                      <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                      <SelectContent>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>{agent.id.slice(0, 8)} · {agent.country_code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target Email</Label>
                    <Input type="email" value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} placeholder="owner@salon.com" />
                  </div>
                </div>
                <Button onClick={() => createPromoCode.mutate()} disabled={!campaignId || !agentId || !targetEmail || createPromoCode.isPending}>
                  Generate code
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campaigns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(campaign.starts_at).toLocaleString()} - {new Date(campaign.ends_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={campaign.is_active ? "default" : "secondary"}>{campaign.is_active ? "Active" : "Inactive"}</Badge>
                      <Button size="sm" variant="outline" onClick={() => toggleCampaign.mutate({ id: campaign.id, isActive: !campaign.is_active })}>
                        {campaign.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                ))}
                {!campaigns.length && <p className="text-sm text-muted-foreground">No campaigns yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Latest Promo Codes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {promoCodes.map((promoCode) => (
                  <div key={promoCode.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{promoCode.code}</p>
                      <p className="text-sm text-muted-foreground">{promoCode.target_email}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={promoCode.status === "active" ? "default" : "secondary"}>{promoCode.status}</Badge>
                      <p className="text-xs text-muted-foreground">Expires {new Date(promoCode.expires_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {!promoCodes.length && <p className="text-sm text-muted-foreground">No promo codes generated yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Sales Agent Profile</CardTitle>
                <CardDescription>Attach a backoffice user to an agent profile for tracking and commissions.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Backoffice User</Label>
                  <Select value={newAgentBackofficeUserId} onValueChange={setNewAgentBackofficeUserId}>
                    <SelectTrigger><SelectValue placeholder="Select backoffice user" /></SelectTrigger>
                    <SelectContent>
                      {backofficeUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.id.slice(0, 8)} · {user.email_domain}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={newAgentCountryCode} onValueChange={setNewAgentCountryCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NG">Nigeria</SelectItem>
                      <SelectItem value="GH">Ghana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hire Date</Label>
                  <Input type="date" value={newAgentHireDate} onChange={(e) => setNewAgentHireDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Salary</Label>
                  <Input value={newAgentSalary} onChange={(e) => setNewAgentSalary(e.target.value)} />
                </div>
                <div className="md:col-span-4">
                  <Button onClick={() => createAgent.mutate()} disabled={!newAgentBackofficeUserId || createAgent.isPending}>
                    Create Agent
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agent KYC</CardTitle>
                <CardDescription>Capture and review required KYC data and documents.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Agent</Label>
                  <Select
                    value={selectedAgentForKyc}
                    onValueChange={(value) => {
                      setSelectedAgentForKyc(value);
                      const existing = kycRows.find((row) => row.sales_agent_id === value);
                      setKycLegalFullName(existing?.legal_full_name || "");
                      setKycNationalIdNumber(existing?.national_id_number || "");
                      setKycNationalIdType(existing?.national_id_type || "");
                      setKycNextOfKinName(existing?.next_of_kin_name || "");
                      setKycNextOfKinPhone(existing?.next_of_kin_phone || "");
                      setKycReferenceName(existing?.reference_person_name || "");
                      setKycReferencePhone(existing?.reference_person_phone || "");
                      setKycPastWorkplace(existing?.past_workplace || "");
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>{agent.id.slice(0, 8)} · {agent.country_code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAgentForKyc && (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input placeholder="Legal full name" value={kycLegalFullName} onChange={(e) => setKycLegalFullName(e.target.value)} />
                      <Input placeholder="National ID number" value={kycNationalIdNumber} onChange={(e) => setKycNationalIdNumber(e.target.value)} />
                      <Input placeholder="National ID type" value={kycNationalIdType} onChange={(e) => setKycNationalIdType(e.target.value)} />
                      <Input placeholder="Next of kin name" value={kycNextOfKinName} onChange={(e) => setKycNextOfKinName(e.target.value)} />
                      <Input placeholder="Next of kin phone" value={kycNextOfKinPhone} onChange={(e) => setKycNextOfKinPhone(e.target.value)} />
                      <Input placeholder="Reference person name" value={kycReferenceName} onChange={(e) => setKycReferenceName(e.target.value)} />
                      <Input placeholder="Reference person phone" value={kycReferencePhone} onChange={(e) => setKycReferencePhone(e.target.value)} />
                    </div>
                    <Textarea placeholder="Past workplace" value={kycPastWorkplace} onChange={(e) => setKycPastWorkplace(e.target.value)} />
                    <div className="flex items-center gap-3">
                      <Button onClick={() => upsertKyc.mutate()} disabled={upsertKyc.isPending}>Save KYC</Button>
                      {selectedAgentKyc && (
                        <>
                          <Badge variant="outline">Verification: {selectedAgentKyc.verification_status}</Badge>
                          <Select
                            value={selectedAgentKyc.verification_status}
                            onValueChange={(value) =>
                              updateKycVerificationStatus.mutate(value as "pending" | "approved" | "rejected")
                            }
                          >
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-3">
                      <p className="font-medium">Upload KYC documents</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Select value={uploadDocType} onValueChange={(v) => setUploadDocType(v as "national_id_front" | "national_id_back" | "passport_photo" | "other")}> 
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="national_id_front">National ID (Front)</SelectItem>
                            <SelectItem value="national_id_back">National ID (Back)</SelectItem>
                            <SelectItem value="passport_photo">Passport Photo</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            uploadDocument.mutate({ file });
                            event.currentTarget.value = "";
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        {selectedAgentDocuments.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between rounded border p-2">
                            <span className="text-sm">{doc.document_type}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{doc.review_status}</Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateDocumentReviewStatus.mutate({ documentId: doc.id, status: "approved" })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateDocumentReviewStatus.mutate({ documentId: doc.id, status: "rejected" })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                        {selectedAgentDocuments.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded for this agent yet.</p>}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Redemptions</CardTitle>
                <CardDescription>Promo conversion funnel status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
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
                {!redemptions.length && <p className="text-sm text-muted-foreground">No redemptions yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Commission Ledger</CardTitle>
                <CardDescription>Accrued vs cancelled payouts by payment result.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
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
                {!commissions.length && <p className="text-sm text-muted-foreground">No commission entries yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BackofficeLayout>
  );
}
