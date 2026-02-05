import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, AlertTriangle, Clock, CreditCard, Wrench, Info, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBanners, BannerVariant } from "./BannerContext";

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
