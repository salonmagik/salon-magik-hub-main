import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTrialEnforcement } from "@/hooks/useTrialEnforcement";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { AlertTriangle, Clock, CreditCard, Loader2, X } from "lucide-react";
import { cn } from "@shared/utils";

export function TrialBanner() {
  const navigate = useNavigate();
  const { trialStatus, shouldShowWarning, shouldShowUrgent, collectCard } = useTrialEnforcement();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!trialStatus.isTrialing || dismissed) return null;
  if (!shouldShowWarning && !shouldShowUrgent) return null;

  const handleUpgrade = () => {
    navigate("/salon/settings?tab=subscription");
  };

  const handleAddCard = async () => {
    setIsLoading(true);
    const result = await collectCard();
    setIsLoading(false);

    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
  };

  const getMessage = (): string => {
    if (trialStatus.isGracePeriod) {
      return `Your trial has ended. You have ${trialStatus.graceDaysRemaining} day${
        trialStatus.graceDaysRemaining === 1 ? "" : "s"
      } to upgrade before access is restricted.`;
    }
    if (trialStatus.daysRemaining === 0) {
      return "Your trial ends today! Upgrade now to continue using Salon Magik.";
    }
    if (trialStatus.daysRemaining === 1) {
      return "Your trial ends tomorrow! Add a payment method to keep your access.";
    }
    return `Your trial ends in ${trialStatus.daysRemaining} days. Upgrade to continue using all features.`;
  };

  return (
    <>
      <div
        className={cn(
          "mx-4 mb-4 p-3 rounded-lg border flex items-start gap-3",
          shouldShowUrgent
            ? "bg-destructive/10 border-destructive text-destructive"
            : "bg-warning/10 border-warning text-warning-foreground"
        )}
      >
        {shouldShowUrgent ? (
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        ) : (
          <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{getMessage()}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              size="sm"
              variant={shouldShowUrgent ? "destructive" : "default"}
              onClick={handleUpgrade}
            >
              Upgrade Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowModal(true)}
            >
              <CreditCard className="w-4 h-4 mr-1" />
              Add Card
            </Button>
          </div>
        </div>
        {!trialStatus.isGracePeriod && (
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-black/10 rounded flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Card Collection Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
            <DialogDescription>
              Add a card now to ensure uninterrupted access when your trial ends.
              You won't be charged until you select a plan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <CreditCard className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Secure Payment</p>
                <p className="text-sm text-muted-foreground">
                  Your card details are encrypted and stored securely by Stripe.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCard} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                "Add Card"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
