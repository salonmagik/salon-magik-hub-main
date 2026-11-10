import { useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent } from "@ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { AlertTriangle } from "lucide-react";

import { usePlansData } from "./hooks/usePlansData";
import { useMarketPricing } from "./hooks/useMarketPricing";
import { useChainTierPricing } from "./hooks/useChainTierPricing";
import { useAddonPricing } from "./hooks/useAddonPricing";
import { useGrowthProgression } from "./hooks/useGrowthProgression";
import { usePlanDialogs } from "./hooks/usePlanDialogs";

import { BaseSubscriptionCard } from "./components/BaseSubscriptionCard";
import { GrowthProgressionCard } from "./components/GrowthProgressionCard";
import type { AddonKey } from "./components/AddonSummaryGrid";
import { CreatePlansDialog } from "./components/dialogs/CreatePlansDialog";
import { EditPlanDialog } from "./components/dialogs/EditPlanDialog";
import { CreatePricingDialog } from "./components/dialogs/CreatePricingDialog";
import { DeletePlanDialog } from "./components/dialogs/DeletePlanDialog";
import { EditPricingDialog } from "./components/dialogs/EditPricingDialog";

export default function PlansPage() {
  const { backofficeUser } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [editingAddon, setEditingAddon] = useState<AddonKey | null>(null);

  const plansData = usePlansData(backofficeUser);
  const marketPricing = useMarketPricing();
  const chainTier = useChainTierPricing(plansData.chainPlan);
  const addonPricing = useAddonPricing(marketPricing.pricingMarkets, backofficeUser);
  const growthProgression = useGrowthProgression(
    plansData.progressionPlans,
    plansData.limitsByPlan,
    chainTier.chainTierDrafts,
    backofficeUser,
  );
  const dialogs = usePlanDialogs(plansData);

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Pricing catalog</h1>
            <p className="text-sm text-muted-foreground">
              What's for sale, platform-wide. For what a specific salon is paying today, see{" "}
              <a href="/subscriptions" className="font-semibold text-primary">Tenant billing →</a>
            </p>
          </div>
        </div>

        {!isSuperAdmin && (
          <Card className="border-warning-bg bg-warning-bg/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  You have read-only access. Super Admin role is required for changes.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Matches PricingCatalog.dc.html's exact tab labels: Add-ons / Base plan / Growth progression */}
        <Tabs defaultValue="addons">
          <TabsList>
            <TabsTrigger value="addons">Add-ons</TabsTrigger>
            <TabsTrigger value="plan">Base plan</TabsTrigger>
            <TabsTrigger value="progression">Growth progression</TabsTrigger>
          </TabsList>

          <TabsContent value="addons" className="space-y-5 pt-5">
            <BaseSubscriptionCard
              view="addons"
              isSuperAdmin={isSuperAdmin}
              basePlan={plansData.basePlan}
              basePlanFeatures={plansData.basePlanFeatures}
              basePlanPricing={plansData.basePlanPricing}
              onEditSubscription={() => plansData.basePlan && dialogs.openEditPlanDialog(plansData.basePlan)}
              onEditBasePrice={() => plansData.basePlan && dialogs.openEditPricingDialog(plansData.basePlan)}
              onEditBenefits={() => plansData.basePlan && dialogs.openEditPlanDialog(plansData.basePlan)}
              editingAddon={editingAddon}
              setEditingAddon={setEditingAddon}
              addonPricing={addonPricing}
              chainTier={chainTier}
            />
          </TabsContent>

          <TabsContent value="plan" className="pt-5">
            <BaseSubscriptionCard
              view="plan"
              isSuperAdmin={isSuperAdmin}
              basePlan={plansData.basePlan}
              basePlanFeatures={plansData.basePlanFeatures}
              basePlanPricing={plansData.basePlanPricing}
              onEditSubscription={() => plansData.basePlan && dialogs.openEditPlanDialog(plansData.basePlan)}
              onEditBasePrice={() => plansData.basePlan && dialogs.openEditPricingDialog(plansData.basePlan)}
              onEditBenefits={() => plansData.basePlan && dialogs.openEditPlanDialog(plansData.basePlan)}
              editingAddon={editingAddon}
              setEditingAddon={setEditingAddon}
              addonPricing={addonPricing}
              chainTier={chainTier}
            />
          </TabsContent>

          <TabsContent value="progression" className="pt-5">
            <GrowthProgressionCard
              isSuperAdmin={isSuperAdmin}
              progressionDrafts={growthProgression.progressionDrafts}
              progressionReason={growthProgression.progressionReason}
              setProgressionReason={growthProgression.setProgressionReason}
              setProgressionDirty={growthProgression.setProgressionDirty}
              progressionValidation={growthProgression.progressionValidation}
              updateProgressionDraft={growthProgression.updateProgressionDraft}
              saveProgressionMutation={growthProgression.saveProgressionMutation}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CreatePlansDialog
        open={dialogs.createPlanOpen}
        onOpenChange={dialogs.setCreatePlanOpen}
        drafts={dialogs.createPlanDrafts}
        accordion={dialogs.createPlanAccordion}
        setAccordion={dialogs.setCreatePlanAccordion}
        addDraft={dialogs.addCreatePlanDraft}
        removeDraft={dialogs.removeCreatePlanDraft}
        updateDraft={dialogs.updateCreatePlanDraft}
        addFeature={dialogs.addDraftFeature}
        updateFeature={dialogs.updateDraftFeature}
        removeFeature={dialogs.removeDraftFeature}
        remainingPlanSlots={plansData.remainingPlanSlots}
        recommendedPlanId={plansData.recommendedPlanId}
        getPlanName={plansData.getPlanName}
        validation={dialogs.createPlansValidation}
        isSuperAdmin={isSuperAdmin}
        mutation={plansData.createPlansMutation}
        onSaved={() => {
          dialogs.setCreatePlanOpen(false);
          dialogs.setCreatePlanAccordion([]);
        }}
      />

      <EditPlanDialog
        open={dialogs.editPlanOpen}
        onOpenChange={dialogs.setEditPlanOpen}
        draft={dialogs.editPlanDraft}
        setDraft={dialogs.setEditPlanDraft}
        planId={dialogs.editPlanId}
        activePricingForPlan={dialogs.editPlanId ? plansData.activePricingByPlan.get(dialogs.editPlanId) : undefined}
        rolloutMode={dialogs.editPlanRolloutMode}
        setRolloutMode={dialogs.setEditPlanRolloutMode}
        rolloutAt={dialogs.editPlanRolloutAt}
        setRolloutAt={dialogs.setEditPlanRolloutAt}
        saveRef={dialogs.editPlanSaveRef}
        validation={dialogs.editPlanValidation}
        onEditBasePrice={() => plansData.basePlan && dialogs.openEditPricingDialog(plansData.basePlan)}
        isSuperAdmin={isSuperAdmin}
        mutation={plansData.updatePlanMutation}
        onSaved={() => {
          dialogs.setEditPlanOpen(false);
          dialogs.setEditPlanDraft(() => null);
          dialogs.setEditPlanRolloutMode("now");
          dialogs.setEditPlanRolloutAt("");
        }}
      />

      <CreatePricingDialog
        open={dialogs.createPricingOpen}
        onOpenChange={dialogs.setCreatePricingOpen}
        sections={dialogs.createPricingSections}
        accordion={dialogs.createPricingAccordion}
        setAccordion={dialogs.setCreatePricingAccordion}
        addSection={dialogs.addPricingSection}
        removeSection={dialogs.removePricingSection}
        updateSection={dialogs.updatePricingSection}
        getAvailablePlansForSection={dialogs.getAvailablePlansForSection}
        getPlanName={plansData.getPlanName}
        reason={dialogs.createPricingReason}
        setReason={dialogs.setCreatePricingReason}
        validation={dialogs.createPricingValidation}
        isSuperAdmin={isSuperAdmin}
        mutation={plansData.createPricingMutation}
        onSaved={() => {
          dialogs.setCreatePricingOpen(false);
          dialogs.setCreatePricingAccordion([]);
        }}
      />

      <DeletePlanDialog
        open={dialogs.deletePlanOpen}
        onOpenChange={dialogs.setDeletePlanOpen}
        target={dialogs.deletePlanTarget}
        reason={dialogs.deletePlanReason}
        setReason={dialogs.setDeletePlanReason}
        totp={dialogs.deletePlanTotp}
        setTotp={dialogs.setDeletePlanTotp}
        mutation={plansData.deletePlanMutation}
        onSaved={() => {
          dialogs.setDeletePlanOpen(false);
        }}
      />

      <EditPricingDialog
        open={dialogs.editPricingOpen}
        onOpenChange={dialogs.setEditPricingOpen}
        planId={dialogs.editPricingPlanId}
        rows={dialogs.editPricingRows}
        setRows={dialogs.setEditPricingRows}
        reason={dialogs.editPricingReason}
        setReason={dialogs.setEditPricingReason}
        rolloutMode={dialogs.editPricingRolloutMode}
        setRolloutMode={dialogs.setEditPricingRolloutMode}
        rolloutAt={dialogs.editPricingRolloutAt}
        setRolloutAt={dialogs.setEditPricingRolloutAt}
        validation={dialogs.editPricingValidation}
        isSuperAdmin={isSuperAdmin}
        mutation={plansData.updatePricingMutation}
        onSaved={() => {
          dialogs.setEditPricingOpen(false);
        }}
      />
    </BackofficeLayout>
  );
}
