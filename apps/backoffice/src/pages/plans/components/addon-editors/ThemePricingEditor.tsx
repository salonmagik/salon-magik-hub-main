import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import type { UseMutationResult } from "@tanstack/react-query";
import { PRICING_STATUS_OPTIONS } from "../../utils";
import type { PricingMarket, PricingStatus, ThemePricingDraft } from "../../types";

interface ThemeCatalogDraft {
  name: string;
  description: string;
  is_active: boolean;
}

interface ThemePricingEditorProps {
  pricingMarkets: PricingMarket[];
  themeCatalogDraft: ThemeCatalogDraft;
  setThemeCatalogDraft: (updater: (prev: ThemeCatalogDraft) => ThemeCatalogDraft) => void;
  themePricingDrafts: Record<string, ThemePricingDraft>;
  updateThemePricingDraft: (countryCode: string, patch: Partial<ThemePricingDraft>) => void;
  themePricingReason: string;
  setThemePricingReason: (value: string) => void;
  setThemePricingDirty: (dirty: boolean) => void;
  isSuperAdmin: boolean;
  saveThemeCatalogMutation: UseMutationResult<void, unknown, void>;
  saveThemePricingMutation: UseMutationResult<void, unknown, void>;
  canSubmitThemePricing: boolean;
}

/** E-commerce theme add-on: catalog details (name/description/active) plus per-market annual pricing. */
export function ThemePricingEditor({
  pricingMarkets,
  themeCatalogDraft,
  setThemeCatalogDraft,
  themePricingDrafts,
  updateThemePricingDraft,
  themePricingReason,
  setThemePricingReason,
  setThemePricingDirty,
  isSuperAdmin,
  saveThemeCatalogMutation,
  saveThemePricingMutation,
  canSubmitThemePricing,
}: ThemePricingEditorProps) {
  return (
    <div className="mt-4 rounded-2xl border bg-background p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">Edit e-commerce theme add-on</p>
        <p className="text-xs text-muted-foreground">This name, description, availability, and annual market pricing feed the customer-facing add-on list.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label>Name</Label>
          <Input value={themeCatalogDraft.name} onChange={(e) => setThemeCatalogDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="E-commerce themes" />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={themeCatalogDraft.description} onChange={(e) => setThemeCatalogDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="Annual storefront theme add-on" />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Switch checked={themeCatalogDraft.is_active} onCheckedChange={(checked) => setThemeCatalogDraft((prev) => ({ ...prev, is_active: checked }))} />
          <Label>Available</Label>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {pricingMarkets.map((market) => {
          const draft = themePricingDrafts[market.country_code];
          return (
            <div key={market.country_code} className="rounded-md border p-3">
              <div className="mb-2">
                <p className="text-sm font-medium">{market.country_name}</p>
                <p className="text-xs text-muted-foreground">Per theme / year</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                <Input type="number" min="0" step="0.01" value={draft?.unit_price || ""} onChange={(e) => updateThemePricingDraft(market.country_code, { unit_price: e.target.value })} aria-label={`${market.country_name} theme price`} />
                <Select value={draft?.status || "active"} onValueChange={(value) => updateThemePricingDraft(market.country_code, { status: value as PricingStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICING_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input className="mt-2" value={draft?.notes || ""} onChange={(e) => updateThemePricingDraft(market.country_code, { notes: e.target.value })} placeholder="Internal pricing note (optional)" />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <Label>Reason</Label>
          <Textarea
            value={themePricingReason}
            onChange={(e) => {
              setThemePricingDirty(true);
              setThemePricingReason(e.target.value);
            }}
            placeholder="Why are you updating theme pricing?"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => saveThemeCatalogMutation.mutate()}
            disabled={!isSuperAdmin || saveThemeCatalogMutation.isPending || !themeCatalogDraft.name.trim() || !themePricingReason.trim()}
          >
            {saveThemeCatalogMutation.isPending ? "Saving…" : "Save add-on details"}
          </Button>
          <Button onClick={() => saveThemePricingMutation.mutate()} disabled={!canSubmitThemePricing}>
            {saveThemePricingMutation.isPending ? "Saving…" : "Save theme pricing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
