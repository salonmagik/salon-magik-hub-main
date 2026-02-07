import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker, dateToString, stringToDate } from "@/components/ui/date-picker";
import { Gift, Loader2, Save, RefreshCw } from "lucide-react";
import { useVouchers } from "@/hooks/useVouchers";

interface AddVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function generateVoucherCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function AddVoucherDialog({ open, onOpenChange, onSuccess }: AddVoucherDialogProps) {
  const { createVoucher } = useVouchers();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: generateVoucherCode(),
    amount: "",
    expiresAt: "",
  });

  const resetForm = () => {
    setFormData({
      code: generateVoucherCode(),
      amount: "",
      expiresAt: "",
    });
  };

  const regenerateCode = () => {
    setFormData((prev) => ({ ...prev, code: generateVoucherCode() }));
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formData.code.trim() !== "" &&
      formData.amount !== "" &&
      parseFloat(formData.amount) > 0
    );
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createVoucher({
        code: formData.code,
        amount: parseFloat(formData.amount),
        expiresAt: formData.expiresAt || undefined,
      });

      if (result) {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Create Gift Card</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Issue a new gift card or voucher
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Voucher Code */}
          <div className="space-y-2">
            <Label>
              Voucher Code <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                }
                placeholder="GIFT1234"
                required
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={regenerateCode}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Customers will use this code to redeem
            </p>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>
              Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
              required
              min="1"
              step="0.01"
            />
          </div>

          {/* Expiry Date */}
          <div className="space-y-2">
            <Label>Expiry Date (Optional)</Label>
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
            <Button type="submit" className="gap-2 w-full sm:w-auto" disabled={isSubmitting || !isFormValid}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Create Voucher
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
