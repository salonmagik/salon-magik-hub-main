import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@ui/accordion";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Plus } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { CURRENCIES, MAX_BATCH_ITEMS, deriveAnnualTotal, deriveEffectiveMonthly, parseNumericInput } from "../../utils";
import type { Plan, PricingSectionDraft } from "../../types";

interface CreatePricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PricingSectionDraft[];
  accordion: string[];
  setAccordion: (value: string[]) => void;
  addSection: () => void;
  removeSection: (localId: string) => void;
  updateSection: (localId: string, updater: (section: PricingSectionDraft) => PricingSectionDraft) => void;
  getAvailablePlansForSection: (localId: string) => Plan[];
  getPlanName: (planId: string) => string;
  reason: string;
  setReason: (value: string) => void;
  validation: { isValid: boolean; errors: string[] };
  isSuperAdmin: boolean;
  mutation: UseMutationResult<void, unknown, { sections: PricingSectionDraft[]; reason: string }>;
  onSaved: () => void;
}

/** Legacy multi-plan pricing-creation dialog. Preserved as-is; nothing in the current UI opens it
 *  since every plan in practice already has active pricing by the time it would apply. */
export function CreatePricingDialog({
  open,
  onOpenChange,
  sections,
  accordion,
  setAccordion,
  addSection,
  removeSection,
  updateSection,
  getAvailablePlansForSection,
  getPlanName,
  reason,
  setReason,
  validation,
  isSuperAdmin,
  mutation,
  onSaved,
}: CreatePricingDialogProps) {
  const canSubmit = isSuperAdmin && validation.isValid && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Add Pricing</DialogTitle>
          <DialogDescription>
            Configure pricing by plan and currency. Annual value is discount percent.
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Sections: {sections.length}/{MAX_BATCH_ITEMS}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addSection} disabled={sections.length >= MAX_BATCH_ITEMS}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add section
            </Button>
          </div>

          {validation.errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                {validation.errors.slice(0, 6).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <Accordion type="multiple" value={accordion} onValueChange={setAccordion} className="space-y-3">
            {sections.map((section, index) => {
              const availablePlans = getAvailablePlansForSection(section.localId);
              const selectedPlanLabel = section.plan_id ? getPlanName(section.plan_id) : `Section ${index + 1}`;

              return (
                <AccordionItem key={section.localId} value={section.localId} className="rounded-md border px-4">
                  <AccordionTrigger>
                    <div className="flex flex-wrap items-center gap-2 text-left">
                      <span className="font-medium">Pricing {index + 1}</span>
                      <Badge variant={section.plan_id ? "default" : "outline"}>
                        {selectedPlanLabel}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pb-2">
                      <div>
                        <Label>Plan</Label>
                        <Select
                          value={section.plan_id}
                          onValueChange={(value) => updateSection(section.localId, (current) => ({ ...current, plan_id: value }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {availablePlans.map((plan) => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.name} {!plan.is_active ? "(Inactive)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        {CURRENCIES.map((currency) => {
                          const row = section.currencies[currency];
                          const monthly = parseNumericInput(row.monthly_price || "0");
                          const discount = parseNumericInput(row.annual_discount_pct || "0");
                          const effectiveMonthly =
                            Number.isFinite(monthly) && Number.isFinite(discount)
                              ? deriveEffectiveMonthly(monthly, Math.max(0, Math.min(100, discount)))
                              : 0;
                          const annualTotal = deriveAnnualTotal(effectiveMonthly);
                          return (
                            <div key={currency} className="rounded-md border p-3">
                              <div className="mb-3 flex items-center justify-between">
                                <p className="font-medium">{currency}</p>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground">Enable</Label>
                                  <Switch
                                    checked={row.enabled}
                                    onCheckedChange={(checked) =>
                                      updateSection(section.localId, (current) => ({
                                        ...current,
                                        currencies: { ...current.currencies, [currency]: { ...current.currencies[currency], enabled: checked } },
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <div className="grid gap-3 md:grid-cols-4">
                                <div>
                                  <Label>Monthly</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.monthly_price}
                                    disabled={!row.enabled}
                                    onChange={(event) =>
                                      updateSection(section.localId, (current) => ({
                                        ...current,
                                        currencies: { ...current.currencies, [currency]: { ...current.currencies[currency], monthly_price: event.target.value } },
                                      }))
                                    }
                                  />
                                </div>
                                <div>
                                  <Label>Annual discount %</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={row.annual_discount_pct}
                                    disabled={!row.enabled}
                                    onChange={(event) =>
                                      updateSection(section.localId, (current) => ({
                                        ...current,
                                        currencies: { ...current.currencies, [currency]: { ...current.currencies[currency], annual_discount_pct: event.target.value } },
                                      }))
                                    }
                                  />
                                </div>
                                <div>
                                  <Label>Effective monthly</Label>
                                  <Input value={Number.isFinite(effectiveMonthly) ? effectiveMonthly : 0} readOnly disabled />
                                </div>
                                <div>
                                  <Label>Annual price after discount</Label>
                                  <Input value={Number.isFinite(annualTotal) ? annualTotal : 0} readOnly disabled />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeSection(section.localId)} disabled={sections.length <= 1}>
                          Remove section
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are you creating this pricing batch?" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate({ sections, reason }, { onSuccess: onSaved })}
            disabled={!canSubmit}
          >
            {mutation.isPending ? "Saving..." : "Save Pricing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
