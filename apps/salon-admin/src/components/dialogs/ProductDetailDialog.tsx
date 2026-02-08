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
import { Package, Edit, Archive, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    description?: string;
    price: number;
    stock_quantity: number;
    status: string;
    image_urls?: string[];
  } | null;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProductDetailDialog({
  open,
  onOpenChange,
  product,
  onEdit,
  onArchive,
  onDelete,
}: ProductDetailDialogProps) {
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

  if (!product) return null;

  const isArchived = product.status === "archived";
  const isLowStock = product.stock_quantity <= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{product.name}</span>
            <Badge variant={isArchived ? "secondary" : "default"}>
              {isArchived ? "Archived" : "Active"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image */}
          {product.image_urls && product.image_urls.length > 0 && (
            <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
              <img
                src={product.image_urls[0]}
                alt={product.name}
                className="object-cover w-full h-full"
              />
            </AspectRatio>
          )}

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="font-semibold text-lg">{formatCurrency(product.price)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock</p>
              <p className="font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" />
                {product.stock_quantity}
                {isLowStock && (
                  <Badge variant="destructive" className="text-xs">Low</Badge>
                )}
              </p>
            </div>
          </div>

          {product.description && (
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm mt-1">{product.description}</p>
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
