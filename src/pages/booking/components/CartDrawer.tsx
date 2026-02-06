import { Trash2, Gift } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useBookingCart, type CartItem, type PublicLocation } from "@/hooks/booking";
import { formatCurrency } from "@/lib/currency";
import { QuantityControl } from "./QuantityControl";
import { FulfillmentToggle } from "./FulfillmentToggle";

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onCheckout: () => void;
  tenantId?: string;
  locations?: PublicLocation[];
}

export function CartDrawer({ 
  open, 
  onOpenChange, 
  currency, 
  onCheckout,
}: CartDrawerProps) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your Cart</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Your cart is empty</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {items.map((item) => (
                  <div key={item.id} className="space-y-3">
                    <div className="flex gap-3">
                      {/* Image */}
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs uppercase font-medium">
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

                          <div className="flex items-center gap-1">
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

                    <Separator />
                  </div>
                ))}
              </div>
            </ScrollArea>

            <SheetFooter className="flex-col gap-4 sm:flex-col">
              <div className="flex items-center justify-between w-full text-lg font-semibold">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
              <Button 
                className="w-full text-white border-0" 
                size="lg" 
                onClick={onCheckout}
                style={{ backgroundColor: 'var(--brand-color, hsl(220, 91%, 54%))' }}
              >
                Proceed to Checkout
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
