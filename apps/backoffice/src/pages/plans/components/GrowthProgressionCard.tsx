import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ProgressionDraft } from "../types";

interface GrowthProgressionCardProps {
  isSuperAdmin: boolean;
  progressionDrafts: Record<string, ProgressionDraft>;
  progressionReason: string;
  setProgressionReason: (value: string) => void;
  setProgressionDirty: (dirty: boolean) => void;
  hasAttemptedProgressionSubmit: boolean;
  progressionValidation: { isValid: boolean; errors: string[] };
  updateProgressionDraft: (planId: string, patch: Partial<ProgressionDraft>) => void;
  saveProgressionMutation: UseMutationResult<void, unknown, void>;
}

export function GrowthProgressionCard({
  isSuperAdmin,
  progressionDrafts,
  progressionReason,
  setProgressionReason,
  setProgressionDirty,
  hasAttemptedProgressionSubmit,
  progressionValidation,
  updateProgressionDraft,
  saveProgressionMutation,
}: GrowthProgressionCardProps) {
  const canSubmit = isSuperAdmin && !saveProgressionMutation.isPending;
  const showErrors = hasAttemptedProgressionSubmit && progressionValidation.errors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Growth progression</CardTitle>
        <CardDescription>
          Configure when a salon should be offered the next growth stage based on locations or team members. These thresholds do not limit the salon; they trigger the next plan or add-on conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showErrors && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
              {progressionValidation.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}
        <div className="space-y-3">
          {Object.values(progressionDrafts).map((draft) => (
            <div key={draft.planId} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1.2fr_1fr_1fr] md:items-end">
              <div>
                <p className="text-sm font-medium">{draft.planName} → {draft.nextPlanName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {draft.nextPlanName === "Chain expansion"
                    ? "Continue growth through additional location and seat pricing."
                    : "Offer the next stage when either threshold is reached."}
                </p>
              </div>
              <div>
                <Label>Locations to trigger</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.maxLocations}
                  onChange={(e) => updateProgressionDraft(draft.planId, { maxLocations: e.target.value })}
                />
              </div>
              <div>
                <Label>Staff to trigger</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.maxStaff}
                  onChange={(e) => updateProgressionDraft(draft.planId, { maxStaff: e.target.value })}
                />
              </div>
            </div>
          ))}
          {Object.keys(progressionDrafts).length === 0 && <p className="text-sm text-muted-foreground">Configure at least two plan stages to add progression thresholds.</p>}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <Label>Growth progression reason</Label>
            <Textarea
              value={progressionReason}
              onChange={(e) => {
                setProgressionDirty(true);
                setProgressionReason(e.target.value);
              }}
              placeholder="Why are you updating growth progression thresholds?"
            />
          </div>
          <Button onClick={() => saveProgressionMutation.mutate()} disabled={!canSubmit}>
            {saveProgressionMutation.isPending ? "Saving…" : "Save progression thresholds"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
