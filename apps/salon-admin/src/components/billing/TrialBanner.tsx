import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTrialEnforcement } from "@/hooks/useTrialEnforcement";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { AlertTriangle, Clock, Loader2, Lock, LogOut, X } from "lucide-react";
import { cn } from "@shared/utils";
import { supabase } from "@/lib/supabase";
import { useToast } from "@ui/ui/use-toast";

export function TrialBanner() {
  const navigate = useNavigate();
  const { trialStatus, shouldShowWarning, shouldShowUrgent, startUpgradeCheckout } = useTrialEnforcement();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [showContactAdmin, setShowContactAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const canAccessSettings = hasPermission("settings");

  const handleUpgradeClick = () => {
    if (canAccessSettings) {
      navigate("/salon/settings?tab=subscription");
    } else {
      setShowContactAdmin(true);
    }
  };

  const handleStartCheckout = async () => {
    setIsLoading(true);
    const result = await startUpgradeCheckout();
    setIsLoading(false);
    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    } else {
      toast({
        title: "Couldn't start checkout",
        description: result.error || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: "Failed to sign out", description: "Please try again.", variant: "destructive" });
      setIsSigningOut(false);
      return;
    }
    navigate("/login");
  };

  // Hard-expired (grace period also elapsed) → blocking modal, no way out
  const isHardExpired = trialStatus.isExpired && !trialStatus.isGracePeriod;

  if (isHardExpired) {
    return (
      <>
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent
            className="sm:max-w-sm"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Lock className="h-6 w-6 text-destructive" />
              </div>
              <DialogTitle>Your trial has ended</DialogTitle>
              <DialogDescription>
                Your Salon Magik trial has expired. All your data is safe — upgrade to restore full access in under 2 minutes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              {canAccessSettings ? (
                <Button onClick={handleStartCheckout} disabled={isLoading} className="w-full">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isLoading ? "Redirecting to payment..." : "Upgrade Now"}
                </Button>
              ) : (
                <Button onClick={() => setShowContactAdmin(true)} className="w-full">
                  Contact Admin to Upgrade
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full text-muted-foreground"
              >
                {isSigningOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Sign out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showContactAdmin} onOpenChange={setShowContactAdmin}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Ask your admin to upgrade</DialogTitle>
              <DialogDescription>
                You don't have access to billing settings. Ask your salon owner or admin to upgrade the plan to restore access.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setShowContactAdmin(false)}>Got it</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Grace period or normal countdown banner
  if (!trialStatus.isTrialing || dismissed) return null;
  if (!shouldShowWarning && !shouldShowUrgent) return null;

  const getMessage = (): string => {
    if (trialStatus.isGracePeriod) {
      return `Your trial has ended. You have ${trialStatus.graceDaysRemaining} day${
        trialStatus.graceDaysRemaining === 1 ? "" : "s"
      } of grace left before access is restricted.`;
    }
    // daysRemaining uses Math.ceil, so the last partial day = 1
    if (trialStatus.daysRemaining <= 1) {
      return "Your trial ends today. Upgrade now to keep uninterrupted access.";
    }
    if (trialStatus.daysRemaining === 2) {
      return "Your trial ends tomorrow. Upgrade to keep your access.";
    }
    return `Your trial ends in ${trialStatus.daysRemaining} days. Upgrade to continue using all features.`;
  };

  return (
    <>
      <div
        className={cn(
          "mx-4 mb-4 flex items-start gap-3 rounded-lg border p-3",
          shouldShowUrgent
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-warning bg-warning/10 text-warning-foreground",
        )}
      >
        {shouldShowUrgent ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        ) : (
          <Clock className="mt-0.5 h-5 w-5 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{getMessage()}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={shouldShowUrgent ? "destructive" : "default"}
              onClick={handleUpgradeClick}
            >
              Upgrade Now
            </Button>
          </div>
        </div>
        {!trialStatus.isGracePeriod && (
          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 rounded p-1 hover:bg-black/10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Dialog open={showContactAdmin} onOpenChange={setShowContactAdmin}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ask your admin to upgrade</DialogTitle>
            <DialogDescription>
              You don't have access to billing settings. Ask your salon owner or admin to upgrade the plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowContactAdmin(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
