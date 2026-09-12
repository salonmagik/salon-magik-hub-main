import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Crown, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTenants } from "@/hooks";
import { useOwnerStanding } from "@/hooks/useOwnerStanding";
import { toast } from "sonner";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";

interface MultiSalonOwnershipDialogProps {
  identity: { userId: string; fullName: string | null; email?: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const REASON_MIN_LENGTH = 10;

/**
 * Grants a reviewed, durable exception to the one-salon-per-owner rule
 * (owner_multi_salon_grants) — every additional salon this identity ever
 * gets is its own decision (requirement 2), never a raised cap. The
 * standing table below is the same assess_owner_multi_salon_standing call
 * the grant transaction itself re-runs, so what the reviewer sees here is
 * exactly what gates the grant.
 */
export function MultiSalonOwnershipDialog({ identity, onOpenChange, onSuccess }: MultiSalonOwnershipDialogProps) {
  const [step, setStep] = useState<"details" | "totp">("details");
  const [reason, setReason] = useState("");
  const [bindMode, setBindMode] = useState<"unbound" | "bound">("unbound");
  const [targetTenantId, setTargetTenantId] = useState<string>("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: standing, isLoading: isLoadingStanding } = useOwnerStanding(identity?.userId);
  const { data: allTenants } = useTenants();

  const ownedTenantIds = useMemo(
    () => new Set((standing?.salons || []).map((s) => s.tenantId)),
    [standing],
  );
  const selectableTenants = useMemo(() => {
    const search = tenantSearch.trim().toLowerCase();
    return (allTenants || [])
      .filter((t) => !ownedTenantIds.has(t.id))
      .filter((t) => !search || t.name.toLowerCase().includes(search))
      .slice(0, 20);
  }, [allTenants, ownedTenantIds, tenantSearch]);

  const reset = () => {
    setStep("details");
    setReason("");
    setBindMode("unbound");
    setTargetTenantId("");
    setTenantSearch("");
    setTotpToken("");
    setTotpError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const canContinue =
    Boolean(standing?.allGood) &&
    reason.trim().length >= REASON_MIN_LENGTH &&
    (bindMode === "unbound" || Boolean(targetTenantId));

  const handleConfirm = async () => {
    if (!identity || totpToken.length !== 6) return;
    setTotpError(null);
    setIsSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("backoffice-grant-multi-salon-ownership", {
        body: {
          userId: identity.userId,
          tenantId: bindMode === "bound" ? targetTenantId : null,
          reason: reason.trim(),
          totpToken,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error || data?.error) {
        setTotpError(data?.error || "Couldn't verify that code. Please try again.");
        setTotpToken("");
        return;
      }

      toast.success(
        bindMode === "bound"
          ? "Additional-salon ownership granted for the selected salon."
          : "Approved — the next salon this owner creates will complete automatically.",
      );
      close();
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayName = identity?.fullName || identity?.email || "this owner";

  return (
    <Dialog open={Boolean(identity)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        {step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-600" />
                Grant additional-salon ownership
              </DialogTitle>
              <DialogDescription>
                Reviewing {displayName}. Every salon they already own must be on an active paid
                subscription before this can be granted.
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
              <div className="space-y-1.5">
                <Label>Salons currently owned</Label>
                {isLoadingStanding ? (
                  <p className="text-sm text-muted-foreground">Loading standing…</p>
                ) : (standing?.salons.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">This person doesn't own a salon yet.</p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {standing!.salons.map((salon) => (
                      <div key={salon.tenantId} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{salon.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{salon.plan || "—"}</p>
                        </div>
                        <Badge variant={salon.inGoodStanding ? "default" : "destructive"}>
                          {salon.subscriptionStatus || "unknown"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                {standing && !standing.allGood && (
                  <p className="text-sm text-destructive">
                    Every salon above must be active before an additional salon can be granted.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>This grant is for</Label>
                <Select value={bindMode} onValueChange={(v) => setBindMode(v as "unbound" | "bound")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unbound">A salon they'll create themselves next</SelectItem>
                    <SelectItem value="bound">A specific salon that already exists</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {bindMode === "bound" && (
                <div className="space-y-1.5">
                  <Label>Target salon</Label>
                  <Input
                    placeholder="Search salons by name…"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                  />
                  <Select value={targetTenantId} onValueChange={setTargetTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a salon" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableTenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Business reason (required)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this identity is approved to own more than one salon…"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  {reason.trim().length}/{REASON_MIN_LENGTH} characters minimum
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={() => setStep("totp")} disabled={!canContinue}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Confirm with your authenticator code
              </DialogTitle>
              <DialogDescription>
                Enter your current 6-digit code to grant {displayName} an additional-salon ownership
                exception.
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "flex flex-col items-center gap-3")}>
              <InputOTP maxLength={6} value={totpToken} onChange={setTotpToken} disabled={isSubmitting}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {totpError && <p className="text-sm text-destructive">{totpError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("details")} disabled={isSubmitting}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isSubmitting || totpToken.length !== 6}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm & grant
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
