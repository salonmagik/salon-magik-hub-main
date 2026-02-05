import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Package, Calendar, Truck } from "lucide-react";

interface UsageInfo {
  packages?: string[];
  appointments?: number;
  deliveries?: number;
}

interface ItemInUseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  usage: UsageInfo;
  onArchive: () => void;
}

export function ItemInUseDialog({
  open,
  onOpenChange,
  itemName,
  usage,
  onArchive,
}: ItemInUseDialogProps) {
  const hasPackages = usage.packages && usage.packages.length > 0;
  const hasAppointments = usage.appointments && usage.appointments > 0;
  const hasDeliveries = usage.deliveries && usage.deliveries > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cannot Delete Item</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                <span className="font-medium text-foreground">"{itemName}"</span> cannot be deleted because it is currently in use:
              </p>

              <div className="space-y-2">
                {hasPackages && (
                  <div className="flex items-start gap-2 p-2 bg-muted rounded-lg">
                    <Package className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Used in packages:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {usage.packages!.map((pkg) => (
                          <Badge key={pkg} variant="secondary" className="text-xs">
                            {pkg}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {hasAppointments && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">{usage.appointments}</span> active appointment{usage.appointments !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}

                {hasDeliveries && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Truck className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">{usage.deliveries}</span> pending deliver{usage.deliveries !== 1 ? "ies" : "y"}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>Archive</strong> the item instead to remove it from the booking platform while preserving historical data.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onArchive}>
            Archive Instead
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
