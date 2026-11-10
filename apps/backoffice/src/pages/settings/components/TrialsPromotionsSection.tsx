import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Gift } from "lucide-react";
import type { useTrialsPromotions } from "../hooks/useTrialsPromotions";

interface TrialsPromotionsSectionProps {
  isSuperAdmin: boolean;
  trials: ReturnType<typeof useTrialsPromotions>;
}

export function TrialsPromotionsSection({ isSuperAdmin, trials }: TrialsPromotionsSectionProps) {
  const { promoBonusEnabled } = trials;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Global Trial Period</CardTitle>
          <CardDescription>
            Controls the default trial period used when tenant-specific overrides are not set.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Default trial days</Label>
            <Input
              type="number"
              min={0}
              value={trials.trialDaysDraft}
              onChange={(event) => trials.setTrialDaysDraft(Number(event.target.value || 0))}
              className="w-40"
              disabled={!isSuperAdmin}
            />
          </div>
          <Button
            onClick={() => trials.updateDefaultTrialDaysMutation.mutate(trials.trialDaysDraft)}
            disabled={!isSuperAdmin || trials.updateDefaultTrialDaysMutation.isPending}
          >
            Save Trial Days
          </Button>
          <p className="text-sm text-muted-foreground">
            Current: {trials.defaultTrialDays ?? 14} day(s)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${!promoBonusEnabled ? "bg-muted" : "bg-warning-bg text-warning"}`}>
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Promo Code Trial Bonus</CardTitle>
              <CardDescription>
                Extra trial days when a new salon applies a promo code within N days of signing up. Read live by the
                salon-admin app's upgrade nudges (banner + reminder modals). Turning this off here removes the offer
                from that UI immediately, no code change needed.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!promoBonusEnabled && (
            <Alert className="border-warning/30 bg-warning-bg text-warning">
              <Gift className="h-4 w-4" />
              <AlertTitle>Promo trial bonus is off</AlertTitle>
              <AlertDescription>
                Applying a promo code no longer extends a tenant's trial, and the upgrade nudges won't mention the
                offer. Use this to pause the incentive for a quarter without touching code.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-medium">Enable trial bonus</p>
              <p className="text-sm text-muted-foreground">Turn the whole incentive on or off</p>
            </div>
            <Switch
              checked={promoBonusEnabled}
              onCheckedChange={trials.setPromoBonusEnabled}
              disabled={!isSuperAdmin}
            />
          </div>

          <div className={`grid gap-4 md:grid-cols-2 transition-opacity ${!promoBonusEnabled ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="space-y-2">
              <Label>Eligibility window (days since signup)</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={trials.promoBonusWindowDays}
                onChange={(e) => trials.setPromoBonusWindowDays(Math.max(1, Number(e.target.value || 1)))}
                className="w-36"
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Default: 7</p>
            </div>
            <div className="space-y-2">
              <Label>Bonus trial days granted</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={trials.promoBonusDays}
                onChange={(e) => trials.setPromoBonusDays(Math.max(1, Number(e.target.value || 1)))}
                className="w-36"
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Default: 7</p>
            </div>
          </div>

          <Button
            onClick={() => trials.updatePromoBonusMutation.mutate({ enabled: promoBonusEnabled, windowDays: trials.promoBonusWindowDays, bonusDays: trials.promoBonusDays })}
            disabled={!isSuperAdmin || trials.updatePromoBonusMutation.isPending}
          >
            Save Promo Bonus Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Gifted Trials</CardTitle>
          <CardDescription>
            Create temporary trial overrides for specific tenants independent of the global trial window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Tenant ID</Label>
              <Input
                value={trials.overrideTenantId}
                onChange={(event) => trials.setOverrideTenantId(event.target.value)}
                placeholder="Tenant UUID"
                disabled={!isSuperAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Starts</Label>
              <Input
                type="datetime-local"
                value={trials.overrideStartsAt}
                onChange={(event) => trials.setOverrideStartsAt(event.target.value)}
                disabled={!isSuperAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Ends</Label>
              <Input
                type="datetime-local"
                value={trials.overrideEndsAt}
                onChange={(event) => trials.setOverrideEndsAt(event.target.value)}
                disabled={!isSuperAdmin}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={trials.overrideReason}
              onChange={(event) => trials.setOverrideReason(event.target.value)}
              placeholder="Why this tenant is receiving a gifted trial"
              disabled={!isSuperAdmin}
            />
          </div>

          <Button
            onClick={() => trials.createTrialOverrideMutation.mutate()}
            disabled={!isSuperAdmin || trials.createTrialOverrideMutation.isPending}
          >
            Create Trial Override
          </Button>

          <div className="space-y-2">
            {(trials.trialOverrides ?? []).map((override) => (
              <div key={override.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">{override.tenant_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(override.starts_at).toLocaleString()} - {new Date(override.ends_at).toLocaleString()}
                  </p>
                  {override.reason && (
                    <p className="text-xs text-muted-foreground">{override.reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant={override.status === "active" ? "default" : "secondary"} className="cursor-default">
                        {override.status}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-xs">
                      {override.status === "active"
                        ? "Currently in effect: this tenant's trial window is extended."
                        : "No longer in effect, either because it expired naturally or was manually revoked."}
                    </TooltipContent>
                  </Tooltip>
                  {override.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => trials.revokeTrialOverrideMutation.mutate(override.id)}
                      disabled={!isSuperAdmin || trials.revokeTrialOverrideMutation.isPending}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!(trials.trialOverrides ?? []).length && (
              <p className="text-sm text-muted-foreground">No tenant overrides created yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
