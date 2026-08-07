import { Trash2, Gift, ShoppingBag, Scissors, Package } from "lucide-react";
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

const TYPE_ICON = { service: Scissors, package: Package, product: ShoppingBag } as const;

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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-5">
          <ShoppingBag className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="font-serif text-xl font-semibold mb-2">Your cart is empty</h3>
        <p className="text-muted-foreground text-sm mb-7">
          Add services, packages, or products to get started
        </p>
        <Button onClick={onBrowse} variant="outline">
          Browse Services
        </Button>
      </div>
    );
  }

  return (
    <div>
      {items.map((item, index) => {
        const eligibleBranches = item.eligibleBranches || [];
        const requiresBranchChoice = eligibleBranches.length > 1;
        const singleBranch = eligibleBranches.length === 1 ? eligibleBranches[0] : null;
        const TypeIcon = TYPE_ICON[item.type as keyof typeof TYPE_ICON] || ShoppingBag;

        return (
          <div key={item.id} className={index > 0 ? "pt-6 mt-6 border-t border-border" : ""}>
            <div className="flex gap-3.5">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-16 w-16 rounded-2xl object-cover shrink-0"
                />
              ) : (
                <div
                  className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background: "linear-gradient(155deg, color-mix(in srgb, var(--brand-color, hsl(262 43% 21%)) 92%, black), color-mix(in srgb, var(--brand-color, hsl(262 43% 21%)) 65%, white))",
                  }}
                >
                  <TypeIcon className="h-6 w-6 text-accent" strokeWidth={1.6} />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-medium leading-snug line-clamp-1">{item.name}</h4>
                  <span className="font-serif font-semibold whitespace-nowrap">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.type}</span>
                  {item.isGift && (
                    <Badge className="text-[10.5px] gap-1 rounded-full bg-accent text-accent-foreground hover:bg-accent border-0 px-2 py-0">
                      <Gift className="h-3 w-3" />
                      Gift
                    </Badge>
                  )}
                  {item.branchName && (
                    <span className="text-[11px] text-muted-foreground">&middot; {item.branchName}</span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <QuantityControl
                    quantity={item.quantity}
                    onIncrement={() => handleQuantityChange(item, 1)}
                    onDecrement={() => handleQuantityChange(item, -1)}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {(requiresBranchChoice || singleBranch) && (
              <div className="pl-[76px] mt-3.5 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Branch</Label>
                {requiresBranchChoice ? (
                  <Select
                    value={item.branchId ?? ""}
                    onValueChange={(value) => updateItem(item.id, { branchId: value })}
                  >
                    <SelectTrigger className="h-9">
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
                  <p className="text-sm">
                    {singleBranch?.name} - {singleBranch?.city}
                  </p>
                )}
              </div>
            )}

            {(item.type === "service" || item.type === "package") && (
              <label htmlFor={`schedule-${item.id}`} className="pl-[76px] mt-3 flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  id={`schedule-${item.id}`}
                  checked={item.scheduleMode !== "leave_unscheduled"}
                  onCheckedChange={(checked) =>
                    updateItem(item.id, {
                      scheduleMode: checked ? "schedule_now" : "leave_unscheduled",
                    })
                  }
                />
                <span className="text-sm">Schedule now</span>
                <span className="text-xs text-muted-foreground">
                  {item.scheduleMode === "leave_unscheduled" ? "— will skip the scheduling step" : ""}
                </span>
              </label>
            )}

            <label htmlFor={`gift-${item.id}`} className="pl-[76px] mt-2.5 flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                id={`gift-${item.id}`}
                checked={item.isGift}
                onCheckedChange={() => toggleGift(item)}
              />
              <span className="text-sm">This is a gift</span>
            </label>

            {item.type === "product" && (
              <div className="pl-[76px] mt-3">
                <FulfillmentToggle
                  value={item.fulfillmentType}
                  onChange={(value) => handleFulfillmentChange(item, value)}
                />
              </div>
            )}
          </div>
        );
      })}

      {giftItems.length > 1 && (
        <label htmlFor="gift-grouping" className="mt-6 pt-6 border-t border-border flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            id="gift-grouping"
            checked={meta.giftsBelongToSamePerson}
            onCheckedChange={(checked) => updateMeta({ giftsBelongToSamePerson: Boolean(checked) })}
          />
          <div>
            <span className="text-sm block">Gifts belong to same person</span>
            <span className="text-xs text-muted-foreground">Use one recipient form for all gift items.</span>
          </div>
        </label>
      )}

      <Separator className="mt-6 mb-4" />
      <div className="flex items-center justify-between">
        <span className="font-medium">Total</span>
        <span className="font-serif text-xl font-semibold">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}
