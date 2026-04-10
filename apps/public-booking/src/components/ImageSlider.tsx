import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageIcon } from "lucide-react";
import { Dialog, DialogContent } from "@ui/dialog";
import { Button } from "@ui/button";
import { cn } from "@shared/utils";

interface ImageSliderProps {
  images: string[];
  alt: string;
  className?: string;
  enablePreview?: boolean;
}

export function ImageSlider({ images, alt, className, enablePreview = false }: ImageSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  if (!images || images.length === 0) {
    return (
      <div className={cn("aspect-square bg-muted rounded-lg flex items-center justify-center", className)}>
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  const showNavigation = images.length > 1 && (isHovering || previewOpen);

  return (
    <>
      <div
        className={cn("relative aspect-square rounded-lg overflow-hidden group", className)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {images.map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt={`${alt} ${i + 1}`}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
              i === activeIndex ? "opacity-100" : "opacity-0",
              enablePreview ? "cursor-zoom-in" : ""
            )}
            onClick={(event) => {
              if (!enablePreview) return;
              event.stopPropagation();
              setPreviewOpen(true);
            }}
          />
        ))}

        {enablePreview ? (
          <button
            type="button"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/70"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewOpen(true);
            }}
            aria-label="Open image preview"
          >
            <Expand className="h-4 w-4" />
          </button>
        ) : null}

        {images.length > 1 && showNavigation ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100"
              aria-label="Previous image"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100"
              aria-label="Next image"
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}

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
                type="button"
              />
            ))}
          </div>
        )}
      </div>

      {enablePreview ? (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-5xl p-[10px]">
            <div className="relative h-[70vh] rounded-md bg-black overflow-hidden">
              <img
                src={images[activeIndex]}
                alt={`${alt} full ${activeIndex + 1}`}
                className="h-full w-full object-contain"
              />

              {images.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9"
                    onClick={goPrev}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9"
                    onClick={goNext}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
