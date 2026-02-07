import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageSliderProps {
  images: string[];
  alt: string;
  className?: string;
}

export function ImageSlider({ images, alt, className }: ImageSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  // No images - show placeholder
  if (!images || images.length === 0) {
    return (
      <div className={cn(
        "aspect-square bg-muted rounded-lg flex items-center justify-center",
        className
      )}>
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden group",
        className
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Images */}
      {images.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${alt} ${i + 1}`}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            i === activeIndex ? "opacity-100" : "opacity-0"
          )}
        />
      ))}

      {/* Navigation arrows - only visible on hover when multiple images */}
      {images.length > 1 && isHovering && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors z-10"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors z-10"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Dot indicators - always visible when multiple images */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(i);
              }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                i === activeIndex ? "bg-white" : "bg-white/50 hover:bg-white/75"
              )}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
