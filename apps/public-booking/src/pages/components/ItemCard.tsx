import { ShoppingBag, Clock, Package as PackageIcon } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { useBookingCart } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { toast } from "@ui/ui/use-toast";
import { QuantityControl } from "./QuantityControl";
import { ImageSlider } from "@/components/ImageSlider";

interface ItemCardProps {
  type: "service" | "package" | "product";
  id: string;
  name: string;
  description?: string | null;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrls?: string[];
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
  imageUrls = [],
  durationMinutes,
  stockQuantity,
}: ItemCardProps) {
  const { addItem, getItemInCart, updateQuantity } = useBookingCart();

  const itemInCart = getItemInCart(id, type);
  const isInCart = !!itemInCart;

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
      isGift: false,
      fulfillmentType: type === "product" ? "pickup" : undefined,
      imageUrl: imageUrls?.[0] || undefined,
    });

    toast({
      title: "Added to cart",
      description: `${name} has been added to your cart`,
    });
  };

  const handleIncrement = () => {
    if (type === "product" && stockQuantity !== undefined) {
      const currentQty = itemInCart?.quantity || 0;
      if (currentQty >= stockQuantity) {
        toast({
          title: "Stock limit reached",
          description: `Only ${stockQuantity} available`,
          variant: "destructive",
        });
        return;
      }
    }
    updateQuantity(id, 1);
  };

  const handleDecrement = () => {
    updateQuantity(id, -1);
  };

  const isOutOfStock = type === "product" && stockQuantity !== undefined && stockQuantity <= 0;
  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <div className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow flex flex-col h-full min-h-[200px]">
      {/* Image + Content Row */}
      <div className="flex gap-3 mb-3">
        {/* Image Slider */}
        <div className="w-20 h-20 shrink-0">
          <ImageSlider images={imageUrls} alt={name} className="w-20 h-20" />
        </div>
        
        {/* Header + Name */}
        <div className="flex-1 min-w-0">
          {/* Type + Price */}
          <div className="flex items-start justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {typeLabel}
            </span>
            <div className="text-right">
              <span className="font-bold text-base">
                {formatCurrency(price, currency)}
              </span>
              {hasDiscount && (
                <div className="flex items-center gap-1.5 justify-end mt-0.5">
                  <span className="text-xs text-muted-foreground line-through">
                    {formatCurrency(originalPrice, currency)}
                  </span>
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    -{discountPercent}%
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <h3 className="font-semibold text-base line-clamp-1">{name}</h3>

          {/* Description */}
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</p>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Metadata Badges + Add Button / Quantity Counter */}
      <div className="flex items-end justify-between mt-3 gap-2">
        <div className="flex flex-wrap gap-1.5">
          {type === "service" && durationMinutes && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {durationMinutes} min
            </Badge>
          )}
          {type === "package" && (
            <Badge variant="secondary" className="text-xs gap-1">
              <PackageIcon className="h-3 w-3" />
              Bundle
            </Badge>
          )}
          {isOutOfStock && (
            <Badge variant="outline" className="text-xs">Out of Stock</Badge>
          )}
        </div>

        {isInCart ? (
          <QuantityControl
            quantity={itemInCart.quantity}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            size="sm"
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="gap-1.5 shrink-0 border-0"
            style={{ 
              backgroundColor: isOutOfStock ? undefined : 'var(--brand-color)',
              color: isOutOfStock ? undefined : 'var(--brand-foreground, white)',
            }}
          >
            <ShoppingBag className="h-4 w-4" />
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
