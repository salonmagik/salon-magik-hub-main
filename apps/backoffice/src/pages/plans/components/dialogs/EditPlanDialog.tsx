import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Coins, Plus, Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";
import { CURRENCIES, createFeatureDraft } from "../../utils";
import type { CurrencyCode, PlanDraft, PlanPricing, RolloutMode } from "../../types";
import type { MutableRefObject } from "react";

interface EditPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: PlanDraft | null;
  setDraft: (updater: (prev: PlanDraft | null) => PlanDraft | null) => void;
  planId: string | null;
  activePricingForPlan: Map<CurrencyCode, PlanPricing> | undefined;
  rolloutMode: RolloutMode;
  setRolloutMode: (mode: RolloutMode) => void;
  rolloutAt: string;
  setRolloutAt: (value: string) => void;
  saveRef: MutableRefObject<boolean>;
  validation: { isValid: boolean; errors: string[] };
  onEditBasePrice: () => void;
  isSuperAdmin: boolean;
  mutation: UseMutationResult<{ data: unknown; rolloutMode: RolloutMode }, unknown, { planId: string; draft: PlanDraft; rolloutMode: RolloutMode; rolloutAt: string | null }>;
  onSaved: () => void;
}

export function EditPlanDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  planId,
  activePricingForPlan,
  rolloutMode,
  setRolloutMode,
  rolloutAt,
  setRolloutAt,
  saveRef,
  validation,
  onEditBasePrice,
  isSuperAdmin,
  mutation,
  onSaved,
}: EditPlanDialogProps) {
  const canSubmit = isSuperAdmin && validation.isValid && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Edit base subscription</DialogTitle>
          <DialogDescription>
            Manage the single customer-facing subscription. Add-ons, market prices, and growth progression are configured in their own sections so each setting has one source of truth.
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <div className={cn(DIALOG_BODY_PADDING, "space-y-6")}>
            {validation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {validation.errors.slice(0, 6).map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            <section className="rounded-2xl border bg-muted/20 p-4">
              <div className="mb-3">
                <p className="font-medium">Customer-facing subscription</p>
                <p className="text-sm text-muted-foreground">This name and description are shown on pricing, onboarding, and subscription screens.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Subscription name</Label>
                  <Input value={draft.name} onChange={(event) => setDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))} />
                </div>
                <div className="flex items-end gap-3 pb-2">
                  <Switch checked={draft.is_active} onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, is_active: checked } : prev))} />
                  <div>
                    <Label>Visible to customers</Label>
                    <p className="text-xs text-muted-foreground">Turn off only when retiring this subscription.</p>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Label>Description</Label>
                <Textarea
                  value={draft.description}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                  placeholder="Explain who this subscription is for."
                />
              </div>
            </section>

            <section className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Trial and base price</p>
                  <p className="text-sm text-muted-foreground">Trial access is configured here. Prices are edited once per market in the base price editor.</p>
                </div>
                {planId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onEditBasePrice();
                    }}
                  >
                    <Coins className="mr-2 h-3.5 w-3.5" />
                    Edit base price
                  </Button>
                )}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Trial days</Label>
                  <Input
                    type="number"
                    min="0"
                    value={draft.trial_days}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, trial_days: Number(event.target.value || 0) } : prev))}
                  />
                </div>
                {CURRENCIES.map((currency) => {
                  const row = activePricingForPlan?.get(currency);
                  return (
                    <div key={currency} className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{currency}</p>
                      <p className="mt-1 text-sm font-semibold">{row ? `${getCurrencySymbol(currency)}${row.monthly_price.toLocaleString()}/month` : "Not configured"}</p>
                      <p className="text-xs text-muted-foreground">{row ? `Annual ${getCurrencySymbol(currency)}${row.annual_price.toLocaleString()}` : "Add a market price before publishing."}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Included benefits</p>
                  <p className="text-sm text-muted-foreground">This list feeds the marketing pricing page and customer subscription views.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft((prev) => (prev ? { ...prev, features: [...prev.features, createFeatureDraft(prev.features.length)] } : prev))}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add benefit
                </Button>
              </div>
              <div className="space-y-2">
                {draft.features.map((feature) => (
                  <div key={feature.localId} className="grid gap-2 md:grid-cols-[1fr_120px_80px]">
                    <Input
                      value={feature.feature_text}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, features: prev.features.map((item) => (item.localId === feature.localId ? { ...item, feature_text: event.target.value } : item)) } : prev))}
                      placeholder="e.g. Unlimited email marketing"
                    />
                    <Input
                      type="number"
                      value={feature.sort_order}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, features: prev.features.map((item) => (item.localId === feature.localId ? { ...item, sort_order: Number(event.target.value || 0) } : item)) } : prev))}
                      aria-label="Benefit order"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setDraft((prev) => (prev ? { ...prev, features: prev.features.filter((item) => item.localId !== feature.localId) } : prev))}
                      disabled={draft.features.length <= 1}
                      aria-label="Remove benefit"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-dashed p-4">
              <p className="font-medium">Configured separately</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Growth progression thresholds, additional locations and seats, Staff Operations, paid themes, SMS bundles, and complimentary SMS allowances each have their own editor below. This keeps pricing changes auditable and prevents conflicting settings.
              </p>
            </section>

            <div>
              <Label>Reason for change</Label>
              <Textarea
                value={draft.reason}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, reason: event.target.value } : prev))}
                placeholder="Describe why this subscription or benefit copy is changing."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Publishing</Label>
                <Select value={rolloutMode} onValueChange={(value) => setRolloutMode(value as RolloutMode)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Publish now</SelectItem>
                    <SelectItem value="schedule">Schedule publishing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {rolloutMode === "schedule" && (
                <div>
                  <Label>Publish at</Label>
                  <Input className="mt-2" type="datetime-local" value={rolloutAt} onChange={(event) => setRolloutAt(event.target.value)} />
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (mutation.isPending || saveRef.current) return;
              if (!draft || !planId) return;
              saveRef.current = true;
              mutation.mutate(
                {
                  planId,
                  draft,
                  rolloutMode,
                  rolloutAt: rolloutMode === "schedule" && rolloutAt ? new Date(rolloutAt).toISOString() : null,
                },
                {
                  onSuccess: onSaved,
                  onSettled: () => {
                    saveRef.current = false;
                  },
                },
              );
            }}
            disabled={!canSubmit}
          >
            {mutation.isPending ? "Saving..." : "Save subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
