import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker, dateToString, stringToDate } from "@/components/ui/date-picker";
import { Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface VoucherData {
  id: string;
  code: string;
  amount: number;
  balance: number;
  status: string;
  expires_at?: string | null;
}

interface EditVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: VoucherData | null;
  onSuccess?: () => void;
}

export function EditVoucherDialog({ open, onOpenChange, voucher, onSuccess }: EditVoucherDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    expiresAt: "",
  });

  // Initialize form when voucher changes
  useEffect(() => {
    if (voucher && open) {
      setFormData({
        code: voucher.code,
        expiresAt: voucher.expires_at ? voucher.expires_at.split("T")[0] : "",
      });
    }
  }, [voucher, open]);

  // Track if any changes have been made
  const hasChanges = useMemo(() => {
    if (!voucher) return false;
    const originalExpiry = voucher.expires_at ? voucher.expires_at.split("T")[0] : "";
    return formData.code !== voucher.code || formData.expiresAt !== originalExpiry;
  }, [formData, voucher]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucher) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("vouchers")
        .update({
          code: formData.code.toUpperCase(),
          expires_at: formData.expiresAt || null,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      toast({ title: "Success", description: "Voucher updated successfully" });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Error updating voucher:", err);
      toast({
        title: "Error",
        description: err.message?.includes("unique") ? "Voucher code already exists" : "Failed to update voucher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!voucher) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Edit Gift Card</DialogTitle>
            <p className="text-sm text-muted-foreground">Update voucher details</p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Voucher Code */}
          <div className="space-y-2">
            <Label>
              Voucher Code <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder="GIFT1234"
              required
              className="font-mono"
            />
          </div>

          {/* Amount (read-only) */}
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input value={`${voucher.amount}`} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Amount cannot be changed after creation</p>
          </div>

          {/* Expiry Date */}
          <div className="space-y-2">
            <Label>Expiry Date</Label>
            <DatePicker
              value={stringToDate(formData.expiresAt)}
              onChange={(date) =>
                setFormData((prev) => ({
                  ...prev,
                  expiresAt: dateToString(date),
                }))
              }
              minDate={new Date()}
              placeholder="No expiry"
            />
          </div>

          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting || !hasChanges}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Voucher
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
