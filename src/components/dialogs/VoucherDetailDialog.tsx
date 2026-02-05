import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit, Ban, Trash2, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";

interface VoucherDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: {
    id: string;
    code: string;
    amount: number;
    balance: number;
    status: string;
    expires_at?: string;
    created_at: string;
    redeemed_by_customer_id?: string;
  } | null;
  onEdit: () => void;
  onDiscontinue: () => void;
  onDelete: () => void;
}

export function VoucherDetailDialog({
  open,
  onOpenChange,
  voucher,
  onEdit,
  onDiscontinue,
  onDelete,
}: VoucherDetailDialogProps) {
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

  if (!voucher) return null;

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "bg-success/10 text-success";
      case "redeemed":
        return "bg-muted text-muted-foreground";
      case "expired":
      case "discontinued":
        return "bg-destructive/10 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const usedAmount = voucher.amount - voucher.balance;
  const usagePercent = Math.round((usedAmount / voucher.amount) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="font-mono">{voucher.code}</span>
            <Badge className={getStatusVariant(voucher.status)}>
              {voucher.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Balance Overview */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-muted-foreground">Balance</span>
              <span className="font-semibold text-2xl">{formatCurrency(voucher.balance)}</span>
            </div>
            <div className="w-full bg-background rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${100 - usagePercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{formatCurrency(usedAmount)} used</span>
              <span>{formatCurrency(voucher.amount)} original</span>
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Original Value</p>
              <p className="font-semibold">{formatCurrency(voucher.amount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-semibold">
                {format(new Date(voucher.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {voucher.expires_at && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                Expires {format(new Date(voucher.expires_at), "MMM d, yyyy")}
              </span>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            
            {canManage && voucher.status === "active" && (
              <Button
                variant="outline"
                onClick={onDiscontinue}
              >
                <Ban className="w-4 h-4 mr-2" />
                Discontinue
              </Button>
            )}
            
            {canManage && voucher.balance === voucher.amount && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
