import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@shared/utils";

interface BannerCarouselProps {
  bannerUrls: string[];
  salonName: string;
  autoPlayInterval?: number; // Default 30000ms (30 seconds)
  variant?: "default" | "ecommerce";
}

export function BannerCarousel({ 
  bannerUrls, 
  salonName, 
  autoPlayInterval = 30000,
  variant = "default",
}: BannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev === bannerUrls.length - 1 ? 0 : prev + 1));
  }, [bannerUrls.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev === 0 ? bannerUrls.length - 1 : prev - 1));
  }, [bannerUrls.length]);

  // Auto-advance timer
  useEffect(() => {
    if (bannerUrls.length <= 1 || isHovering) return;

    const timer = setInterval(goNext, autoPlayInterval);
    return () => clearInterval(timer);
  }, [bannerUrls.length, isHovering, autoPlayInterval, goNext]);

  if (!bannerUrls || bannerUrls.length === 0) return null;

  const isEcommerceTheme = variant === "ecommerce";

  return (
    <div
      className={isEcommerceTheme ? "relative h-64 md:h-[22rem] overflow-hidden" : "relative h-48 md:h-64 rounded-xl overflow-hidden"}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Images with crossfade */}
      {bannerUrls.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${salonName} banner ${i + 1}`}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
            i === activeIndex ? "opacity-100" : "opacity-0"
          )}
        />
      ))}

      {/* Gradient overlay */}
      <div className={isEcommerceTheme ? "absolute inset-0 bg-gradient-to-r from-[#1f1b17]/75 via-[#1f1b17]/30 to-transparent" : "absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"} />

      <div className={isEcommerceTheme ? "absolute bottom-0 left-0 right-0 p-6 text-white md:p-8" : "absolute bottom-4 left-4 right-16 text-white"}>
        {isEcommerceTheme && <p className="text-xs uppercase tracking-[0.22em] text-white/75">Curated booking storefront</p>}
        <h1 className={isEcommerceTheme ? "mt-2 text-3xl font-semibold md:text-4xl" : "text-2xl md:text-3xl font-bold"}>{salonName}</h1>
      </div>

      {/* Navigation arrows - only visible on hover when multiple banners */}
      {bannerUrls.length > 1 && isHovering && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            aria-label="Previous banner"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            aria-label="Next banner"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {bannerUrls.length > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          {bannerUrls.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                i === activeIndex ? "bg-white" : "bg-white/50 hover:bg-white/75"
              )}
              aria-label={`Go to banner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
