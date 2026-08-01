import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Loader2, RefreshCcw, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface MigrateTenantBillingDialogProps {
  tenant: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface PreviewResult {
  dryRun: boolean;
  tenantName: string;
  billingCycle: string;
  activeSubscriptionsFound: Array<{ code: string; plan?: string }>;
  disabled: string[];
  annualBasePriceGapWarning: string | null;
}

/**
 * Moves one tenant off Paystack's native Subscription engine and onto the
 * self-managed billing cron. Deliberately one tenant at a time, previewed
 * before it touches anything real — see backoffice-migrate-tenant-billing
 * for why this isn't automated.
 */
export function MigrateTenantBillingDialog({ tenant, onOpenChange, onSuccess }: MigrateTenantBillingDialogProps) {
  const [step, setStep] = useState<"loading" | "preview" | "error">("loading");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const close = () => {
    setStep("loading");
    setPreview(null);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const callFunction = async (dryRun: boolean) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return supabase.functions.invoke("backoffice-migrate-tenant-billing", {
      body: { tenantId: tenant?.id, dryRun },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
  };

  const loadPreview = async () => {
    if (!tenant) return;
    setStep("loading");
    setErrorMessage(null);
    const { data, error } = await callFunction(true);
    if (error || data?.error) {
      setErrorMessage(data?.error || "Couldn't load a preview for this tenant.");
      setStep("error");
      return;
    }
    setPreview(data as PreviewResult);
    setStep("preview");
  };

  const handleConfirm = async () => {
    if (!tenant) return;
    setIsConfirming(true);
    try {
      const { data, error } = await callFunction(false);
      if (error || data?.error) {
        toast.error(data?.error || "Migration failed.");
        return;
      }
      toast.success(`${tenant.name} moved to self-managed billing.`);
      close();
      onSuccess();
    } finally {
      setIsConfirming(false);
    }
  };

  if (!tenant) return null;

  return (
    <Dialog
      open={Boolean(tenant)}
      onOpenChange={(open) => {
        if (!open) close();
        else if (step === "loading" && !preview && !errorMessage) loadPreview();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5 text-primary" />
            Migrate to self-managed billing
          </DialogTitle>
          <DialogDescription>
            Disables {tenant.name}'s Paystack Subscription and schedules them into the self-managed billing
            cron, which correctly reflects their current plan tier and add-ons every cycle.
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Billing cycle:</span>
              <Badge variant="outline" className="capitalize">{preview.billingCycle}</Badge>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">
                {preview.activeSubscriptionsFound.length} active Paystack subscription(s) found
              </p>
              {preview.activeSubscriptionsFound.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to disable — this tenant may already be off Paystack's subscription engine, or never
                  had one. Confirming will still schedule them into the self-managed cron.
                </p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {preview.activeSubscriptionsFound.map((sub) => (
                    <li key={sub.code} className="rounded-md border px-3 py-1.5">
                      {sub.plan || "Unnamed plan"} — <span className="font-mono text-xs">{sub.code}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {preview.annualBasePriceGapWarning && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                <p>{preview.annualBasePriceGapWarning}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isConfirming}>
            Cancel
          </Button>
          {step === "preview" && (
            <Button variant="destructive" onClick={handleConfirm} disabled={isConfirming}>
              {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm migration
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
