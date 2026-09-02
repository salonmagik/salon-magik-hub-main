import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, AlertTriangle, Clock, CreditCard, Wrench, Info, CheckCircle } from "lucide-react";
import { Button } from "@ui/button";
import { cn } from "@shared/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProductTour } from "@/components/onboarding/ProductTourProvider";
import { toast } from "@ui/ui/use-toast";
import { useBanners, BannerVariant } from "./BannerContext";

/**
 * Full-screen overlay rendered when the active banner has blocking: true.
 * Prevents all interaction with the app until the blocking condition clears.
 * Place this inside BannerProvider scope, alongside (not inside) page content.
 */
export function BlockingBannerOverlay() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isTourActive, cancelTour } = useProductTour();
  const { banners } = useBanners();
  const blockingBanner = banners.find((b) => b.blocking);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // A blocking overlay (trial expired, payment failed, kill switch, paused
  // branch) sits at z-[200], above the product tour's own tooltip — so an
  // in-progress tour keeps running invisibly underneath it, and reappears
  // stacked on top the moment the overlay clears. Cancel it outright instead;
  // it isn't marked "seen", so it resumes naturally next time this page
  // triggers it once the block is gone.
  useEffect(() => {
    if (blockingBanner && isTourActive) cancelTour();
  }, [blockingBanner, isTourActive, cancelTour]);

  if (!blockingBanner) return null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate("/login");
    } catch {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
      setIsSigningOut(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">{blockingBanner.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{blockingBanner.message}</p>
        {blockingBanner.cta && (
          <Button
            className="w-full"
            onClick={() => {
              if (blockingBanner.cta?.action) blockingBanner.cta.action();
              else if (blockingBanner.cta?.path) navigate(blockingBanner.cta.path);
            }}
          >
            {blockingBanner.cta.label}
          </Button>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full py-1 text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

const variantStyles: Record<BannerVariant, { bg: string; text: string; icon: React.ElementType }> = {
  error: {
    bg: "bg-[#FEE2E2]",
    text: "text-[#EF4444]",
    icon: AlertTriangle,
  },
  warning: {
    bg: "bg-[#FDE68A]",
    text: "text-[#0F172A]",
    icon: Clock,
  },
  info: {
    bg: "bg-[#F5F7FA]",
    text: "text-[#2563EB]",
    icon: Info,
  },
  success: {
    bg: "bg-white",
    text: "text-[#16A34A]",
    icon: CheckCircle,
  },
  maintenance: {
    bg: "bg-[#F5F7FA]",
    text: "text-[#2563EB]",
    icon: Wrench,
  },
};

interface GlobalBannerProps {
  className?: string;
}

export function GlobalBanner({ className }: GlobalBannerProps) {
  const navigate = useNavigate();
  const {
    activeBanner,
    currentIndex,
    totalBanners,
    dismissBanner,
    nextBanner,
    prevBanner,
    goToBanner,
  } = useBanners();

  if (!activeBanner) return null;

  const style = variantStyles[activeBanner.variant];
  const Icon = style.icon;

  const handleCta = () => {
    if (activeBanner.cta?.action) {
      activeBanner.cta.action();
    } else if (activeBanner.cta?.path) {
      navigate(activeBanner.cta.path);
    }
  };

  return (
    <div
      className={cn(
        "mx-4 mb-4 p-3 rounded-lg border flex items-start gap-3",
        style.bg,
        "border-transparent",
        className
      )}
    >
      <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", style.text)} />
      
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", style.text)}>
          {activeBanner.title}
        </p>
        <p className={cn("text-sm mt-0.5", style.text, "opacity-90")}>
          {activeBanner.message}
        </p>
        
        {activeBanner.cta && (
          <Button
            variant="link"
            size="sm"
            className={cn("h-auto p-0 mt-1", style.text)}
            onClick={handleCta}
          >
            {activeBanner.cta.label} →
          </Button>
        )}
      </div>

      {/* Banner Navigation */}
      {totalBanners > 1 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={prevBanner}
            className={cn("p-1 rounded hover:bg-black/10", style.text)}
            aria-label="Previous notice"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1 px-1">
            {Array.from({ length: totalBanners }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToBanner(i)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === currentIndex ? style.text : "bg-black/20"
                )}
                style={i === currentIndex ? { backgroundColor: "currentColor" } : {}}
                aria-label={`Go to notice ${i + 1}`}
              />
            ))}
          </div>
          
          <button
            onClick={nextBanner}
            className={cn("p-1 rounded hover:bg-black/10", style.text)}
            aria-label="Next notice"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dismiss button */}
      {activeBanner.dismissible && (
        <button
          onClick={() => dismissBanner(activeBanner.id)}
          className={cn("p-1 hover:bg-black/10 rounded flex-shrink-0", style.text)}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
