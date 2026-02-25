import { useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useSalesOps } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
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

  const canSubmit =
    Boolean(newCampaignName) &&
    Boolean(newCampaignStartsAt) &&
    Boolean(newCampaignEndsAt) &&
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
                  <Label>Trial Extension Days</Label>
                  <Input value={newCampaignTrialDays} onChange={(e) => setNewCampaignTrialDays(e.target.value)} disabled={!newCampaignTrialEnabled} />
                </div>
                <label className="md:col-span-2 flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={newCampaignTrialEnabled} onChange={(event) => setNewCampaignTrialEnabled(event.target.checked)} />
                  Enable trial extension bonus
                </label>
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
      </div>
    </BackofficeLayout>
  );
}

