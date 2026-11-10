import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import type { UseMutationResult } from "@tanstack/react-query";
import { MARKETING_ADDON_STATUS_OPTIONS } from "../utils";
import type { MarketingAddonDraft } from "../types";

interface MarketingAddonsEditorProps {
  isSuperAdmin: boolean;
  marketingAddonsDraft: MarketingAddonDraft[];
  setMarketingAddonsDraft: (updater: (prev: MarketingAddonDraft[]) => MarketingAddonDraft[]) => void;
  setMarketingAddonsDirty: (dirty: boolean) => void;
  marketingAddonsReason: string;
  setMarketingAddonsReason: (value: string) => void;
  saveMarketingAddonsMutation: UseMutationResult<void, unknown, void>;
}

/** Customer-facing add-on names/descriptions/availability shown on the marketing pricing page. */
export function MarketingAddonsEditor({
  isSuperAdmin,
  marketingAddonsDraft,
  setMarketingAddonsDraft,
  setMarketingAddonsDirty,
  marketingAddonsReason,
  setMarketingAddonsReason,
  saveMarketingAddonsMutation,
}: MarketingAddonsEditorProps) {
  const canSubmit =
    isSuperAdmin &&
    marketingAddonsReason.trim().length > 0 &&
    marketingAddonsDraft.length > 0 &&
    marketingAddonsDraft.every((addon) => addon.name.trim() && addon.description.trim()) &&
    !saveMarketingAddonsMutation.isPending;

  return (
    <div className="mb-4 rounded-2xl border bg-background p-4">
      <div className="mb-3">
        <p className="text-xs text-muted-foreground">These names, descriptions, and status badges feed the add-ons section on the marketing pricing page. Hidden items are omitted; coming-soon items remain visible with a badge.</p>
      </div>
      <div className="space-y-3">
        {marketingAddonsDraft.map((addon, index) => (
          <div key={addon.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-[180px_1fr_150px]">
            <div className="flex items-center"><p className="text-sm font-medium">{addon.key.replace(/_/g, " ")}</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={addon.name}
                onChange={(event) => {
                  setMarketingAddonsDirty(true);
                  setMarketingAddonsDraft((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)));
                }}
                placeholder="Customer-facing name"
              />
              <Input
                value={addon.description}
                onChange={(event) => {
                  setMarketingAddonsDirty(true);
                  setMarketingAddonsDraft((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)));
                }}
                placeholder="Customer-facing description"
              />
            </div>
            <Select
              value={addon.status}
              onValueChange={(value) => {
                setMarketingAddonsDirty(true);
                setMarketingAddonsDraft((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, status: value as MarketingAddonDraft["status"] } : item)));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MARKETING_ADDON_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <Label>Reason</Label>
          <Textarea
            value={marketingAddonsReason}
            onChange={(event) => {
              setMarketingAddonsDirty(true);
              setMarketingAddonsReason(event.target.value);
            }}
            placeholder="Why are you updating the public add-on list?"
          />
        </div>
        <Button onClick={() => saveMarketingAddonsMutation.mutate()} disabled={!canSubmit}>
          {saveMarketingAddonsMutation.isPending ? "Saving…" : "Save public add-on list"}
        </Button>
      </div>
    </div>
  );
}
