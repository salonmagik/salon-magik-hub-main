import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { SmsComplimentaryDraft, SmsCreditPricingDraft, SmsCreditTierDraft } from "../../types";

interface MessagingPricingEditorProps {
  smsPricingDraft: SmsCreditPricingDraft;
  setSmsPricingDraft: (updater: (prev: SmsCreditPricingDraft) => SmsCreditPricingDraft) => void;
  smsComplimentaryDraft: SmsComplimentaryDraft;
  setSmsComplimentaryDraft: (updater: (prev: SmsComplimentaryDraft) => SmsComplimentaryDraft) => void;
  setSmsPricingDirty: (dirty: boolean) => void;
  updateSmsPricingTier: (currency: "NGN" | "GHS", index: number, patch: Partial<SmsCreditTierDraft>) => void;
  addSmsPricingTier: (currency: "NGN" | "GHS") => void;
  removeSmsPricingTier: (currency: "NGN" | "GHS", index: number) => void;
  smsPricingReason: string;
  setSmsPricingReason: (value: string) => void;
  canSubmitSmsPricing: boolean;
  saveSmsPricingMutation: UseMutationResult<void, unknown, void>;
}

/** SMS credit bundle pricing (provider cost + margin) and complimentary monthly allowances. */
export function MessagingPricingEditor({
  smsPricingDraft,
  setSmsPricingDraft,
  smsComplimentaryDraft,
  setSmsComplimentaryDraft,
  setSmsPricingDirty,
  updateSmsPricingTier,
  addSmsPricingTier,
  removeSmsPricingTier,
  smsPricingReason,
  setSmsPricingReason,
  canSubmitSmsPricing,
  saveSmsPricingMutation,
}: MessagingPricingEditorProps) {
  return (
    <div className="mt-4 rounded-2xl border bg-background p-4">
      <div className="mb-4">
        <p className="text-sm font-medium">Edit messaging SMS pricing</p>
        <p className="text-xs text-muted-foreground">
          Set the provider cost and margin used to calculate credits, plus the monthly complimentary allowances.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Margin multiplier</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={smsPricingDraft.margin_multiplier}
            onChange={(e) => {
              setSmsPricingDirty(true);
              setSmsPricingDraft((prev) => ({ ...prev, margin_multiplier: e.target.value }));
            }}
          />
        </div>
        <div>
          <Label>Low balance alert threshold</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={smsPricingDraft.low_balance_threshold_credits}
            onChange={(e) => {
              setSmsPricingDirty(true);
              setSmsPricingDraft((prev) => ({ ...prev, low_balance_threshold_credits: e.target.value }));
            }}
          />
        </div>
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">Credits are calculated from bundle price ÷ provider cost ÷ margin. Purchased SMS never expires.</div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(Object.keys(smsPricingDraft.tiers) as Array<"NGN" | "GHS">).map((currency) => (
          <div key={currency} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{currency} bundles</p>
                <p className="text-xs text-muted-foreground">Bundle price and provider cost per SMS</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => addSmsPricingTier(currency)}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add tier
              </Button>
            </div>
            <div className="space-y-2">
              {smsPricingDraft.tiers[currency].map((tier, index) => (
                <div key={`${currency}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input type="number" min="0" step="0.01" placeholder="Bundle price" value={tier.bundle_price} onChange={(e) => updateSmsPricingTier(currency, index, { bundle_price: e.target.value })} aria-label={`${currency} bundle price ${index + 1}`} />
                  <Input type="number" min="0" step="0.0001" placeholder="Provider cost / SMS" value={tier.arkesel_cost_per_sms} onChange={(e) => updateSmsPricingTier(currency, index, { arkesel_cost_per_sms: e.target.value })} aria-label={`${currency} provider cost ${index + 1}`} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSmsPricingTier(currency, index)} aria-label={`Remove ${currency} bundle ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border p-3">
        <p className="mb-2 text-sm font-medium">Monthly complimentary SMS</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Appointment reminders</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={smsComplimentaryDraft.reminder_segments}
              onChange={(e) => {
                setSmsPricingDirty(true);
                setSmsComplimentaryDraft((prev) => ({ ...prev, reminder_segments: e.target.value }));
              }}
            />
          </div>
          <div>
            <Label>Marketing campaigns</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={smsComplimentaryDraft.marketing_segments}
              onChange={(e) => {
                setSmsPricingDirty(true);
                setSmsComplimentaryDraft((prev) => ({ ...prev, marketing_segments: e.target.value }));
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <Label>Reason</Label>
          <Textarea
            value={smsPricingReason}
            onChange={(e) => {
              setSmsPricingDirty(true);
              setSmsPricingReason(e.target.value);
            }}
            placeholder="Why are you updating messaging pricing?"
          />
        </div>
        <Button onClick={() => saveSmsPricingMutation.mutate()} disabled={!canSubmitSmsPricing}>
          {saveSmsPricingMutation.isPending ? "Saving…" : "Save messaging pricing"}
        </Button>
      </div>
    </div>
  );
}
