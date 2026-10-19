import { Switch } from "@ui/switch";
import { Label } from "@ui/label";
import type { AvailablePackageCredit } from "@/hooks";

interface PackageCreditToggleProps {
  credit: AvailablePackageCredit;
  itemId: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}

// Public-booking's own version of salon-admin's PackageRedemptionToggle --
// same pattern (a switch next to the matching cart line offering to redeem
// a package session instead of paying for it), rendered only when the
// current booker has been identified (resolved to a real customer_id for
// this tenant) AND genuinely has remaining credit for this exact service --
// never shown for a guest or an identified customer with no entitlements,
// so an ordinary checkout looks completely unchanged.
export function PackageCreditToggle({ credit, itemId, checked, onCheckedChange }: PackageCreditToggleProps) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <Switch checked={checked} onCheckedChange={onCheckedChange} id={`package-credit-${itemId}`} />
      <Label htmlFor={`package-credit-${itemId}`} className="text-xs text-muted-foreground cursor-pointer">
        Use package credit — {credit.packageName} ({credit.remaining} left)
      </Label>
    </div>
  );
}
