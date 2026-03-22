import { useEffect, useRef, useState } from "react";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Image as ImageIcon, Loader2, Star, X } from "lucide-react";
import { cn } from "@shared/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@ui/ui/use-toast";

interface ImageUploadZoneProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
  thumbnailIndex?: number;
  onThumbnailIndexChange?: (index: number) => void;
}

export function ImageUploadZone({
  images,
  onImagesChange,
  maxImages = 2,
  disabled = false,
  thumbnailIndex = 0,
  onThumbnailIndexChange,
}: ImageUploadZoneProps) {
  const { currentTenant } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveThumbnailIndex = images.length
    ? Math.min(Math.max(thumbnailIndex, 0), images.length - 1)
    : 0;

  useEffect(() => {
    if (!onThumbnailIndexChange) return;
    if (thumbnailIndex !== effectiveThumbnailIndex) {
      onThumbnailIndexChange(effectiveThumbnailIndex);
    }
  }, [effectiveThumbnailIndex, onThumbnailIndexChange, thumbnailIndex]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentTenant?.id) return;

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      toast({
        title: "Limit reached",
        description: `Maximum ${maxImages} images allowed`,
        variant: "destructive",
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Invalid file",
            description: "Only images are allowed",
            variant: "destructive",
          });
          continue;
        }

        if (file.size > 2 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: "Images must be under 2MB",
            variant: "destructive",
          });
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const fileName = `${currentTenant.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from("catalog-images").upload(fileName, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast({
            title: "Upload failed",
            description: uploadError.message,
            variant: "destructive",
          });
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("catalog-images").getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        const nextImages = [...images, ...uploadedUrls];
        onImagesChange(nextImages);
        if (onThumbnailIndexChange && images.length === 0) {
          onThumbnailIndexChange(0);
        }
        toast({
          title: "Success",
          description: `${uploadedUrls.length} image(s) uploaded`,
        });
      }
    } catch (err) {
      console.error("Error uploading images:", err);
      toast({
        title: "Error",
        description: "Failed to upload images",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);

    if (!onThumbnailIndexChange) return;
    if (newImages.length === 0) {
      onThumbnailIndexChange(0);
      return;
    }

    if (index === effectiveThumbnailIndex) {
      onThumbnailIndexChange(0);
      return;
    }

    if (index < effectiveThumbnailIndex) {
      onThumbnailIndexChange(effectiveThumbnailIndex - 1);
      return;
    }

    onThumbnailIndexChange(effectiveThumbnailIndex);
  };

  const canAddMore = images.length < maxImages;

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, index) => {
            const isThumbnail = index === effectiveThumbnailIndex;
            return (
              <div key={`${url}-${index}`} className="space-y-1.5">
                <div className="relative w-24 h-24 rounded-lg border overflow-hidden group bg-muted">
                  <img src={url} alt={`Image ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    disabled={disabled}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {isThumbnail ? (
                    <Badge className="absolute left-1 top-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                      <Star className="h-2.5 w-2.5 mr-1" />
                      Thumbnail
                    </Badge>
                  ) : null}
                </div>
                {!isThumbnail ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    className="h-7 w-24 px-1 text-[11px]"
                    onClick={() => onThumbnailIndexChange?.(index)}
                  >
                    Set as thumbnail
                  </Button>
                ) : (
                  <div className="h-7 w-24" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {canAddMore && (
        <div
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg transition-colors cursor-pointer",
            disabled || isUploading
              ? "border-muted bg-muted/50 cursor-not-allowed"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          ) : (
            <>
              <ImageIcon className="w-6 h-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground text-center">Click to upload images</p>
              <p className="text-xs text-muted-foreground mt-1">
                {images.length}/{maxImages} • Max 2MB each
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
        className="hidden"
      />
    </div>
  );
}
