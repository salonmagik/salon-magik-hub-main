import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import type { UseMutationResult } from "@tanstack/react-query";
import { PRICING_STATUS_OPTIONS } from "../../utils";
import type { PricingMarket, PricingStatus } from "../../types";

/** The shared shape of a seat / Staff Operations per-market pricing draft row. */
interface MarketPriceDraft {
  unit_price: string;
  status: PricingStatus;
  notes: string;
}

interface MarketPricingEditorProps<T extends MarketPriceDraft> {
  title: string;
  unitLabel: string;
  pricingMarkets: PricingMarket[];
  drafts: Record<string, T>;
  onUpdate: (countryCode: string, patch: Partial<T>) => void;
  reason: string;
  setReason: (value: string) => void;
  setDirty: (dirty: boolean) => void;
  reasonLabel: string;
  reasonPlaceholder: string;
  canSubmit: boolean;
  saveMutation: UseMutationResult<void, unknown, void>;
  saveLabel: string;
}

/**
 * Reusable per-market pricing editor: used for both the "Additional seats"
 * and "Staff Operations" add-ons, which share an identical draft shape
 * (unit_price / status / notes per country). The e-commerce theme add-on
 * has the same per-market row shape but also edits catalog fields (name/
 * description/active) above it, so it stays as its own component instead
 * of being forced through this one.
 */
export function MarketPricingEditor<T extends MarketPriceDraft>({
  title,
  unitLabel,
  pricingMarkets,
  drafts,
  onUpdate,
  reason,
  setReason,
  setDirty,
  reasonLabel,
  reasonPlaceholder,
  canSubmit,
  saveMutation,
  saveLabel,
}: MarketPricingEditorProps<T>) {
  return (
    <div className="mt-4 rounded-2xl border bg-background p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {pricingMarkets.map((market) => {
          const draft = drafts[market.country_code];
          return (
            <div key={market.country_code} className="rounded-md border p-3">
              <div className="mb-2">
                <p className="text-sm font-medium">{market.country_name}</p>
                <p className="text-xs text-muted-foreground">{unitLabel}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft?.unit_price || ""}
                  onChange={(e) => onUpdate(market.country_code, { unit_price: e.target.value } as Partial<T>)}
                  aria-label={`${market.country_name} price`}
                />
                <Select
                  value={draft?.status || "active"}
                  onValueChange={(value) => onUpdate(market.country_code, { status: value as PricingStatus } as Partial<T>)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICING_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input
                className="mt-2"
                value={draft?.notes || ""}
                onChange={(e) => onUpdate(market.country_code, { notes: e.target.value } as Partial<T>)}
                placeholder="Internal pricing note (optional)"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <Label>{reasonLabel}</Label>
          <Textarea
            value={reason}
            onChange={(e) => {
              setDirty(true);
              setReason(e.target.value);
            }}
            placeholder={reasonPlaceholder}
          />
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={!canSubmit}>
          {saveMutation.isPending ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
