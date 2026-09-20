import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, AlertTriangle, Clock, CreditCard, Wrench, Info, CheckCircle } from "lucide-react";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { cn } from "@shared/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProductTour } from "@/components/onboarding/ProductTourProvider";
import { toast } from "@ui/ui/use-toast";
import { useBanners, BannerVariant } from "./BannerContext";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

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
    bg: "bg-[#FEF3C7]",
    text: "text-[#78350F]",
    icon: Wrench,
  },
};

interface GlobalBannerProps {
  className?: string;
}

export function GlobalBanner({ className }: GlobalBannerProps) {
  const navigate = useNavigate();
  const [smsDetailsOpen, setSmsDetailsOpen] = useState(false);
  const {
    activeBanner,
    currentIndex,
    totalBanners,
    dismissBanner,
    nextBanner,
    prevBanner,
    goToBanner,
  } = useBanners();

  useEffect(() => {
    if (!activeBanner?.id.startsWith("nigeria-sms-window-")) setSmsDetailsOpen(false);
  }, [activeBanner?.id]);

  if (!activeBanner) return null;

  const style = variantStyles[activeBanner.variant];
  const Icon = style.icon;
  const isNigeriaSmsBanner = activeBanner.id.startsWith("nigeria-sms-window-");
  const controlText = isNigeriaSmsBanner ? "text-white/80" : style.text;

  const handleCta = () => {
    if (isNigeriaSmsBanner) {
      setSmsDetailsOpen(true);
      return;
    }

    if (activeBanner.cta?.action) {
      activeBanner.cta.action();
    } else if (activeBanner.cta?.path) {
      navigate(activeBanner.cta.path);
    }
  };

  const handleBannerClick = () => {
    if (isNigeriaSmsBanner) setSmsDetailsOpen(true);
  };

  return (
    <div
      className={cn(
        "relative flex min-h-11 w-full items-center justify-center gap-3 border-b px-10 py-2.5 text-sm",
        isNigeriaSmsBanner
          ? "border-[#4b3a70] bg-[#211834] text-white"
          : cn(
              style.bg,
              activeBanner.variant === "maintenance"
                ? "border-[#F59E0B]/35"
                : "border-transparent",
            ),
        isNigeriaSmsBanner && "cursor-pointer",
        className
      )}
      onClick={handleBannerClick}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", isNigeriaSmsBanner ? "text-[#F4C84E]" : style.text)} />
      
      <div className="min-w-0 flex-1 text-center">
        <span className={cn("font-semibold", isNigeriaSmsBanner ? "text-white" : style.text)}>
          {activeBanner.title}
        </span>
        <span className={cn("ml-2 hidden sm:inline", isNigeriaSmsBanner ? "text-white/75" : cn(style.text, "opacity-90"))}>
          {activeBanner.message}
        </span>
        
        {activeBanner.cta && (
          <Button
            variant="link"
            size="sm"
            className={cn("ml-2 h-auto p-0 align-baseline font-semibold underline-offset-4 hover:underline", isNigeriaSmsBanner ? "text-[#F4C84E]" : style.text)}
            onClick={(event) => {
              event.stopPropagation();
              handleCta();
            }}
          >
            {isNigeriaSmsBanner ? "Learn more →" : `${activeBanner.cta.label} →`}
          </Button>
        )}
      </div>

      {/* Banner Navigation */}
      {totalBanners > 1 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(event) => {
              event.stopPropagation();
              prevBanner();
            }}
            className={cn("p-1 rounded hover:bg-black/10", controlText)}
            aria-label="Previous notice"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1 px-1">
            {Array.from({ length: totalBanners }).map((_, i) => (
              <button
                key={i}
                onClick={(event) => {
                  event.stopPropagation();
                  goToBanner(i);
                }}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === currentIndex ? controlText : "bg-black/20"
                )}
                style={i === currentIndex ? { backgroundColor: "currentColor" } : {}}
                aria-label={`Go to notice ${i + 1}`}
              />
            ))}
          </div>
          
          <button
            onClick={(event) => {
              event.stopPropagation();
              nextBanner();
            }}
            className={cn("p-1 rounded hover:bg-black/10", controlText)}
            aria-label="Next notice"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dismiss button */}
      {activeBanner.dismissible && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            dismissBanner(activeBanner.id);
          }}
          className={cn("p-1 hover:bg-black/10 rounded flex-shrink-0", controlText)}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <Dialog open={smsDetailsOpen} onOpenChange={setSmsDetailsOpen}>
        <DialogContent className="max-w-md" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#F4C84E]" />
              Nigeria SMS delivery window
            </DialogTitle>
            <DialogDescription>
              Nigerian telecom operators enforce a daily delivery window for SMS messages.
            </DialogDescription>
          </DialogHeader>

          <div className={cn(DIALOG_BODY_PADDING, "space-y-4 text-sm leading-6 text-muted-foreground")}>
            <p>
              SMS delivery to Nigerian numbers is available from <strong className="text-foreground">8:00 a.m. to 8:00 p.m. Nigeria time</strong>.
              This is a telecom and legal requirement, so Salon Magik cannot bypass it.
            </p>
            <p>
              Sending is disabled outside that window. Email and in-app notifications continue to work, and scheduled messaging will be added later.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsDetailsOpen(false)}>Close</Button>
            <Button onClick={() => { setSmsDetailsOpen(false); navigate("/salon/messaging"); }}>
              Open Messaging
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
