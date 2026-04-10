import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent } from "@ui/dialog";
import { Button } from "@ui/button";
import { cn } from "@shared/utils";

interface ImageCarouselProps {
  images?: string[];
  alt: string;
  className?: string;
}

export function ImageCarousel({ images = [], alt, className }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const safeImages = useMemo(() => images.filter(Boolean), [images]);
  const hasImages = safeImages.length > 0;
  const hasMultiple = safeImages.length > 1;

  const currentImage = hasImages ? safeImages[Math.min(activeIndex, safeImages.length - 1)] : null;

  const goNext = () => {
    if (!hasMultiple) return;
    setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  };

  const goPrev = () => {
    if (!hasMultiple) return;
    setActiveIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  };

  if (!hasImages) {
    return (
      <div
        className={cn(
          "w-full h-56 rounded-lg bg-muted flex items-center justify-center text-muted-foreground",
          className,
        )}
      >
        <ImageIcon className="w-8 h-8" />
      </div>
    );
  }

  return (
    <>
      <div className={cn("relative w-full h-56 rounded-lg border overflow-hidden bg-muted", className)}>
        <img
          src={currentImage || ""}
          alt={`${alt} ${activeIndex + 1}`}
          className="w-full h-full object-cover cursor-zoom-in"
          onClick={() => setPreviewOpen(true)}
        />

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-2 top-2 h-8 w-8"
          onClick={() => setPreviewOpen(true)}
        >
          <Expand className="w-4 h-4" />
        </Button>

        {hasMultiple ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={goPrev}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={goNext}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {safeImages.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-colors",
                    index === activeIndex ? "bg-white" : "bg-white/60",
                  )}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show image ${index + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl p-[10px]">
          <div className="relative w-full h-[70vh] bg-black rounded-md overflow-hidden">
            <img
              src={currentImage || ""}
              alt={`${alt} full ${activeIndex + 1}`}
              className="w-full h-full object-contain"
            />

            {hasMultiple ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9"
                  onClick={goPrev}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9"
                  onClick={goNext}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
