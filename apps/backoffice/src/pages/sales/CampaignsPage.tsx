import { useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useSalesOps } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { Megaphone } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ui/dialog";

export default function CampaignsPage() {
  const { campaignsQuery, createCampaign, toggleCampaign } = useSalesOps();
  const campaigns = campaignsQuery.data || [];

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

  const canSubmit =
    Boolean(newCampaignName) &&
    Boolean(newCampaignStartsAt) &&
    Boolean(newCampaignEndsAt) &&
    billingTargets.length > 0 &&
    Number(maxUsesPerTenant) >= 1 &&
    Number(codeExpiryHours) >= 1 &&
    !createCampaign.isPending;

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales Ops · Campaigns</h1>
            <p className="text-muted-foreground">Manage campaign windows, discount setup, and trial bonus policy.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Create campaign</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
                <DialogDescription>Define discount period and optional trial extension.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
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
                              if (event.target.checked) {
                                return Array.from(new Set([...prev, target]));
                              }
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
                  <Input
                    type="number"
                    min={1}
                    value={maxUsesPerTenant}
                    onChange={(e) => setMaxUsesPerTenant(e.target.value)}
                  />
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
                  <Textarea
                    value={emailBodyTemplate}
                    onChange={(e) => setEmailBodyTemplate(e.target.value)}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available variables: {"{{recipient_firstname}}, {{recipient_email}}, {{promo_code}}, {{campaign_name}}, {{expires_at}}, {{signup_url}}, {{login_url}}, {{discount_value}}, {{billing_targets}}"}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!canSubmit}
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
                  Save campaign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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
                  <Badge variant={campaign.is_active ? "success" : "neutral"}>{campaign.is_active ? "Active" : "Inactive"}</Badge>
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
      </div>
    </BackofficeLayout>
  );
}
