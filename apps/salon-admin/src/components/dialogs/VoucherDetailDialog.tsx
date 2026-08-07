import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { Edit, Ban, Trash2, Calendar, Copy } from "lucide-react";
import { toast } from "@ui/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
    redeemed_by_customer_id?: string | null;
    claimed_by_customer_id?: string | null;
    claimed_at?: string | null;
    voucher_type?: string;
    access_type?: string;
    discount_type?: string;
    discount_value?: number;
    target_customer_id?: string | null;
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
  const [history, setHistory] = useState<Array<{
    id: string;
    event_type: string;
    amount: number;
    discount_amount: number;
    created_at: string;
    customer?: { full_name: string } | null;
    appointment?: { booking_reference: string | null } | null;
  }>>([]);

  useEffect(() => {
    if (!open || !voucher?.id) return;
    void (async () => {
      const { data } = await supabase
        .from("voucher_redemptions" as never)
        .select("id, event_type, amount, discount_amount, created_at, customer:customers(full_name), appointment:appointments(booking_reference)")
        .eq("voucher_id", voucher.id)
        .order("created_at", { ascending: false });
      setHistory((data || []) as typeof history);
    })();
  }, [open, voucher?.id]);

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
            <span className="flex items-center gap-1.5">
              <span className="font-mono">{voucher.code}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(voucher.code);
                  toast({ title: "Copied", description: `Voucher code ${voucher.code} copied to clipboard.` });
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </span>
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
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="font-semibold">
                {voucher.voucher_type === "promotion"
                  ? voucher.discount_type === "percentage" ? "Percentage promotion" : "Fixed promotion"
                  : "Gift voucher"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Audience</p>
              <p className="font-semibold">{voucher.access_type === "private" ? "Private customer" : "General public"}</p>
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

          <div>
            <p className="mb-3 text-sm font-medium">Activity</p>
            {history.length === 0 ? (
              <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                This voucher has not been claimed or redeemed yet.
              </p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {entry.event_type === "claim" ? "Claimed" : entry.event_type === "redeem" ? "Redeemed" : "Released"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.customer?.full_name || "Customer"}
                        {entry.appointment?.booking_reference ? ` · ${entry.appointment.booking_reference}` : ""}
                        {" · "}{format(new Date(entry.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(Number(entry.amount || entry.discount_amount))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

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
