import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X, Clock, CreditCard, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type BannerType = "trial" | "expired" | "past_due" | "low_credits" | null;

interface BannerConfig {
  type: BannerType;
  icon: React.ElementType;
  message: string;
  cta: string;
  variant: "warning" | "error" | "info";
  path: string;
}

export function SubscriptionBanner() {
  const { currentTenant } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<BannerType[]>([]);

  if (!currentTenant) return null;

  const banners: BannerConfig[] = [];

  // Check trial status
  if (currentTenant.subscription_status === "trialing" && currentTenant.trial_ends_at) {
    const trialEnd = new Date(currentTenant.trial_ends_at);
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      banners.push({
        type: "expired",
        icon: AlertTriangle,
        message: "Your trial has expired. Upgrade now to restore full access.",
        cta: "Upgrade Now",
        variant: "error",
        path: "/salon/settings?tab=subscription",
      });
    } else if (daysLeft <= 7) {
      banners.push({
        type: "trial",
        icon: Clock,
        message: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Upgrade to continue using Salon Magik.`,
        cta: "Upgrade",
        variant: "warning",
        path: "/salon/settings?tab=subscription",
      });
    }
  }

  // Check past due status
  if (currentTenant.subscription_status === "past_due") {
    banners.push({
      type: "past_due",
      icon: CreditCard,
      message: "Payment failed. Update your billing to avoid service interruption.",
      cta: "Update Billing",
      variant: "error",
      path: "/salon/settings?tab=subscription",
    });
  }

  // Filter out dismissed banners
  const activeBanners = banners.filter((b) => !dismissed.includes(b.type));

  if (activeBanners.length === 0) return null;

  const banner = activeBanners[0]; // Show only the most important banner
  const Icon = banner.icon;

  const variantStyles = {
    warning: "bg-warning-bg border-warning text-warning-foreground",
    error: "bg-destructive/10 border-destructive text-destructive",
    info: "bg-primary/10 border-primary text-primary",
  };

  return (
    <div
      className={cn(
        "mx-4 mb-4 p-3 rounded-lg border flex items-start gap-3",
        variantStyles[banner.variant]
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{banner.message}</p>
        <Button
          variant="link"
          size="sm"
          className={cn(
            "h-auto p-0 mt-1",
            banner.variant === "error" && "text-destructive",
            banner.variant === "warning" && "text-warning-foreground"
          )}
          onClick={() => navigate(banner.path)}
        >
          {banner.cta} →
        </Button>
      </div>
      <button
        onClick={() => setDismissed((prev) => [...prev, banner.type])}
        className="p-1 hover:bg-black/10 rounded flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
