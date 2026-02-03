import { Plus, Clock, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBookingCart } from "@/hooks/booking";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";

interface ItemCardProps {
  type: "service" | "package" | "product";
  id: string;
  name: string;
  description?: string | null;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrl?: string | null;
  durationMinutes?: number;
  stockQuantity?: number;
}

export function ItemCard({
  type,
  id,
  name,
  description,
  price,
  originalPrice,
  currency,
  imageUrl,
  durationMinutes,
  stockQuantity,
}: ItemCardProps) {
  const { addItem } = useBookingCart();

  const handleAddToCart = () => {
    if (type === "product" && stockQuantity !== undefined && stockQuantity <= 0) {
      toast({
        title: "Out of stock",
        description: "This product is currently unavailable",
        variant: "destructive",
      });
      return;
    }

    addItem({
      type,
      itemId: id,
      name,
      price,
      quantity: 1,
      durationMinutes: type === "service" ? durationMinutes : undefined,
      schedulingOption: type === "product" ? "leave_unscheduled" : "schedule_now",
      isGift: false,
      imageUrl: imageUrl || undefined,
    });

    toast({
      title: "Added to cart",
      description: `${name} has been added to your cart`,
    });
  };

  const isOutOfStock = type === "product" && stockQuantity !== undefined && stockQuantity <= 0;
  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  return (
    <>
      {/* Desktop: Horizontal compact layout */}
      <div className="hidden sm:flex items-start gap-3 p-3 rounded-lg border bg-card hover:shadow-md transition-shadow">
        {/* Thumbnail */}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-20 h-20 rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Package className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {type === "package" && (
                <Badge variant="secondary" className="text-xs mb-1">
                  Package
                </Badge>
              )}
              <h3 className="font-semibold text-sm leading-tight line-clamp-1">{name}</h3>
              {description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2">
            {type === "service" && durationMinutes && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{durationMinutes} min</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">
                {formatCurrency(price, currency)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-xs text-muted-foreground line-through">
                    {formatCurrency(originalPrice, currency)}
                  </span>
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    -{discountPercent}%
                  </Badge>
                </>
              )}
            </div>
            {isOutOfStock && (
              <Badge variant="outline" className="text-xs">Out of Stock</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Compact vertical card */}
      <div className="sm:hidden rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow">
        {/* Image */}
        {imageUrl ? (
          <div className="aspect-video overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted flex items-center justify-center">
            <Package className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}

        <div className="p-3 space-y-2">
          {type === "package" && (
            <Badge variant="secondary" className="text-xs">
              Package
            </Badge>
          )}
          
          <h3 className="font-semibold text-sm line-clamp-1">{name}</h3>
          
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {description}
            </p>
          )}

          {/* Duration for services */}
          {type === "service" && durationMinutes && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{durationMinutes} min</span>
            </div>
          )}

          {/* Price & Add Button */}
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {formatCurrency(price, currency)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatCurrency(originalPrice, currency)}
                  </span>
                )}
              </div>
              {hasDiscount && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  Save {discountPercent}%
                </Badge>
              )}
            </div>

            <Button
              size="sm"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="h-8"
            >
              <Plus className="h-4 w-4 mr-1" />
              {isOutOfStock ? "Out" : "Add"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}