import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Pencil } from "lucide-react";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";
import { CURRENCIES } from "../utils";
import type { useAddonPricing } from "../hooks/useAddonPricing";
import type { useChainTierPricing } from "../hooks/useChainTierPricing";
import type { CurrencyCode, Plan, PlanFeature, PlanPricing } from "../types";
import { IncludedBenefitsSection } from "./IncludedBenefitsSection";
import { MarketingAddonsEditor } from "./MarketingAddonsEditor";
import { AddonSummaryGrid, type AddonKey } from "./AddonSummaryGrid";
import { LocationTierEditor } from "./addon-editors/LocationTierEditor";
import { MarketPricingEditor } from "./addon-editors/MarketPricingEditor";
import { ThemePricingEditor } from "./addon-editors/ThemePricingEditor";
import { MessagingPricingEditor } from "./addon-editors/MessagingPricingEditor";

interface BaseSubscriptionCardProps {
  isSuperAdmin: boolean;
  basePlan: Plan | null;
  basePlanFeatures: PlanFeature[];
  basePlanPricing: Map<CurrencyCode, PlanPricing> | undefined;
  onEditSubscription: () => void;
  onEditBasePrice: () => void;
  onEditBenefits: () => void;
  editingAddon: AddonKey | null;
  setEditingAddon: (key: AddonKey | null) => void;
  addonPricing: ReturnType<typeof useAddonPricing>;
  chainTier: ReturnType<typeof useChainTierPricing>;
  /** Matches PricingCatalog.dc.html's tab split: "addons" renders the compact
      strip + the add-ons × markets matrix + whichever editor is open;
      "plan" renders the full customer-facing name/trial/price + benefits +
      marketing add-ons. Same data/mutations either way. */
  view: "addons" | "plan";
}

export function BaseSubscriptionCard({
  isSuperAdmin,
  basePlan,
  basePlanFeatures,
  basePlanPricing,
  onEditSubscription,
  onEditBasePrice,
  onEditBenefits,
  editingAddon,
  setEditingAddon,
  addonPricing,
  chainTier,
  view,
}: BaseSubscriptionCardProps) {
  const canSubmitChainTiers = isSuperAdmin && chainTier.chainTierValidation.isValid && !chainTier.saveChainTiersMutation.isPending;
  const canSubmitSeatPricing = isSuperAdmin && addonPricing.seatPricingValidation.isValid && !addonPricing.saveSeatPricingMutation.isPending;
  const canSubmitStaffOperationsPricing = isSuperAdmin && addonPricing.staffOperationsPricingValidation.isValid && !addonPricing.saveStaffOperationsPricingMutation.isPending;
  const canSubmitThemePricing = isSuperAdmin && addonPricing.themePricingValidation.isValid && !addonPricing.saveThemePricingMutation.isPending;
  const canSubmitSmsPricing = isSuperAdmin && addonPricing.smsPricingValidation.isValid && !addonPricing.saveSmsPricingMutation.isPending;

  if (!basePlan) {
    return (
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Loading the base subscription…</p>
        </CardContent>
      </Card>
    );
  }

  if (view === "plan") {
    return (
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>One base subscription</CardTitle>
              <CardDescription>
                Configure the customer-facing subscription once. Locations, seats, SMS, themes, and Staff Operations are add-ons as a salon grows.
              </CardDescription>
            </div>
            {isSuperAdmin && (
              <Button variant="outline" onClick={onEditSubscription}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit subscription
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
            <div className="rounded-2xl border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer-facing name</p>
              <p className="mt-1 text-lg font-semibold">{basePlan.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{basePlan.description || "Add a short description for the pricing page."}</p>
            </div>
            <div className="rounded-2xl border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trial</p>
              <p className="mt-1 text-lg font-semibold">{basePlan.trial_days} days</p>
              <p className="mt-1 text-sm text-muted-foreground">Full product access during trial.</p>
            </div>
            <div className="rounded-2xl border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base price</p>
              <div className="mt-1 space-y-1">
                {CURRENCIES.map((currency) => {
                  const row = basePlanPricing?.get(currency);
                  return (
                    <p key={currency} className="text-sm font-medium">
                      {currency} {row ? `${getCurrencySymbol(currency)}${row.monthly_price.toLocaleString()}/month` : "Not configured"}
                    </p>
                  );
                })}
              </div>
              {isSuperAdmin && (
                <Button variant="link" className="h-auto p-0 pt-2" onClick={onEditBasePrice}>
                  Edit base price
                </Button>
              )}
            </div>
          </div>

          <IncludedBenefitsSection basePlanFeatures={basePlanFeatures} isSuperAdmin={isSuperAdmin} onEdit={onEditBenefits} />

          <div>
            <div className="mb-2">
              <p className="font-medium">Marketing add-ons</p>
              <p className="text-sm text-muted-foreground">Customer-facing copy shown on the marketing pricing page.</p>
            </div>
            <MarketingAddonsEditor
              isSuperAdmin={isSuperAdmin}
              marketingAddonsDraft={addonPricing.marketingAddonsDraft}
              setMarketingAddonsDraft={addonPricing.setMarketingAddonsDraft}
              setMarketingAddonsDirty={addonPricing.setMarketingAddonsDirty}
              marketingAddonsReason={addonPricing.marketingAddonsReason}
              setMarketingAddonsReason={addonPricing.setMarketingAddonsReason}
              saveMarketingAddonsMutation={addonPricing.saveMarketingAddonsMutation}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // view === "addons": the board's compact base-plan strip + the add-ons ×
  // markets matrix + whichever addon editor is currently open.
  return (
    <>
      <section className="backoffice-panel flex items-center gap-5 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
          <Pencil className="h-[18px] w-[18px] text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold">{basePlan.name} — base subscription</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {basePlan.trial_days}-day trial · unlimited catalog on every tier
          </div>
        </div>
        <div className="flex gap-2">
          {CURRENCIES.map((currency) => {
            const row = basePlanPricing?.get(currency);
            return (
              <span key={currency} className="inline-flex items-center rounded-full bg-muted px-2.5 py-[3px] text-xs font-medium">
                {currency}{" "}
                <span className="ml-1 tabular-nums">
                  {row ? `${getCurrencySymbol(currency)}${row.monthly_price.toLocaleString()}` : "—"}/mo
                </span>
              </span>
            );
          })}
        </div>
        {isSuperAdmin && (
          <Button variant="outline" size="sm" onClick={onEditBasePrice}>
            Edit
          </Button>
        )}
      </section>

      <div className="mt-5 space-y-3">
        <div>
          <p className="text-[13.5px] font-bold">Add-ons × markets</p>
          <p className="text-xs text-muted-foreground">
            Every add-on follows the same market list configured in Settings → Markets. Click a row to edit it.
          </p>
        </div>

        <AddonSummaryGrid
          isSuperAdmin={isSuperAdmin}
          editingAddon={editingAddon}
          setEditingAddon={setEditingAddon}
          chainTierDrafts={chainTier.chainTierDrafts}
          pricingMarkets={addonPricing.pricingMarkets}
          latestSeatPricingByCountry={addonPricing.latestSeatPricingByCountry}
          latestStaffOperationsPricingByCountry={addonPricing.latestStaffOperationsPricingByCountry}
          latestThemePricingByCountry={addonPricing.latestThemePricingByCountry}
          smsPricingDraft={addonPricing.smsPricingDraft}
          smsPricingDirty={addonPricing.smsPricingDirty}
        />

        <div className="space-y-4">
          {editingAddon === "locations" && (
                <LocationTierEditor
                  chainTierDrafts={chainTier.chainTierDrafts}
                  addChainTierRow={chainTier.addChainTierRow}
                  updateChainTierRow={chainTier.updateChainTierRow}
                  removeChainTierRow={chainTier.removeChainTierRow}
                  locationPricingReason={chainTier.locationPricingReason}
                  setLocationPricingReason={chainTier.setLocationPricingReason}
                  setChainTierDirty={chainTier.setChainTierDirty}
                  canSubmit={canSubmitChainTiers}
                  saveChainTiersMutation={chainTier.saveChainTiersMutation}
                />
              )}

              {editingAddon === "seats" && (
                <MarketPricingEditor
                  title="Edit additional seat pricing"
                  unitLabel="Per extra seat / month"
                  pricingMarkets={addonPricing.pricingMarkets}
                  drafts={addonPricing.seatPricingDrafts}
                  onUpdate={addonPricing.updateSeatPricingDraft}
                  reason={addonPricing.seatPricingReason}
                  setReason={addonPricing.setSeatPricingReason}
                  setDirty={addonPricing.setSeatPricingDirty}
                  reasonLabel="Seat pricing reason"
                  reasonPlaceholder="Why are you updating additional seat pricing?"
                  canSubmit={canSubmitSeatPricing}
                  saveMutation={addonPricing.saveSeatPricingMutation}
                  saveLabel="Save seat pricing"
                />
              )}

              {editingAddon === "staff" && (
                <MarketPricingEditor
                  title="Edit Staff Operations pricing"
                  unitLabel="Per active location / month"
                  pricingMarkets={addonPricing.pricingMarkets}
                  drafts={addonPricing.staffOperationsPricingDrafts}
                  onUpdate={addonPricing.updateStaffOperationsPricingDraft}
                  reason={addonPricing.staffOperationsPricingReason}
                  setReason={addonPricing.setStaffOperationsPricingReason}
                  setDirty={addonPricing.setStaffOperationsPricingDirty}
                  reasonLabel="Reason"
                  reasonPlaceholder="Why are you updating Staff Operations pricing?"
                  canSubmit={canSubmitStaffOperationsPricing}
                  saveMutation={addonPricing.saveStaffOperationsPricingMutation}
                  saveLabel="Save Staff Operations pricing"
                />
              )}

              {editingAddon === "themes" && (
                <ThemePricingEditor
                  pricingMarkets={addonPricing.pricingMarkets}
                  themeCatalogDraft={addonPricing.themeCatalogDraft}
                  setThemeCatalogDraft={addonPricing.setThemeCatalogDraft}
                  themePricingDrafts={addonPricing.themePricingDrafts}
                  updateThemePricingDraft={addonPricing.updateThemePricingDraft}
                  themePricingReason={addonPricing.themePricingReason}
                  setThemePricingReason={addonPricing.setThemePricingReason}
                  setThemePricingDirty={addonPricing.setThemePricingDirty}
                  isSuperAdmin={isSuperAdmin}
                  saveThemeCatalogMutation={addonPricing.saveThemeCatalogMutation}
                  saveThemePricingMutation={addonPricing.saveThemePricingMutation}
                  canSubmitThemePricing={canSubmitThemePricing}
                />
              )}

              {editingAddon === "messaging" && (
                <MessagingPricingEditor
                  smsPricingDraft={addonPricing.smsPricingDraft}
                  setSmsPricingDraft={addonPricing.setSmsPricingDraft}
                  smsComplimentaryDraft={addonPricing.smsComplimentaryDraft}
                  setSmsComplimentaryDraft={addonPricing.setSmsComplimentaryDraft}
                  setSmsPricingDirty={addonPricing.setSmsPricingDirty}
                  updateSmsPricingTier={addonPricing.updateSmsPricingTier}
                  addSmsPricingTier={addonPricing.addSmsPricingTier}
                  removeSmsPricingTier={addonPricing.removeSmsPricingTier}
                  smsPricingReason={addonPricing.smsPricingReason}
                  setSmsPricingReason={addonPricing.setSmsPricingReason}
                  canSubmitSmsPricing={canSubmitSmsPricing}
                  saveSmsPricingMutation={addonPricing.saveSmsPricingMutation}
                />
              )}
        </div>
      </div>
    </>
  );
}
