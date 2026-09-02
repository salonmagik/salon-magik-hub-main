import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, Mail, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { supabase } from "@/lib/supabase";

interface PaymentStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: string | null;
  /** Fires once verification confirms the payment actually succeeded — the caller uses this to clear the cart, since a failed/abandoned payment must leave it intact for "Try again". */
  onSuccess?: () => void;
  /**
   * The tenant's own storefront brand color, applied to action buttons so
   * this dialog stays visually consistent with the rest of that salon's
   * checkout flow. Status semantics (success/failure) never use it — those
   * stay fixed green/red regardless of brand, since a salon whose brand
   * color happens to be red can't have "success" read as an error.
   */
  brandColor?: string;
}

type VerifyStatus = "processing" | "success" | "failed";

/**
 * Opens the instant Paystack redirects back (reference/trxref present in the
 * URL) — before its webhook has necessarily run — then calls verify-booking-
 * payment immediately to find out what actually happened, same "verify on
 * redirect" pattern already used in salon-admin's subscription flow and
 * client-portal's booking detail page. Never assumes "processing" means
 * "succeeded"; a failed/abandoned charge gets its own state, not silence.
 */
export function PaymentStatusDialog({
  open,
  onOpenChange,
  reference,
  onSuccess,
  brandColor = "#2E1F4E",
}: PaymentStatusDialogProps) {
  const [status, setStatus] = useState<VerifyStatus>("processing");
  const verifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !reference) return;
    if (verifiedRef.current === reference) return;
    verifiedRef.current = reference;
    setStatus("processing");

    let cancelled = false;
    const run = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-booking-payment", {
          body: { reference },
        });
        if (cancelled) return;
        if (error || !data?.verified) {
          setStatus("failed");
          return;
        }
        setStatus("success");
        onSuccess?.();
      } catch {
        if (!cancelled) setStatus("failed");
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [open, reference, onSuccess]);

  const handleRetry = () => {
    verifiedRef.current = null;
    onOpenChange(false);
  };

  const badge = {
    processing: (
      <div className="h-16 w-16 rounded-full flex items-center justify-center bg-warning-bg">
        <Loader2 className="h-8 w-8 animate-spin text-warning-foreground" />
      </div>
    ),
    success: (
      <div className="h-16 w-16 rounded-full flex items-center justify-center bg-success-bg">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
    ),
    failed: (
      <div className="h-16 w-16 rounded-full flex items-center justify-center bg-destructive-bg">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
    ),
  }[status];

  const title = {
    processing: "Confirming your payment",
    success: "You're booked",
    failed: "Payment didn't go through",
  }[status];

  const copy = {
    processing: "This usually takes a few seconds. Don't close this window.",
    success: "Payment received. Your appointment is confirmed.",
    failed: "Your card wasn't charged and no appointment was booked. You can try again with the same or a different payment method.",
  }[status];

  return (
    <Dialog open={open} onOpenChange={status === "processing" ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => status === "processing" && e.preventDefault()}
        onEscapeKeyDown={(e) => status === "processing" && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{copy}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-2 space-y-5">
          {badge}

          <div className="text-center space-y-2">
            <h3 className="font-serif text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">{copy}</p>
          </div>

          {status === "success" && (
            <div className="flex items-start gap-3 p-4 bg-success-bg rounded-lg border border-success/20 w-full">
              <Mail className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <div className="space-y-1 text-left">
                <p className="text-sm font-medium text-success-foreground">Check your email</p>
                <p className="text-xs text-success-foreground/80">
                  Your receipt and booking confirmation just landed in your inbox.
                </p>
              </div>
            </div>
          )}

          {status === "processing" && (
            <div className="flex items-start gap-3 p-4 bg-primary/[0.06] rounded-lg border border-primary/10 w-full">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1 text-left">
                <p className="text-sm font-medium">A receipt is on its way</p>
                <p className="text-xs text-muted-foreground">
                  Once confirmed, you'll get a confirmation email with your booking details and receipt.
                </p>
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="flex items-start gap-3 p-4 bg-warning-bg rounded-lg border border-warning/30 w-full">
              <AlertTriangle className="h-5 w-5 text-warning-foreground shrink-0 mt-0.5" />
              <div className="space-y-1 text-left">
                <p className="text-sm font-medium text-warning-foreground">Still having trouble?</p>
                <p className="text-xs text-warning-foreground/80">
                  Reach out to the salon directly and reference the code below — they can look up exactly what happened.
                </p>
              </div>
            </div>
          )}

          {reference && status !== "processing" && (
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-md bg-muted">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Reference</span>
              <span className="text-xs font-mono font-semibold tabular-nums break-all text-right ml-3">{reference}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {status === "processing" && (
            <Button disabled className="w-full border-0 text-white" style={{ backgroundColor: brandColor }}>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Confirming…
            </Button>
          )}
          {status === "success" && (
            <Button onClick={() => onOpenChange(false)} className="w-full border-0 text-white" style={{ backgroundColor: brandColor }}>
              Done
            </Button>
          )}
          {status === "failed" && (
            <>
              <Button onClick={handleRetry} className="w-full border-0 text-white" style={{ backgroundColor: brandColor }}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full text-muted-foreground">
                Close
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
