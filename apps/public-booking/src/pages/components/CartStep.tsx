import { Trash2, Gift, ShoppingBag } from "lucide-react";
import { Button } from "@ui/button";
import { Separator } from "@ui/separator";
import { Badge } from "@ui/badge";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { useBookingCart, type CartItem } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { QuantityControl } from "./QuantityControl";
import { FulfillmentToggle } from "./FulfillmentToggle";

interface CartStepProps {
  currency: string;
  onBrowse: () => void;
}

export function CartStep({ currency, onBrowse }: CartStepProps) {
  const { items, meta, removeItem, updateItem, updateQuantity, updateMeta, getTotal } = useBookingCart();
  const total = getTotal();
  const giftItems = items.filter((item) => item.isGift);

  const handleQuantityChange = (item: CartItem, delta: number) => {
    updateQuantity(item.itemId, item.type, delta);
  };

  const toggleGift = (item: CartItem) => {
    updateItem(item.id, { isGift: !item.isGift, giftRecipient: undefined });
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
      {items.map((item, index) => {
        const eligibleBranches = item.eligibleBranches || [];
        const requiresBranchChoice = eligibleBranches.length > 1;
        const singleBranch = eligibleBranches.length === 1 ? eligibleBranches[0] : null;

        return (
          <div key={item.id}>
            <div className="space-y-3">
              <div className="flex gap-3">
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

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium line-clamp-1">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs uppercase">
                          {item.type}
                        </Badge>
                        {item.isGift && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Gift className="h-3 w-3" />
                            Gift
                          </Badge>
                        )}
                        {item.branchName && (
                          <Badge variant="outline" className="text-xs">
                            {item.branchName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="font-semibold whitespace-nowrap">
                      {formatCurrency(item.price * item.quantity, currency)}
                    </span>
                  </div>

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

              {(requiresBranchChoice || singleBranch) && (
                <div className="pl-[76px] space-y-2">
                  <Label className="text-sm">Service Branch</Label>
                  {requiresBranchChoice ? (
                    <Select
                      value={item.branchId ?? ""}
                      onValueChange={(value) => updateItem(item.id, { branchId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleBranches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name} - {branch.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {singleBranch?.name} - {singleBranch?.city}
                    </p>
                  )}
                </div>
              )}

              {(item.type === "service" || item.type === "package") && (
                <div className="pl-[76px] flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                  <Checkbox
                    id={`schedule-${item.id}`}
                    checked={item.scheduleMode !== "leave_unscheduled"}
                    onCheckedChange={(checked) =>
                      updateItem(item.id, {
                        scheduleMode: checked ? "schedule_now" : "leave_unscheduled",
                      })
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`schedule-${item.id}`} className="cursor-pointer font-medium text-sm">
                      Schedule now
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {item.scheduleMode === "leave_unscheduled"
                        ? "This item will skip the scheduling step."
                        : "This item will appear in the scheduling step."}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pl-[76px]">
                <Checkbox
                  id={`gift-${item.id}`}
                  checked={item.isGift}
                  onCheckedChange={() => toggleGift(item)}
                />
                <Label htmlFor={`gift-${item.id}`} className="text-sm cursor-pointer">
                  This is a gift
                </Label>
              </div>

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
        );
      })}

      {giftItems.length > 1 && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <Checkbox
            id="gift-grouping"
            checked={meta.giftsBelongToSamePerson}
            onCheckedChange={(checked) => updateMeta({ giftsBelongToSamePerson: Boolean(checked) })}
          />
          <div className="space-y-1">
            <Label htmlFor="gift-grouping" className="cursor-pointer font-medium text-sm">
              Gifts belong to same person
            </Label>
            <p className="text-xs text-muted-foreground">
              Keep this checked to use one recipient form for all gift items.
            </p>
          </div>
        </div>
      )}

      <Separator className="my-4" />
      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span>{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}
