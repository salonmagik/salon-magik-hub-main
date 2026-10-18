import { Switch } from "@ui/switch";
import { Label } from "@ui/label";
import type { AvailablePackageCredit } from "@/hooks/useCustomerActivePackages";

interface PackageRedemptionToggleProps {
  credit: AvailablePackageCredit;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}

// Inline switch rendered next to a selected service row when the customer
// has matching package credit for it, letting staff redeem a session from
// the package instead of charging for it again.
export function PackageRedemptionToggle({ credit, checked, onCheckedChange }: PackageRedemptionToggleProps) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <Switch checked={checked} onCheckedChange={onCheckedChange} id={`package-credit-${credit.serviceId}`} />
      <Label htmlFor={`package-credit-${credit.serviceId}`} className="text-xs text-muted-foreground cursor-pointer">
        Use package credit — {credit.packageName} ({credit.remaining} left)
      </Label>
    </div>
  );
}
