import { Loader2, CheckCircle2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";

interface PaymentStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: string | null;
  brandColor?: string;
}

export function PaymentStatusDialog({
  open,
  onOpenChange,
  reference,
  brandColor = "#2563EB",
}: PaymentStatusDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment Processing</DialogTitle>
          <DialogDescription className="sr-only">
            Your payment is being processed
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 space-y-6">
          {/* Loading Spinner */}
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${brandColor}15` }}
          >
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: brandColor }}
            />
          </div>

          {/* Main Message */}
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-lg">Payment Processing</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Your payment is being processed. Please check your email for a receipt and booking confirmation.
            </p>
          </div>

          {/* Reference Number */}
          {/* {reference && (
            <div className="w-full p-4 bg-muted rounded-lg space-y-1">
              <p className="text-xs text-muted-foreground">Payment Reference</p>
              <p className="text-sm font-mono font-semibold break-all">{reference}</p>
            </div>
          )} */}

          {/* Email Notice */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100 w-full">
            <Mail className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900">Check your email</p>
              <p className="text-xs text-blue-700">
                You will receive a confirmation email shortly with your booking details and receipt.
              </p>
            </div>
          </div>

          {/* Info Note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground text-center">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Your booking has been created and we're confirming your payment with our payment provider.
            </p>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-center pt-2">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full border-0 text-white"
            style={{ backgroundColor: brandColor }}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
