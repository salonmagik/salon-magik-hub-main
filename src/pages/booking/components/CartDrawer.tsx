import { Trash2, Minus, Plus, Gift } from "lucide-react";
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
import { useBookingCart, type CartItem } from "@/hooks/booking";
import { formatCurrency } from "@/lib/currency";

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onCheckout: () => void;
}

export function CartDrawer({ open, onOpenChange, currency, onCheckout }: CartDrawerProps) {
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
                        <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          {item.type}
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-medium line-clamp-1">{item.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
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
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleQuantityChange(item, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleQuantityChange(item, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleGift(item)}
                            >
                              <Gift className={`h-4 w-4 ${item.isGift ? "text-primary" : ""}`} />
                            </Button>
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
                style={{ backgroundColor: 'var(--brand-color)' }}
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
