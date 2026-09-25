import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, Mail, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#f4effb] text-[#5d4385]">
        <Loader2 className="h-[29px] w-[29px] animate-spin" />
      </div>
    ),
    success: (
      <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#e8f8ee] text-[#15834b]">
        <CheckCircle2 className="h-[31px] w-[31px]" />
      </div>
    ),
    failed: (
      <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#fff0f0] text-destructive">
        <AlertTriangle className="h-[29px] w-[29px]" />
      </div>
    ),
  }[status];

  const eyebrow = {
    processing: "Payment status",
    success: "Booking confirmed",
    failed: "Payment issue",
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
        className="overflow-hidden sm:max-w-md"
        closeButtonClassName="text-[#7d7483] hover:bg-[#f5f2f8] hover:text-[#30204f]"
        onPointerDownOutside={(e) => status === "processing" && e.preventDefault()}
        onEscapeKeyDown={(e) => status === "processing" && e.preventDefault()}
      >
        <div className="h-2 shrink-0 bg-[#30204f]" />
        <div className="px-5 pb-6 pt-10 text-center sm:px-7">
          <div className="flex flex-col items-center">
            {badge}
            <p className="mt-[18px] text-[11px] uppercase tracking-[0.1em] text-[#7f7588]">{eyebrow}</p>
            <DialogTitle className="mt-2 font-sans text-[27px] font-medium leading-tight tracking-tight text-[#201d25]">
              {title}
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-[320px] text-sm leading-[1.5] text-[#716879]">
              {copy}
            </DialogDescription>
          </div>

          {status === "success" && (
            <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-[#b9e8ca] bg-[#effaf3] p-4 text-left text-[#17633d]">
              <Mail className="mt-0.5 h-[19px] w-[19px] shrink-0" />
              <div>
                <p className="text-sm font-medium">Check your email</p>
                <p className="mt-1 text-xs leading-[1.45] text-[#6e6872]">
                  Your receipt and booking confirmation are on their way.
                </p>
              </div>
            </div>
          )}

          {status === "processing" && (
            <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-[#ddd0ed] bg-[#f8f4fc] p-4 text-left text-[#4f3970]">
              <Info className="mt-0.5 h-[19px] w-[19px] shrink-0" />
              <div>
                <p className="text-sm font-medium">Checking with your payment provider</p>
                <p className="mt-1 text-xs leading-[1.45] text-[#6e6872]">
                  We’ll show your booking details as soon as the payment is confirmed.
                </p>
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-[#f3c3c3] bg-[#fff5f5] p-4 text-left text-[#8e2f36]">
              <AlertTriangle className="mt-0.5 h-[19px] w-[19px] shrink-0" />
              <div>
                <p className="text-sm font-medium">Still having trouble?</p>
                <p className="mt-1 text-xs leading-[1.45] text-[#6e6872]">
                  Reach out to the salon directly and reference the code below — they can look up exactly what happened.
                </p>
              </div>
            </div>
          )}

          {reference && status !== "processing" && (
            <div className="mt-3 flex w-full items-center justify-between gap-4 rounded-[11px] bg-[#f5f2f8] px-[15px] py-[13px] text-left">
              <span className="text-[10px] uppercase tracking-[0.1em] text-[#80768b]">Reference</span>
              <span className="break-all text-right font-mono text-[11px] font-semibold text-[#30204f]">{reference}</span>
            </div>
          )}

          <div className="mt-[18px] flex flex-col gap-2">
            {status === "processing" && (
              <Button disabled className="w-full rounded-[12px] border-0 text-white opacity-100" style={{ backgroundColor: brandColor }}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming…
              </Button>
            )}
            {status === "success" && (
              <Button onClick={() => onOpenChange(false)} className="w-full rounded-[12px] border-0 text-white" style={{ backgroundColor: brandColor }}>
                Done
              </Button>
            )}
            {status === "failed" && (
              <>
                <Button onClick={handleRetry} className="w-full rounded-[12px] border-0 text-white" style={{ backgroundColor: brandColor }}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full text-[#7d7483] hover:text-[#30204f]">
                  Close
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
