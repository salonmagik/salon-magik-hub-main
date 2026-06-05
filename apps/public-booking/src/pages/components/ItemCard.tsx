import { useState } from "react";
import { ShoppingBag, Clock, Package as PackageIcon, MapPin } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { useBookingCart, type BranchOption } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { toast } from "@ui/ui/use-toast";
import { QuantityControl } from "./QuantityControl";
import { ImageSlider } from "@/components/ImageSlider";

interface ItemCardProps {
  themeKey?: string | null;
  type: "service" | "package" | "product";
  id: string;
  name: string;
  description?: string | null;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrls?: string[];
  durationMinutes?: number;
  serviceIds?: string[];
  stockQuantity?: number;
  branches?: BranchOption[];
  locationNames?: string[];
}

export function ItemCard({
  themeKey,
  type,
  id,
  name,
  description,
  price,
  originalPrice,
  currency,
  imageUrls = [],
  durationMinutes,
  serviceIds,
  stockQuantity,
  branches = [],
  locationNames = [],
}: ItemCardProps) {
  const isEcommerceTheme = themeKey === "ecommerce";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { addItem, getItemInCart, updateQuantity } = useBookingCart();

  const itemInCart = getItemInCart(id, type);
  const isInCart = !!itemInCart;
  const isOutOfStock = type === "product" && stockQuantity !== undefined && stockQuantity <= 0;
  const hasDiscount = !!(originalPrice && originalPrice > price);
  const discountPercent = hasDiscount && originalPrice
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  const handleAddToCart = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isOutOfStock) {
      toast({ title: "Out of stock", description: "This product is currently unavailable", variant: "destructive" });
      return;
    }
    addItem({
      type, itemId: id, name, price, quantity: 1,
      durationMinutes: type === "service" || type === "package" ? durationMinutes : undefined,
      serviceIds: type === "package" ? serviceIds : undefined,
      isGift: false,
      fulfillmentType: type === "product" ? "pickup" : undefined,
      imageUrl: imageUrls?.[0] || undefined,
      eligibleBranches: branches,
    });
    toast({ title: "Added to cart", description: `${name} has been added to your cart` });
  };

  const handleIncrement = () => {
    if (type === "product" && stockQuantity !== undefined) {
      if ((itemInCart?.quantity || 0) >= stockQuantity) {
        toast({ title: "Stock limit reached", description: `Only ${stockQuantity} available`, variant: "destructive" });
        return;
      }
    }
    updateQuantity(id, type, 1);
  };

  const handleDecrement = () => updateQuantity(id, type, -1);

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  /* ── Ecommerce: editorial card ──────────────────────────── */
  if (isEcommerceTheme) {
    return (
      <>
        <div
          className="group cursor-pointer"
          onClick={() => setDetailsOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailsOpen(true); } }}
        >
          {/* Image — portrait 3:4 */}
          <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
            <ImageSlider
              images={imageUrls}
              alt={name}
              className="absolute inset-0 h-full w-full transition-transform duration-500 ease-out group-hover:scale-105"
            />

            {/* Badges on image */}
            <div className="absolute left-0 top-0 flex flex-col gap-1.5 p-3">
              {!hasDiscount && !isOutOfStock && (
                <span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
                  {type === "package" ? "Bundle" : type === "product" ? "Retail" : "Service"}
                </span>
              )}
              {hasDiscount && (
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
                  style={{ backgroundColor: "var(--brand-color)" }}
                >
                  -{discountPercent}%
                </span>
              )}
            </div>

            {/* Out of stock */}
            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Out of Stock</span>
              </div>
            )}

            {/* Hover cart CTA */}
            {!isOutOfStock && !isInCart && (
              <button
                type="button"
                onClick={handleAddToCart}
                className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md opacity-0 transition-all duration-200 group-hover:opacity-100 hover:scale-110"
                style={{ color: "var(--brand-color)" }}
                aria-label={`Add ${name} to cart`}
              >
                <ShoppingBag className="h-4 w-4" />
              </button>
            )}

            {/* In-cart quantity control on image */}
            {isInCart && (
              <div
                className="absolute bottom-3 inset-x-3 flex items-center justify-between rounded-full px-3 py-2 shadow"
                style={{ backgroundColor: "var(--brand-color)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDecrement(); }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white text-sm font-bold hover:bg-white/30"
                >
                  −
                </button>
                <span className="text-sm font-semibold text-white">{itemInCart.quantity}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleIncrement(); }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white text-sm font-bold hover:bg-white/30"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* Below-image text */}
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400">
              {typeLabel}
              {durationMinutes && type !== "product" ? ` · ${durationMinutes} min` : ""}
            </p>
            <h3 className="text-sm font-medium text-gray-900 group-hover:underline group-hover:underline-offset-2">
              {name}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(price, currency)}
              </span>
              {hasDiscount && originalPrice && (
                <span className="text-xs text-gray-400 line-through">
                  {formatCurrency(originalPrice, currency)}
                </span>
              )}
            </div>
            {locationNames.length > 0 && (
              <p className="text-[10px] text-gray-400">
                {locationNames.slice(0, 2).join(" · ")}
                {locationNames.length > 2 ? ` +${locationNames.length - 2}` : ""}
              </p>
            )}
          </div>
        </div>

        <ItemDetailDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          name={name} typeLabel={typeLabel} description={description}
          price={price} originalPrice={originalPrice} currency={currency}
          imageUrls={imageUrls} durationMinutes={durationMinutes}
          locationNames={locationNames} isInCart={isInCart}
          itemInCart={itemInCart} isOutOfStock={isOutOfStock}
          hasDiscount={hasDiscount} discountPercent={discountPercent}
          type={type} onAddToCart={() => handleAddToCart()}
          onIncrement={handleIncrement} onDecrement={handleDecrement}
        />
      </>
    );
  }

  /* ── Default card ───────────────────────────────────────── */
  return (
    <>
      <div
        className="flex h-full min-h-[200px] cursor-pointer flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
        onClick={() => setDetailsOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailsOpen(true); } }}
      >
        <div className="mb-3 flex gap-3">
          <div className="h-20 w-20 shrink-0">
            <ImageSlider images={imageUrls} alt={name} className="h-20 w-20" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{typeLabel}</span>
              <div className="text-right">
                <span className="text-base font-bold">{formatCurrency(price, currency)}</span>
                {hasDiscount && originalPrice && (
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <span className="text-xs text-muted-foreground line-through">{formatCurrency(originalPrice, currency)}</span>
                    <Badge variant="destructive" className="px-1 py-0 text-xs">-{discountPercent}%</Badge>
                  </div>
                )}
              </div>
            </div>
            <h3 className="line-clamp-1 text-base font-semibold">{name}</h3>
            {description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>}
            {locationNames.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {locationNames.slice(0, 3).map((loc) => (
                  <Badge key={loc} variant="outline" className="gap-1 text-[10px]">
                    <MapPin className="h-2.5 w-2.5" />{loc}
                  </Badge>
                ))}
                {locationNames.length > 3 && <Badge variant="outline" className="text-[10px]">+{locationNames.length - 3}</Badge>}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {type === "service" && durationMinutes && (
              <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />{durationMinutes} min</Badge>
            )}
            {type === "package" && (
              <Badge variant="secondary" className="gap-1 text-xs"><PackageIcon className="h-3 w-3" />Bundle</Badge>
            )}
            {isOutOfStock && <Badge variant="outline" className="text-xs">Out of stock</Badge>}
          </div>
          {isInCart ? (
            <QuantityControl quantity={itemInCart.quantity} onIncrement={handleIncrement} onDecrement={handleDecrement} size="sm" />
          ) : (
            <Button
              variant="outline" size="sm" disabled={isOutOfStock}
              className="shrink-0 gap-1.5 border-0"
              style={{ backgroundColor: isOutOfStock ? undefined : "var(--brand-color)", color: isOutOfStock ? undefined : "var(--brand-foreground, white)" }}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleAddToCart(); }}
            >
              <ShoppingBag className="h-4 w-4" />Add
            </Button>
          )}
        </div>
      </div>

      <ItemDetailDialog
        open={detailsOpen} onOpenChange={setDetailsOpen}
        name={name} typeLabel={typeLabel} description={description}
        price={price} originalPrice={originalPrice} currency={currency}
        imageUrls={imageUrls} durationMinutes={durationMinutes}
        locationNames={locationNames} isInCart={isInCart}
        itemInCart={itemInCart} isOutOfStock={isOutOfStock}
        hasDiscount={hasDiscount} discountPercent={discountPercent}
        type={type} onAddToCart={() => handleAddToCart()}
        onIncrement={handleIncrement} onDecrement={handleDecrement}
      />
    </>
  );
}

/* ── Shared detail dialog ───────────────────────────────── */
function ItemDetailDialog({
  open, onOpenChange, name, typeLabel, description, price, originalPrice,
  currency, imageUrls, durationMinutes, locationNames, isInCart, itemInCart,
  isOutOfStock, hasDiscount, discountPercent, type, onAddToCart, onIncrement, onDecrement,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  typeLabel: string;
  description?: string | null;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrls: string[];
  durationMinutes?: number;
  locationNames: string[];
  isInCart: boolean;
  itemInCart: ReturnType<ReturnType<typeof useBookingCart>["getItemInCart"]>;
  isOutOfStock: boolean;
  hasDiscount: boolean;
  discountPercent: number;
  type: "service" | "package" | "product";
  onAddToCart: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{typeLabel} details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ImageSlider images={imageUrls} alt={name} className="h-56 w-full" enablePreview />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xl font-bold">{formatCurrency(price, currency)}</div>
              {hasDiscount && originalPrice && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground line-through">{formatCurrency(originalPrice, currency)}</span>
                  <Badge variant="destructive">-{discountPercent}%</Badge>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {type === "service" && durationMinutes && (
                <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{durationMinutes} min</Badge>
              )}
              {type === "package" && (
                <Badge variant="secondary" className="gap-1"><PackageIcon className="h-3 w-3" />Bundle</Badge>
              )}
              {isOutOfStock && <Badge variant="outline">Out of stock</Badge>}
            </div>
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {locationNames.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Available locations</div>
              <div className="flex flex-wrap gap-2">
                {locationNames.map((loc) => (
                  <Badge key={loc} variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{loc}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            {isInCart ? (
              <QuantityControl quantity={itemInCart!.quantity} onIncrement={onIncrement} onDecrement={onDecrement} size="sm" />
            ) : (
              <Button
                onClick={onAddToCart} disabled={isOutOfStock}
                className="gap-1.5 border-0"
                style={{ backgroundColor: isOutOfStock ? undefined : "var(--brand-color)", color: isOutOfStock ? undefined : "var(--brand-foreground, white)" }}
              >
                <ShoppingBag className="h-4 w-4" />Add to cart
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
