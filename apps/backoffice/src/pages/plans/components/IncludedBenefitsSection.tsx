import { Button } from "@ui/button";
import { CheckCircle2, Pencil } from "lucide-react";
import type { PlanFeature } from "../types";

interface IncludedBenefitsSectionProps {
  basePlanFeatures: PlanFeature[];
  isSuperAdmin: boolean;
  onEdit: () => void;
}

export function IncludedBenefitsSection({ basePlanFeatures, isSuperAdmin, onEdit }: IncludedBenefitsSectionProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Included benefits</p>
          <p className="text-sm text-muted-foreground">This list feeds the marketing pricing page and customer subscription views.</p>
        </div>
        {isSuperAdmin && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit benefits
          </Button>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {basePlanFeatures.map((feature) => (
          <div key={feature.id} className="flex items-start gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{feature.feature_text}</span>
          </div>
        ))}
        {basePlanFeatures.length === 0 && <p className="text-sm text-muted-foreground">No benefits configured yet.</p>}
      </div>
    </div>
  );
}
