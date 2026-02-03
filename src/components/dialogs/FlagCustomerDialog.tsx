import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface FlagCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  onConfirm: (reason: string) => Promise<void>;
}

export function FlagCustomerDialog({
  open,
  onOpenChange,
  customerName,
  onConfirm,
}: FlagCustomerDialogProps) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    
    setIsLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Flag Customer</DialogTitle>
              <DialogDescription>
                Flag {customerName} and block future bookings
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for flagging *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this customer is being flagged..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              This reason will be visible to managers and owners only.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Flagging...
              </>
            ) : (
              "Flag Customer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
