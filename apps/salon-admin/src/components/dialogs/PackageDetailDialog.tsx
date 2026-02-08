import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { AspectRatio } from "@ui/aspect-ratio";
import { Edit, Archive, Trash2, Percent } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

interface PackageDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: {
    id: string;
    name: string;
    description?: string;
    price: number;
    original_price?: number;
    status: string;
    image_urls?: string[];
  } | null;
  items?: Array<{ service_name: string; quantity: number }>;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function PackageDetailDialog({
  open,
  onOpenChange,
  pkg,
  items = [],
  onEdit,
  onArchive,
  onDelete,
}: PackageDetailDialogProps) {
  const { currentTenant } = useAuth();
  const { isOwner, currentRole } = usePermissions();
  
  const canManage = isOwner || currentRole === "manager";
  const currency = currentTenant?.currency || "USD";

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      NGN: "₦",
      GHS: "₵",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  if (!pkg) return null;

  const isArchived = pkg.status === "archived";
  const savings = pkg.original_price ? pkg.original_price - pkg.price : 0;
  const savingsPercent = pkg.original_price
    ? Math.round((savings / pkg.original_price) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{pkg.name}</span>
            <Badge variant={isArchived ? "secondary" : "default"}>
              {isArchived ? "Archived" : "Active"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image */}
          {pkg.image_urls && pkg.image_urls.length > 0 && (
            <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
              <img
                src={pkg.image_urls[0]}
                alt={pkg.name}
                className="object-cover w-full h-full"
              />
            </AspectRatio>
          )}

          {/* Pricing */}
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-2xl">{formatCurrency(pkg.price)}</span>
            {pkg.original_price && (
              <>
                <span className="text-muted-foreground line-through">
                  {formatCurrency(pkg.original_price)}
                </span>
                <Badge className="bg-success/10 text-success">
                  <Percent className="w-3 h-3 mr-1" />
                  Save {savingsPercent}%
                </Badge>
              </>
            )}
          </div>

          {/* Included Items */}
          {items.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Included Services</p>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="text-sm flex items-center justify-between p-2 bg-muted rounded-md">
                    <span>{item.service_name}</span>
                    {item.quantity > 1 && (
                      <Badge variant="secondary">×{item.quantity}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pkg.description && (
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm mt-1">{pkg.description}</p>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            
            {canManage && (
              <>
                <Button
                  variant="outline"
                  onClick={onArchive}
                >
                  <Archive className="w-4 h-4 mr-2" />
                  {isArchived ? "Unarchive" : "Archive"}
                </Button>
                
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
