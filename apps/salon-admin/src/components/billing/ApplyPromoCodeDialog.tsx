import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Button } from "@ui/button";
import { Loader2, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@ui/ui/use-toast";
import { usePromoTrialBonusConfig } from "@/hooks/usePromoTrialBonus";

interface ApplyPromoCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplyPromoCodeDialog({ open, onOpenChange }: ApplyPromoCodeDialogProps) {
  const { currentTenant, refreshTenants } = useAuth();
  const { toast } = useToast();
  const { config } = usePromoTrialBonusConfig();
  const [code, setCode] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !currentTenant?.id) return;

    setIsApplying(true);
    try {
      const { data: claimData, error: claimError } = await (supabase.rpc as any)("claim_sales_promo_code", {
        p_code: normalized,
        p_tenant_id: currentTenant.id,
      });

      if (claimError || !claimData?.success) {
        toast({
          title: "Couldn't apply this code",
          description: claimData?.message || claimError?.message || "This promo code isn't valid or has expired.",
          variant: "destructive",
        });
        return;
      }

      // Bonus trial days on top, only if still within the eligibility window
      // — apply_promo_trial_bonus itself decides based on live config.
      const { data: bonusData } = await (supabase.rpc as any)("apply_promo_trial_bonus", {
        p_tenant_id: currentTenant.id,
      });

      await refreshTenants();
      setCode("");
      onOpenChange(false);

      if (bonusData?.granted) {
        toast({
          title: "Promo applied!",
          description: `Nice — your trial just got ${bonusData.bonus_days} extra day${bonusData.bonus_days === 1 ? "" : "s"}.`,
        });
      } else {
        toast({ title: "Promo applied!" });
      }
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Apply a promo code</DialogTitle>
          <DialogDescription>
            {config?.enabled
              ? `Applying a code now gets you ${config.bonusDays} extra trial day${config.bonusDays === 1 ? "" : "s"} on top of your plan.`
              : "Enter your promo code below."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="promo-code">Promo code</Label>
          <Input
            id="promo-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. LAUNCH2026"
            disabled={isApplying}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
            autoFocus
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleApply} disabled={isApplying || !code.trim()} className="w-full">
            {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
