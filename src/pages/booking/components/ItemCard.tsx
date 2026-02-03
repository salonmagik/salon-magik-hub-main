import { Plus, Clock, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow">
      {/* Image */}
      {imageUrl ? (
        <div className="aspect-[4/3] overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="aspect-[4/3] bg-muted flex items-center justify-center">
          <Package className="h-12 w-12 text-muted-foreground/50" />
        </div>
      )}

      <CardContent className="p-4 space-y-3">
        {/* Type Badge */}
        {type === "package" && (
          <Badge variant="secondary" className="text-xs">
            Package
          </Badge>
        )}

        {/* Name & Description */}
        <div>
          <h3 className="font-semibold line-clamp-1">{name}</h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {description}
            </p>
          )}
        </div>

        {/* Duration (for services) */}
        {type === "service" && durationMinutes && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{durationMinutes} min</span>
          </div>
        )}

        {/* Price & Add Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">
                {formatCurrency(price, currency)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCurrency(originalPrice, currency)}
                </span>
              )}
            </div>
            {hasDiscount && (
              <Badge variant="destructive" className="text-xs">
                Save {discountPercent}%
              </Badge>
            )}
          </div>

          <Button
            size="sm"
            onClick={handleAddToCart}
            disabled={isOutOfStock}
          >
            <Plus className="h-4 w-4 mr-1" />
            {isOutOfStock ? "Out of Stock" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
