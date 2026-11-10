import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@ui/accordion";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { MAX_BATCH_ITEMS } from "../../utils";
import type { FeatureDraft, PlanDraft } from "../../types";

interface CreatePlansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: PlanDraft[];
  accordion: string[];
  setAccordion: (value: string[]) => void;
  addDraft: () => void;
  removeDraft: (localId: string) => void;
  updateDraft: <K extends keyof PlanDraft>(localId: string, field: K, value: PlanDraft[K]) => void;
  addFeature: (localId: string) => void;
  updateFeature: (localId: string, featureLocalId: string, patch: Partial<FeatureDraft>) => void;
  removeFeature: (localId: string, featureLocalId: string) => void;
  remainingPlanSlots: number;
  recommendedPlanId: string | null;
  getPlanName: (planId: string) => string;
  validation: { isValid: boolean; errors: string[] };
  isSuperAdmin: boolean;
  mutation: UseMutationResult<void, unknown, PlanDraft[]>;
  /** Called after a successful save, so the dialog can close and reset itself. */
  onSaved: () => void;
}

/** Legacy multi-plan creation dialog. Preserved as-is; nothing in the current UI opens it
 *  since the product now configures a single base subscription (see usePlanDialogs.ts). */
export function CreatePlansDialog({
  open,
  onOpenChange,
  drafts,
  accordion,
  setAccordion,
  addDraft,
  removeDraft,
  updateDraft,
  addFeature,
  updateFeature,
  removeFeature,
  remainingPlanSlots,
  recommendedPlanId,
  getPlanName,
  validation,
  isSuperAdmin,
  mutation,
  onSaved,
}: CreatePlansDialogProps) {
  const canSubmit = isSuperAdmin && validation.isValid && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Add Plans</DialogTitle>
          <DialogDescription>
            Create up to {Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)} plans in one submission.
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Batch size: {drafts.length}/{Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDraft}
              disabled={drafts.length >= Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add section
            </Button>
          </div>

          {validation.errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">Fix these issues:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
                {validation.errors.slice(0, 6).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <Accordion type="multiple" value={accordion} onValueChange={setAccordion} className="space-y-3">
            {drafts.map((draft, index) => {
              const recommendedLocked = Boolean(recommendedPlanId);
              const recommendedDraftId = drafts.find((item) => item.is_recommended)?.localId || null;
              const canToggleRecommended =
                !recommendedLocked &&
                (!recommendedDraftId || recommendedDraftId === draft.localId || draft.is_recommended);
              return (
                <AccordionItem key={draft.localId} value={draft.localId} className="rounded-md border px-4">
                  <AccordionTrigger>
                    <div className="flex flex-wrap items-center gap-2 text-left">
                      <span className="font-medium">Plan {index + 1}</span>
                      <Badge variant={draft.name.trim() ? "default" : "outline"}>
                        {draft.name.trim() || "Untitled"}
                      </Badge>
                      <Badge variant="secondary">{draft.slug.trim() || "no-slug"}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pb-2">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Name</Label>
                          <Input value={draft.name} onChange={(event) => updateDraft(draft.localId, "name", event.target.value)} placeholder="Solo" />
                        </div>
                        <div>
                          <Label>Slug</Label>
                          <Input value={draft.slug} onChange={(event) => updateDraft(draft.localId, "slug", event.target.value)} placeholder="solo" />
                        </div>
                      </div>

                      <div>
                        <Label>Description</Label>
                        <Textarea value={draft.description} onChange={(event) => updateDraft(draft.localId, "description", event.target.value)} placeholder="Short plan description" />
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <Label>Display Order</Label>
                          <Input type="number" value={draft.display_order} onChange={(event) => updateDraft(draft.localId, "display_order", Number(event.target.value || 0))} />
                        </div>
                        <div>
                          <Label>Trial Days</Label>
                          <Input type="number" value={draft.trial_days} onChange={(event) => updateDraft(draft.localId, "trial_days", Number(event.target.value || 0))} />
                        </div>
                        <div className="flex items-end gap-4 pb-2">
                          <div className="flex items-center gap-2">
                            <Switch checked={draft.is_active} onCheckedChange={(checked) => updateDraft(draft.localId, "is_active", checked)} />
                            <Label>Active</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={draft.is_recommended}
                              onCheckedChange={(checked) => updateDraft(draft.localId, "is_recommended", checked)}
                              disabled={!canToggleRecommended}
                            />
                            <Label>Recommended</Label>
                          </div>
                        </div>
                      </div>

                      {recommendedPlanId && (
                        <p className="text-xs text-muted-foreground">
                          Recommended is locked to {getPlanName(recommendedPlanId)}. Unset it there first.
                        </p>
                      )}

                      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                        Growth progression thresholds are configured in the Growth progression section. Services, products, packages, vouchers, and SMS allowances are configured separately.
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Plan Features</Label>
                          <Button type="button" size="sm" variant="outline" onClick={() => addFeature(draft.localId)}>
                            <Plus className="mr-2 h-3.5 w-3.5" />
                            Add feature
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {draft.features.map((feature) => (
                            <div key={feature.localId} className="grid gap-2 md:grid-cols-[1fr_120px_80px]">
                              <Input
                                value={feature.feature_text}
                                onChange={(event) => updateFeature(draft.localId, feature.localId, { feature_text: event.target.value })}
                                placeholder="Feature text"
                              />
                              <Input
                                type="number"
                                value={feature.sort_order}
                                onChange={(event) => updateFeature(draft.localId, feature.localId, { sort_order: Number(event.target.value || 0) })}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => removeFeature(draft.localId, feature.localId)}
                                disabled={draft.features.length === 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label>Reason</Label>
                        <Textarea value={draft.reason} onChange={(event) => updateDraft(draft.localId, "reason", event.target.value)} placeholder="Why are you adding this plan?" />
                      </div>

                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeDraft(draft.localId)} disabled={drafts.length <= 1}>
                          Remove section
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate(drafts, { onSuccess: onSaved })} disabled={!canSubmit}>
            {mutation.isPending ? "Saving..." : "Save Plans"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
