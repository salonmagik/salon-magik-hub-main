import { useRef, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import { BrandLoader } from "./brand-loader";
import { Button } from "./button";

export interface OutcomeDialogProps {
  open: boolean;
  onClose: () => void;
  status?: "success" | "loading" | "error" | "cancelled";
  title: string;
  description: string;
  detail?: ReactNode;
  primaryAction?: { label: ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean };
  closeLabel?: string;
}

/** Shared completion pattern: plum header, gold emblem, serif title, quiet footer. */
export function OutcomeDialog({ open, onClose, status = "success", title, description, detail, primaryAction, closeLabel = "Done" }: OutcomeDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const loading = status === "loading";
  const success = status === "success";
  const Icon = success ? CheckCircle2 : AlertCircle;
  const label = loading ? "Confirming your payment" : success ? "A little more magik" : status === "cancelled" ? "Checkout closed" : "Payment update";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose(); }}>
      <DialogContent
        ref={contentRef}
        className="sm:max-w-lg focus:outline-none"
        closeButtonClassName={loading ? "hidden" : undefined}
        onEscapeKeyDown={(event) => { if (loading) event.preventDefault(); }}
        onInteractOutside={(event) => { if (loading) event.preventDefault(); }}
        onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus(); }}
      >
        <DialogHeader className="!py-5 !text-left pr-14 sm:pr-16">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/75">{label}</p>
        </DialogHeader>
        <div className="px-6 py-10 text-center sm:px-10 sm:py-12" aria-busy={loading}>
          {loading ? <BrandLoader label="" className="mb-6 [&_.loader-spin]:h-20 [&_.loader-spin]:w-20" /> : <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#F8C54B] text-[#2E1F4E]">
            <Icon aria-hidden="true" strokeWidth={1.8} className={`h-10 w-10 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            {success && <>
              <Sparkles aria-hidden="true" className="absolute -right-5 -top-1 h-5 w-5 text-[#C69422]" />
              <span aria-hidden="true" className="absolute -left-4 bottom-1 h-2 w-2 rounded-full bg-[#F8C54B]" />
            </>}
          </div>}
          <div role={status === "error" ? "alert" : "status"} aria-live="polite" className="space-y-3">
            <DialogTitle className="text-[28px] sm:text-[30px]">{title}</DialogTitle>
            <DialogDescription className="mx-auto max-w-sm text-base leading-relaxed">{description}</DialogDescription>
          </div>
          {detail && <div className="mt-6 rounded-2xl bg-muted/60 px-5 py-4 text-sm text-muted-foreground">{detail}</div>}
        </div>
        <div className="space-y-2 border-t border-border/60 p-4">
          {loading ? <p className="py-2 text-center text-sm text-muted-foreground">This usually takes a few seconds. Please keep this page open.</p> : <>
            {primaryAction && <Button className="w-full h-11 bg-[#2E1F4E] text-white hover:bg-[#3C2A61]" onClick={primaryAction.onClick} disabled={primaryAction.disabled || primaryAction.loading}>
              {primaryAction.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{primaryAction.label}
            </Button>}
            <Button variant={primaryAction ? "ghost" : "default"} className={primaryAction ? "w-full h-11" : "w-full h-11 bg-[#2E1F4E] text-white hover:bg-[#3C2A61]"} onClick={onClose}>{closeLabel}</Button>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
