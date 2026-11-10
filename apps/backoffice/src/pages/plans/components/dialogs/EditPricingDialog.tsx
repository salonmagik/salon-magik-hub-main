import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import type { UseMutationResult } from "@tanstack/react-query";
import { deriveAnnualTotal, deriveEffectiveMonthly, parseNumericInput } from "../../utils";
import type { EditPricingRow, RolloutMode } from "../../types";

interface EditPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string | null;
  rows: EditPricingRow[];
  setRows: (updater: (prev: EditPricingRow[]) => EditPricingRow[]) => void;
  reason: string;
  setReason: (value: string) => void;
  rolloutMode: RolloutMode;
  setRolloutMode: (mode: RolloutMode) => void;
  rolloutAt: string;
  setRolloutAt: (value: string) => void;
  validation: { isValid: boolean; errors: string[] };
  isSuperAdmin: boolean;
  mutation: UseMutationResult<{ rolloutMode: RolloutMode }, unknown, { planId: string; rows: EditPricingRow[]; reason: string; rolloutMode?: RolloutMode; rolloutAt?: string | null }>;
  onSaved: () => void;
}

export function EditPricingDialog({
  open,
  onOpenChange,
  planId,
  rows,
  setRows,
  reason,
  setReason,
  rolloutMode,
  setRolloutMode,
  rolloutAt,
  setRolloutAt,
  validation,
  isSuperAdmin,
  mutation,
  onSaved,
}: EditPricingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Edit base subscription price</DialogTitle>
          <DialogDescription>
            Set the monthly price and annual discount for each enabled market. This is the only customer-facing base subscription price editor.
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
          {validation.errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                {validation.errors.slice(0, 6).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {rows.map((row) => {
            const monthly = parseNumericInput(row.monthly_price || "0");
            const discount = parseNumericInput(row.annual_discount_pct || "0");
            const effectiveMonthly =
              Number.isFinite(monthly) && Number.isFinite(discount)
                ? deriveEffectiveMonthly(monthly, Math.max(0, Math.min(100, discount)))
                : 0;
            const annualTotal = deriveAnnualTotal(effectiveMonthly);

            return (
              <div key={row.id} className="rounded-md border p-3">
                <p className="mb-3 text-sm font-medium">{row.currency}</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <Label>Monthly</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.monthly_price}
                      onChange={(event) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, monthly_price: event.target.value } : item)))
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
                      onChange={(event) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, annual_discount_pct: event.target.value } : item)))
                      }
                    />
                  </div>
                  <div>
                    <Label>Effective monthly</Label>
                    <Input value={effectiveMonthly} readOnly disabled />
                  </div>
                  <div>
                    <Label>Annual price after discount</Label>
                    <Input value={annualTotal} readOnly disabled />
                  </div>
                </div>
              </div>
            );
          })}

          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are you changing pricing?" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Go live</Label>
              <Select value={rolloutMode} onValueChange={(value) => setRolloutMode(value as RolloutMode)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Take effect now</SelectItem>
                  <SelectItem value="schedule">Schedule for a future date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rolloutMode === "schedule" && (
              <div>
                <Label>Go-live date</Label>
                <Input className="mt-2" type="datetime-local" value={rolloutAt} onChange={(event) => setRolloutAt(event.target.value)} />
              </div>
            )}
          </div>
          {rolloutMode === "schedule" && (
            <p className="text-xs text-muted-foreground">
              Existing subscribers keep today&apos;s price until this date. They&apos;ll see a notice in their
              dashboard once the change is scheduled.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!planId) return;
              mutation.mutate(
                {
                  planId,
                  rows,
                  reason,
                  rolloutMode,
                  rolloutAt: rolloutMode === "schedule" && rolloutAt ? new Date(rolloutAt).toISOString() : null,
                },
                { onSuccess: onSaved },
              );
            }}
            disabled={!isSuperAdmin || !validation.isValid || mutation.isPending}
          >
            {mutation.isPending
              ? "Saving..."
              : rolloutMode === "schedule"
                ? "Schedule Pricing Change"
                : "Save Pricing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
