import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useSalesOps } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { Megaphone, Ticket, Copy, MoreHorizontal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
  Dialog,
  DialogDescription,
  DialogTrigger,
} from "@ui/dialog";
import {
  ArtifactDialogContent,
  ArtifactDialogHeader,
  ArtifactDialogFooter,
  ArtifactDialogTitle,
  ARTIFACT_DIALOG_BODY_PADDING,
} from "@/components/dialogs/ArtifactDialogChrome";
import { cn } from "@shared/utils";

type SalesOpsTab = "campaigns" | "capture-client" | "conversions";

const TAB_BY_PATH: Record<string, SalesOpsTab> = {
  "/sales/campaigns": "campaigns",
  "/sales/capture-client": "capture-client",
  "/sales/conversions": "conversions",
};

const PATH_BY_TAB: Record<SalesOpsTab, string> = {
  campaigns: "/sales/campaigns",
  "capture-client": "/sales/capture-client",
  conversions: "/sales/conversions",
};

export default function SalesOpsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { backofficeUser, hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();
  const {
    campaignsQuery,
    createCampaign,
    toggleCampaign,
    usersQuery,
    promoCodesQuery,
    ensureOwnAgentProfile,
    ensureAgentProfileForUser,
    createPromoCode,
    sendPromoEmail,
    invalidatePromoCode,
    commissionsQuery,
    redemptionsQuery,
    agentsQuery,
  } = useSalesOps();

  const canCampaigns = hasBackofficePageAccess("sales_campaigns") && hasBackofficePermission("sales.manage_campaigns");
  const canCapture = hasBackofficePageAccess("sales_capture_client") && hasBackofficePermission("sales.capture_client");
  const canConversions = hasBackofficePageAccess("sales_conversions") && hasBackofficePermission("sales.view_conversions");

  const firstAllowedTab: SalesOpsTab | null = canCampaigns
    ? "campaigns"
    : canCapture
      ? "capture-client"
      : canConversions
        ? "conversions"
        : null;

  const requestedTab = TAB_BY_PATH[location.pathname];
  const requestedTabAllowed =
    requestedTab === "campaigns" ? canCampaigns
      : requestedTab === "capture-client" ? canCapture
        : requestedTab === "conversions" ? canConversions
          : false;

  const [tab, setTab] = useState<SalesOpsTab | null>(
    requestedTab && requestedTabAllowed ? requestedTab : firstAllowedTab,
  );

  const campaigns = campaignsQuery.data || [];
  const users = usersQuery.data || [];
  const promoCodes = promoCodesQuery.data || [];
  const commissions = commissionsQuery.data || [];
  const redemptions = redemptionsQuery.data || [];
  const agents = agentsQuery.data || [];
  const activeCampaigns = useMemo(() => campaigns.filter((c: any) => c.is_active), [campaigns]);

  const stats = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const redemptions30d = redemptions.filter((r: any) => new Date(r.created_at).getTime() >= thirtyDaysAgo);
    const finalized = redemptions.filter((r: any) => r.status === "finalized");
    const conversionRate = redemptions.length > 0 ? Math.round((finalized.length / redemptions.length) * 100) : 0;
    const commissionOwed = commissions
      .filter((c: any) => c.status === "accrued")
      .reduce((sum: number, c: any) => sum + Number(c.total_amount || 0), 0);
    return {
      activeCampaigns: activeCampaigns.length,
      redemptions30d: redemptions30d.length,
      conversionRate,
      commissionOwed,
    };
  }, [activeCampaigns, redemptions, commissions]);

  // Campaigns tab state
  const [open, setOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignStartsAt, setNewCampaignStartsAt] = useState("");
  const [newCampaignEndsAt, setNewCampaignEndsAt] = useState("");
  const [newCampaignDiscountType, setNewCampaignDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [newCampaignDiscountValue, setNewCampaignDiscountValue] = useState("10");
  const [newCampaignTrialEnabled, setNewCampaignTrialEnabled] = useState(false);
  const [newCampaignTrialDays, setNewCampaignTrialDays] = useState("0");
  const [billingTargets, setBillingTargets] = useState<string[]>(["subscription"]);
  const [maxUsesPerTenant, setMaxUsesPerTenant] = useState("1");
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState("Your {{campaign_name}} Salon Magik promo code");
  const [emailBodyTemplate, setEmailBodyTemplate] = useState(
    "<p>Hello {{recipient_firstname}},</p><p>Your Salon Magik promo code for {{campaign_name}} is <strong>{{promo_code}}</strong>.</p><p>This code is reserved for {{recipient_email}} and can be used before {{expires_at}}.</p><p><a href=\"{{signup_url}}\">Create your account</a> or <a href=\"{{login_url}}\">log in</a> to continue.</p>",
  );
  const [codeExpiryHours, setCodeExpiryHours] = useState("24");

  const canSubmitCampaign =
    Boolean(newCampaignName) &&
    Boolean(newCampaignStartsAt) &&
    Boolean(newCampaignEndsAt) &&
    billingTargets.length > 0 &&
    Number(maxUsesPerTenant) >= 1 &&
    Number(codeExpiryHours) >= 1 &&
    !createCampaign.isPending;

  // Capture client tab state
  const [campaignId, setCampaignId] = useState("");
  const [selectedBackofficeUserId, setSelectedBackofficeUserId] = useState("");
  const [targetFirstName, setTargetFirstName] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [selectedPromoCode, setSelectedPromoCode] = useState<any | null>(null);
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const getUserLabel = (user: any) => {
    const fullName = (user.full_name || `${user.first_name || ""} ${user.last_name || ""}`).trim();
    if (fullName && user.email) return `${fullName} (${user.email})`;
    return user.email || fullName || "Unnamed user";
  };

  const getPromoMeta = (promoCode: any) => {
    const campaign = Array.isArray(promoCode.sales_promo_campaigns)
      ? promoCode.sales_promo_campaigns[0]
      : promoCode.sales_promo_campaigns;
    const redemption = Array.isArray(promoCode.sales_promo_redemptions)
      ? promoCode.sales_promo_redemptions[0]
      : promoCode.sales_promo_redemptions;
    const campaignEnded = campaign?.ends_at ? new Date(campaign.ends_at).getTime() <= Date.now() : false;
    const codeExpired = promoCode.expires_at ? new Date(promoCode.expires_at).getTime() <= Date.now() : false;
    const invalidated = Boolean(promoCode.invalidated_at) || promoCode.status === "invalidated";
    const remainingUses = redemption?.remaining_uses ?? campaign?.max_uses_per_tenant ?? 0;
    const resendable =
      !campaignEnded &&
      !invalidated &&
      remainingUses > 0 &&
      promoCode.status !== "consumed" &&
      promoCode.status !== "redeemed" &&
      (!codeExpired || promoCode.status === "claimed");
    return { campaign, redemption, campaignEnded, codeExpired, invalidated, remainingUses, resendable };
  };

  // Conversions tab state
  const [convTab, setConvTab] = useState<"redemptions" | "ledger">("redemptions");
  const [agentFilter, setAgentFilter] = useState("all");
  const getAgentLabel = (agent: any) => {
    const linkedUser = Array.isArray(agent?.backoffice_users) ? agent.backoffice_users[0] : agent?.backoffice_users;
    const fullName = linkedUser?.profiles?.full_name?.trim?.();
    if (fullName) return fullName;
    if (linkedUser?.email_domain) return linkedUser.email_domain;
    return `Agent (${agent.country_code || "—"})`;
  };
  const visibleRedemptions = agentFilter === "all"
    ? redemptions
    : redemptions.filter((row: any) => row.sales_promo_codes?.agent_id === agentFilter);
  const visibleCommissions = agentFilter === "all"
    ? commissions
    : commissions.filter((row: any) => row.agent_id === agentFilter);

  if (!firstAllowedTab) {
    return <Navigate to="/" replace />;
  }

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight">Sales ops</h1>
            <p className="mt-[3px] text-[12.5px] text-muted-foreground">
              Campaigns, direct client capture, and redemption/commission tracking — one roof, one set of filters.
            </p>
          </div>
          {canCampaigns && tab === "campaigns" && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>New campaign</Button>
              </DialogTrigger>
              <ArtifactDialogContent className="max-w-[560px]">
                <ArtifactDialogHeader>
                  <ArtifactDialogTitle>New campaign</ArtifactDialogTitle>
                </ArtifactDialogHeader>
                <div className={cn(ARTIFACT_DIALOG_BODY_PADDING, "grid !gap-4 md:grid-cols-2")}>
                  <DialogDescription className="text-[12.5px] md:col-span-2">
                    Define discount period and optional trial extension.
                  </DialogDescription>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-[11.5px] font-semibold text-muted-foreground">Campaign name</Label>
                    <Input value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="e.g. Lagos launch push" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-[11.5px] font-semibold text-muted-foreground">Discount type</Label>
                    <div className="flex gap-1 rounded-[10px] border p-1">
                      {([
                        { value: "percentage", label: "Percentage off" },
                        { value: "fixed", label: "Fixed amount" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setNewCampaignDiscountType(opt.value)}
                          className={cn(
                            "flex-1 rounded-lg px-2 py-[9px] text-[12.5px] font-semibold transition-colors",
                            newCampaignDiscountType === opt.value
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11.5px] font-semibold text-muted-foreground">Value</Label>
                    <Input value={newCampaignDiscountValue} onChange={(e) => setNewCampaignDiscountValue(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11.5px] font-semibold text-muted-foreground">Starts</Label>
                    <Input type="datetime-local" value={newCampaignStartsAt} onChange={(e) => setNewCampaignStartsAt(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11.5px] font-semibold text-muted-foreground">Ends</Label>
                    <Input type="datetime-local" value={newCampaignEndsAt} onChange={(e) => setNewCampaignEndsAt(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Billing Targets</Label>
                    <div className="flex flex-wrap gap-4 rounded-md border p-3">
                      {["subscription", "credits"].map((target) => (
                        <label key={target} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={billingTargets.includes(target)}
                            onChange={(event) => {
                              setBillingTargets((prev) => {
                                if (event.target.checked) return Array.from(new Set([...prev, target]));
                                return prev.filter((item) => item !== target);
                              });
                            }}
                          />
                          <span className="capitalize">{target}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Uses Per Tenant</Label>
                    <Input type="number" min={1} value={maxUsesPerTenant} onChange={(e) => setMaxUsesPerTenant(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Code Expiry (hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={8760}
                      value={codeExpiryHours}
                      onChange={(e) => setCodeExpiryHours(e.target.value)}
                      placeholder="24"
                    />
                    <p className="text-xs text-muted-foreground">How long each generated code is valid for (max 365 days).</p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Trial Extension Days</Label>
                    <Input value={newCampaignTrialDays} onChange={(e) => setNewCampaignTrialDays(e.target.value)} disabled={!newCampaignTrialEnabled} />
                  </div>
                  <label className="md:col-span-2 flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={newCampaignTrialEnabled} onChange={(event) => setNewCampaignTrialEnabled(event.target.checked)} />
                    Enable trial extension bonus
                  </label>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Email Subject Template</Label>
                    <Input
                      value={emailSubjectTemplate}
                      onChange={(e) => setEmailSubjectTemplate(e.target.value)}
                      placeholder="Your {{campaign_name}} Salon Magik promo code"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Email Body Template</Label>
                    <Textarea value={emailBodyTemplate} onChange={(e) => setEmailBodyTemplate(e.target.value)} rows={8} />
                    <p className="text-xs text-muted-foreground">
                      Available variables: {"{{recipient_firstname}}, {{recipient_email}}, {{promo_code}}, {{campaign_name}}, {{expires_at}}, {{signup_url}}, {{login_url}}, {{discount_value}}, {{billing_targets}}"}
                    </p>
                  </div>
                </div>
                <ArtifactDialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!canSubmitCampaign}
                    onClick={() => {
                      createCampaign.mutate(
                        {
                          name: newCampaignName,
                          startsAt: newCampaignStartsAt,
                          endsAt: newCampaignEndsAt,
                          discountType: newCampaignDiscountType,
                          discountValue: Number(newCampaignDiscountValue),
                          trialEnabled: newCampaignTrialEnabled,
                          trialDays: Number(newCampaignTrialDays || 0),
                          billingTargets,
                          maxUsesPerTenant: Number(maxUsesPerTenant || 1),
                          emailSubjectTemplate,
                          emailBodyTemplate,
                          codeExpiryHours: Number(codeExpiryHours || 24),
                        },
                        {
                          onSuccess: () => {
                            setOpen(false);
                            setNewCampaignName("");
                            setNewCampaignStartsAt("");
                            setNewCampaignEndsAt("");
                            setNewCampaignDiscountType("percentage");
                            setNewCampaignDiscountValue("10");
                            setNewCampaignTrialEnabled(false);
                            setNewCampaignTrialDays("0");
                            setBillingTargets(["subscription"]);
                            setMaxUsesPerTenant("1");
                            setEmailSubjectTemplate("Your {{campaign_name}} Salon Magik promo code");
                            setEmailBodyTemplate("<p>Hello {{recipient_firstname}},</p><p>Your Salon Magik promo code for {{campaign_name}} is <strong>{{promo_code}}</strong>.</p><p>This code is reserved for {{recipient_email}} and can be used before {{expires_at}}.</p><p><a href=\"{{signup_url}}\">Create your account</a> or <a href=\"{{login_url}}\">log in</a> to continue.</p>");
                            setCodeExpiryHours("24");
                          },
                        },
                      );
                    }}
                  >
                    Create campaign
                  </Button>
                </ArtifactDialogFooter>
              </ArtifactDialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="backoffice-panel p-4">
            <div className="text-[11.5px] font-semibold text-muted-foreground">Active campaigns</div>
            <div className="mt-1 text-[22px] font-bold tabular-nums">{stats.activeCampaigns}</div>
          </div>
          <div className="backoffice-panel p-4">
            <div className="text-[11.5px] font-semibold text-muted-foreground">Redemptions, 30d</div>
            <div className="mt-1 text-[22px] font-bold tabular-nums">{stats.redemptions30d}</div>
          </div>
          <div className="backoffice-panel p-4">
            <div className="text-[11.5px] font-semibold text-muted-foreground">Conversion rate</div>
            <div className="mt-1 text-[22px] font-bold tabular-nums text-success">{stats.conversionRate}%</div>
          </div>
          <div className="backoffice-panel p-4">
            <div className="text-[11.5px] font-semibold text-muted-foreground">Commission owed</div>
            <div className="mt-1 text-[22px] font-bold tabular-nums">{stats.commissionOwed.toLocaleString()}</div>
          </div>
        </div>

        <Tabs
          value={tab ?? undefined}
          onValueChange={(v) => {
            const nextTab = v as SalesOpsTab;
            setTab(nextTab);
            navigate(PATH_BY_TAB[nextTab]);
          }}
        >
          <TabsList>
            {canCampaigns && <TabsTrigger value="campaigns">Campaigns</TabsTrigger>}
            {canCapture && <TabsTrigger value="capture-client">Capture client</TabsTrigger>}
            {canConversions && <TabsTrigger value="conversions">Conversions &amp; commissions</TabsTrigger>}
          </TabsList>

          {canCampaigns && (
            <TabsContent value="campaigns" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Tracker</CardTitle>
                  <CardDescription>Control activation and view campaign schedules.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {campaigns.map((campaign: any) => (
                    <div key={campaign.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(campaign.starts_at).toLocaleString()} - {new Date(campaign.ends_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Targets: {(campaign.billing_targets || []).join(", ")} · Max uses: {campaign.max_uses_per_tenant} · Code expiry: {campaign.code_expiry_hours ?? 24}h
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={campaign.is_active ? "success" : "neutral"} className="cursor-default">{campaign.is_active ? "Active" : "Inactive"}</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            A manual on/off toggle, independent of the campaign's Starts/Ends dates above: a campaign inside its date window can still be switched off.
                          </TooltipContent>
                        </Tooltip>
                        <Button size="sm" variant="outline" onClick={() => toggleCampaign.mutate({ id: campaign.id, isActive: !campaign.is_active })}>
                          {campaign.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!campaigns.length && (
                    <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to start tracking promo performance." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canCapture && (
            <TabsContent value="capture-client" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Promo Code</CardTitle>
                  <CardDescription>Codes are email-bound, claimable once, and remain reusable for the campaign-configured number of eligible charges.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Campaign</Label>
                      <Select value={campaignId} onValueChange={setCampaignId}>
                        <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                        <SelectContent>
                          {activeCampaigns.map((campaign: any) => (
                            <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isSuperAdmin ? (
                      <div className="space-y-2">
                        <Label>Sales Agent</Label>
                        <Select value={selectedBackofficeUserId} onValueChange={setSelectedBackofficeUserId}>
                          <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                          <SelectContent>
                            {users.map((user: any) => (
                              <SelectItem key={user.id} value={user.id}>{getUserLabel(user)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label>Recipient First Name</Label>
                      <Input value={targetFirstName} onChange={(e) => setTargetFirstName(e.target.value)} placeholder="Ada" />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Email</Label>
                      <Input type="email" value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} placeholder="owner@salon.com" />
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      let resolvedAgentId = "";
                      if (isSuperAdmin) {
                        if (!selectedBackofficeUserId) return;
                        resolvedAgentId = (await ensureAgentProfileForUser.mutateAsync(selectedBackofficeUserId)) || "";
                      } else {
                        resolvedAgentId = (await ensureOwnAgentProfile.mutateAsync()) || "";
                      }
                      const promo = await createPromoCode.mutateAsync({
                        campaignId,
                        agentId: resolvedAgentId,
                        targetEmail,
                        targetFirstName,
                      });
                      if (promo?.id) {
                        await sendPromoEmail.mutateAsync(promo.id);
                      }
                    }}
                    disabled={
                      !campaignId ||
                      !targetEmail ||
                      (isSuperAdmin && !selectedBackofficeUserId) ||
                      createPromoCode.isPending ||
                      sendPromoEmail.isPending ||
                      ensureOwnAgentProfile.isPending ||
                      ensureAgentProfileForUser.isPending
                    }
                  >
                    Generate code & send
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Latest Promo Codes</CardTitle>
                  <CardDescription>Newest codes are listed first.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promoCodes.map((promoCode: any) => (
                        <TableRow key={promoCode.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{promoCode.code}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(promoCode.code);
                                  toast.success("Promo code copied");
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{promoCode.target_email}</TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant={promoCode.status === "active" ? "default" : "secondary"} className="cursor-default">
                                  {promoCode.status}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-56 text-xs">
                                "Active" means this code can still be claimed. It stops being active once redeemed, invalidated, or past its expiry date.
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{new Date(promoCode.expires_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="outline">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(promoCode.code);
                                    toast.success("Promo code copied");
                                  }}
                                >
                                  Copy
                                </DropdownMenuItem>
                                {getPromoMeta(promoCode).resendable ? (
                                  <DropdownMenuItem onClick={async () => { await sendPromoEmail.mutateAsync(promoCode.id); }}>
                                    Resend
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onClick={() => setSelectedPromoCode(promoCode)}>
                                  View details
                                </DropdownMenuItem>
                                {isSuperAdmin ? (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={async () => {
                                      await invalidatePromoCode.mutateAsync({ promoCodeId: promoCode.id, reason: "Invalidated by super admin" });
                                    }}
                                  >
                                    Invalidate
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!promoCodes.length ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <EmptyState icon={Ticket} title="No promo codes generated yet" />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Dialog open={Boolean(selectedPromoCode)} onOpenChange={(open) => !open && setSelectedPromoCode(null)}>
                <ArtifactDialogContent>
                  <ArtifactDialogHeader>
                    <ArtifactDialogTitle>Promo code details</ArtifactDialogTitle>
                  </ArtifactDialogHeader>
                  {selectedPromoCode ? (() => {
                    const { campaign, redemption, campaignEnded, codeExpired, invalidated, remainingUses } = getPromoMeta(selectedPromoCode);
                    return (
                      <div className={cn(ARTIFACT_DIALOG_BODY_PADDING, "text-sm")}>
                        <DialogDescription className="text-[12.5px]">Current status, claim state, and remaining usage.</DialogDescription>
                        <div><span className="text-muted-foreground">Code:</span> <span className="font-medium">{selectedPromoCode.code}</span></div>
                        <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedPromoCode.target_email}</span></div>
                        <div><span className="text-muted-foreground">Campaign:</span> <span className="font-medium">{campaign?.name || "Unknown"}</span></div>
                        <div><span className="text-muted-foreground">Targets:</span> <span className="font-medium">{(campaign?.billing_targets || []).join(", ")}</span></div>
                        <div><span className="text-muted-foreground">Max uses:</span> <span className="font-medium">{campaign?.max_uses_per_tenant || 0}</span></div>
                        <div><span className="text-muted-foreground">Remaining uses:</span> <span className="font-medium">{remainingUses}</span></div>
                        <div><span className="text-muted-foreground">Claimed tenant:</span> <span className="font-medium">{selectedPromoCode.claimed_tenant_id || redemption?.tenant_id || "Not claimed"}</span></div>
                        <div><span className="text-muted-foreground">Claim status:</span> <span className="font-medium">{redemption?.status || selectedPromoCode.status}</span></div>
                        <div><span className="text-muted-foreground">Last sent:</span> <span className="font-medium">{selectedPromoCode.last_sent_at ? new Date(selectedPromoCode.last_sent_at).toLocaleString() : "Never"}</span></div>
                        <div><span className="text-muted-foreground">Send count:</span> <span className="font-medium">{selectedPromoCode.send_count || 0}</span></div>
                        <div><span className="text-muted-foreground">Campaign ended:</span> <span className="font-medium">{campaignEnded ? "Yes" : "No"}</span></div>
                        <div><span className="text-muted-foreground">Code expired:</span> <span className="font-medium">{codeExpired ? "Yes" : "No"}</span></div>
                        <div><span className="text-muted-foreground">Invalidated:</span> <span className="font-medium">{invalidated ? "Yes" : "No"}</span></div>
                        {selectedPromoCode.invalidation_reason ? (
                          <div><span className="text-muted-foreground">Invalidation reason:</span> <span className="font-medium">{selectedPromoCode.invalidation_reason}</span></div>
                        ) : null}
                      </div>
                    );
                  })() : null}
                </ArtifactDialogContent>
              </Dialog>
            </TabsContent>
          )}

          {canConversions && (
            <TabsContent value="conversions" className="mt-4 space-y-4">
              {isSuperAdmin ? (
                <div className="max-w-xs">
                  <Label>Filter by agent</Label>
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All agents</SelectItem>
                      {agents.map((agent: any) => (
                        <SelectItem key={agent.id} value={agent.id}>{getAgentLabel(agent)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <Tabs value={convTab} onValueChange={(value) => setConvTab(value as "redemptions" | "ledger")}>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant={row.status === "finalized" ? "default" : "secondary"} className="cursor-default">{row.status}</Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                              "Finalized" means this redemption is confirmed and locked in. Other statuses mean it's still pending or was reversed.
                            </TooltipContent>
                          </Tooltip>
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant={row.status === "accrued" ? "default" : "secondary"} className="cursor-default">{row.status}</Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-56 text-xs">
                                "Accrued" means this commission is owed and will be paid out. Other statuses mean it was cancelled or hasn't accrued yet.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                      {!visibleCommissions.length && <p className="text-sm text-muted-foreground">No commission entries yet.</p>}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </BackofficeLayout>
  );
}
