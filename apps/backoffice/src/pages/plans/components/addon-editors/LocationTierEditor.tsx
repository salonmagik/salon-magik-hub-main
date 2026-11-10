import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { CURRENCIES, deriveAnnualTotal, deriveEffectiveMonthly, parseNumericInput } from "../../utils";
import type { ChainTierRowDraft, CurrencyCode } from "../../types";

interface LocationTierEditorProps {
  chainTierDrafts: Record<CurrencyCode, ChainTierRowDraft[]>;
  addChainTierRow: (currency: CurrencyCode) => void;
  updateChainTierRow: (currency: CurrencyCode, localId: string, patch: Partial<ChainTierRowDraft>) => void;
  removeChainTierRow: (currency: CurrencyCode, localId: string) => void;
  locationPricingReason: string;
  setLocationPricingReason: (value: string) => void;
  setChainTierDirty: (dirty: boolean) => void;
  canSubmit: boolean;
  saveChainTiersMutation: UseMutationResult<void, unknown, void>;
}

/** Tiered per-location pricing for the Chain plan's "additional locations" add-on. */
export function LocationTierEditor({
  chainTierDrafts,
  addChainTierRow,
  updateChainTierRow,
  removeChainTierRow,
  locationPricingReason,
  setLocationPricingReason,
  setChainTierDirty,
  canSubmit,
  saveChainTiersMutation,
}: LocationTierEditorProps) {
  return (
    <div className="mt-4 rounded-2xl border bg-background p-4">
      <p className="mb-3 text-sm font-medium">Edit additional location pricing</p>
      <div className="mt-4 rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Additional locations</p>
            <p className="text-xs text-muted-foreground">Set the monthly price and annual discount. Annual pricing is calculated automatically as monthly × 12 after the discount.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => CURRENCIES.forEach((currency) => addChainTierRow(currency))}>Add tier</Button>
        </div>
        <div className="space-y-3">
          {CURRENCIES.map((currency) => (
            <div key={currency}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{currency}</p>
              <div className="mb-1 hidden grid-cols-[100px_1fr_150px_1fr_auto_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Tier</span>
                <span>Monthly / location</span>
                <span>Annual discount %</span>
                <span>Annual after discount</span>
                <span />
                <span />
              </div>
              <div className="space-y-2">
                {chainTierDrafts[currency].map((row) => (
                  <div key={row.localId} className="grid gap-2 sm:grid-cols-[100px_1fr_150px_1fr_auto_auto]">
                    <Input value={row.tier_label} onChange={(e) => updateChainTierRow(currency, row.localId, { tier_label: e.target.value })} aria-label={`${currency} location tier`} />
                    <Input type="number" min="0" step="0.01" placeholder="Monthly / location" value={row.price_per_location} disabled={row.is_custom} onChange={(e) => updateChainTierRow(currency, row.localId, { price_per_location: e.target.value })} />
                    <Input type="number" min="0" max="100" step="0.01" placeholder="Annual discount %" value={row.annual_discount_pct} disabled={row.is_custom} onChange={(e) => updateChainTierRow(currency, row.localId, { annual_discount_pct: e.target.value })} aria-label={`${currency} annual discount percentage`} />
                    <Input type="number" placeholder="Annual after discount" value={row.is_custom || !row.price_per_location.trim() ? "" : deriveAnnualTotal(deriveEffectiveMonthly(Number(row.price_per_location), Math.max(0, Math.min(100, parseNumericInput(row.annual_discount_pct || "0")))))} disabled readOnly aria-label={`${currency} annual price per location after discount`} />
                    <div className="flex items-center gap-2 rounded-md border px-2"><Switch checked={row.is_custom} onCheckedChange={(checked) => updateChainTierRow(currency, row.localId, { is_custom: checked })} /><span className="text-xs">Custom</span></div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeChainTierRow(currency, row.localId)} disabled={chainTierDrafts[currency].length <= 1} aria-label={`Remove ${currency} location tier`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <Label>Location pricing reason</Label>
          <Textarea
            value={locationPricingReason}
            onChange={(e) => {
              setChainTierDirty(true);
              setLocationPricingReason(e.target.value);
            }}
            placeholder="Why are you updating additional location pricing?"
          />
        </div>
        <Button onClick={() => saveChainTiersMutation.mutate()} disabled={!canSubmit}>
          {saveChainTiersMutation.isPending ? "Saving…" : "Save location pricing"}
        </Button>
      </div>
    </div>
  );
}
