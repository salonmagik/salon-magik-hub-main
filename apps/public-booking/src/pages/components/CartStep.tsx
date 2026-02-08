import { Trash2, Gift, ShoppingBag } from "lucide-react";
import { Button } from "@ui/button";
import { Separator } from "@ui/separator";
import { Badge } from "@ui/badge";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { useBookingCart, type CartItem } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { QuantityControl } from "./QuantityControl";
import { FulfillmentToggle } from "./FulfillmentToggle";

interface CartStepProps {
  currency: string;
  onBrowse: () => void;
}

export function CartStep({ currency, onBrowse }: CartStepProps) {
  const { items, removeItem, updateItem, getTotal } = useBookingCart();

  const total = getTotal();

  const handleQuantityChange = (item: CartItem, delta: number) => {
    const newQuantity = item.quantity + delta;
    if (newQuantity <= 0) {
      removeItem(item.id);
    } else {
      updateItem(item.id, { quantity: newQuantity });
    }
  };

  const toggleGift = (item: CartItem) => {
    updateItem(item.id, { isGift: !item.isGift });
  };

  const handleFulfillmentChange = (item: CartItem, value: "pickup" | "delivery") => {
    updateItem(item.id, { fulfillmentType: value });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Your cart is empty</h3>
        <p className="text-muted-foreground text-sm mb-6">
          Add services, packages, or products to get started
        </p>
        <Button onClick={onBrowse} variant="outline">
          Browse Services
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id}>
          <div className="space-y-3">
            <div className="flex gap-3">
              {/* Image */}
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-16 w-16 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs uppercase font-medium shrink-0">
                  {item.type}
                </div>
              )}

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium line-clamp-1">{item.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs uppercase">
                        {item.type}
                      </Badge>
                      {item.isGift && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Gift className="h-3 w-3" />
                          Gift
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="font-semibold whitespace-nowrap">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center justify-between mt-2">
                  <QuantityControl
                    quantity={item.quantity}
                    onIncrement={() => handleQuantityChange(item, 1)}
                    onDecrement={() => handleQuantityChange(item, -1)}
                    size="sm"
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Gift Toggle */}
            <div className="flex items-center gap-2 pl-[76px]">
              <Checkbox
                id={`gift-${item.id}`}
                checked={item.isGift}
                onCheckedChange={() => toggleGift(item)}
              />
              <Label
                htmlFor={`gift-${item.id}`}
                className="text-sm cursor-pointer"
              >
                This is a gift
              </Label>
            </div>

            {/* Fulfillment Toggle for Products */}
            {item.type === "product" && (
              <div className="pl-[76px]">
                <FulfillmentToggle
                  value={item.fulfillmentType}
                  onChange={(value) => handleFulfillmentChange(item, value)}
                />
              </div>
            )}
          </div>

          {index < items.length - 1 && <Separator className="my-4" />}
        </div>
      ))}

      {/* Total */}
      <Separator className="my-4" />
      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span>{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}
