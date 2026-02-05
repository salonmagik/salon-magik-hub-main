import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Clock, Edit, Archive, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

interface ServiceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: {
    id: string;
    name: string;
    description?: string;
    price: number;
    duration_minutes: number;
    category_id?: string;
    status: string;
    image_urls?: string[];
  } | null;
  categoryName?: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ServiceDetailDialog({
  open,
  onOpenChange,
  service,
  categoryName,
  onEdit,
  onArchive,
  onDelete,
}: ServiceDetailDialogProps) {
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

  if (!service) return null;

  const isArchived = service.status === "archived";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{service.name}</span>
            <Badge variant={isArchived ? "secondary" : "default"}>
              {isArchived ? "Archived" : "Active"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image */}
          {service.image_urls && service.image_urls.length > 0 && (
            <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
              <img
                src={service.image_urls[0]}
                alt={service.name}
                className="object-cover w-full h-full"
              />
            </AspectRatio>
          )}

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="font-semibold text-lg">{formatCurrency(service.price)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="font-semibold flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {service.duration_minutes} min
              </p>
            </div>
          </div>

          {categoryName && (
            <div>
              <p className="text-sm text-muted-foreground">Category</p>
              <Badge variant="outline" className="mt-1">{categoryName}</Badge>
            </div>
          )}

          {service.description && (
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm mt-1">{service.description}</p>
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
