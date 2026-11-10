import { useState } from "react";
import { Dialog, DialogDescription } from "@ui/dialog";
import {
  ArtifactDialogContent,
  ArtifactDialogHeader,
  ArtifactDialogFooter,
  ArtifactDialogTitle,
  ARTIFACT_DIALOG_BODY_PADDING,
} from "@/components/dialogs/ArtifactDialogChrome";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { Crown, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@shared/utils";

interface AddTenantOwnerDialogProps {
  tenant: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Restricted to salons with no active owner, this repairs the "owner was
 * invited but the invite silently never recorded" case, it isn't a general
 * reassign-ownership tool. Every use requires a fresh TOTP code, checked
 * independently of the session-level "already verified this session" flag
 * the rest of backoffice relies on, since this is a different tier of
 * consequence than the rest of what backoffice does.
 */
export function AddTenantOwnerDialog({ tenant, onOpenChange, onSuccess }: AddTenantOwnerDialogProps) {
  const [step, setStep] = useState<"details" | "totp">("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [totpToken, setTotpToken] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setStep("details");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setDetailsError(null);
    setTotpToken("");
    setTotpError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleContinue = async () => {
    setDetailsError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!firstName.trim() || !lastName.trim()) {
      setDetailsError("Enter the owner's first and last name.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setDetailsError("Enter a valid email address.");
      return;
    }

    setIsCheckingEmail(true);
    try {
      const { data, error } = await (supabase.rpc as any)("check_owner_invite_email", {
        p_email: trimmedEmail,
      });
      if (error) {
        setDetailsError("Something went wrong checking this email. Please try again.");
        return;
      }
      if (data?.available === false) {
        setDetailsError(
          data.reason === "already_owner"
            ? "This email already owns another salon on Salon Magik."
            : "This email already has a Salon Magik account under a different role. It can't be added as an owner yet.",
        );
        return;
      }
      setStep("totp");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleConfirm = async () => {
    if (!tenant || totpToken.length !== 6) return;
    setTotpError(null);
    setIsSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("backoffice-add-tenant-owner", {
        body: {
          tenantId: tenant.id,
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
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
        data?.mode === "new_account"
          ? `Owner account created and invited for ${tenant.name}.`
          : `${tenant.name} added to the owner's existing account.`,
      );
      close();
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(tenant)} onOpenChange={(open) => !open && close()}>
      <ArtifactDialogContent>
        {step === "details" ? (
          <>
            <ArtifactDialogHeader>
              <ArtifactDialogTitle className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-warning" />
                Add owner — {tenant?.name}
              </ArtifactDialogTitle>
            </ArtifactDialogHeader>
            <div className={cn(ARTIFACT_DIALOG_BODY_PADDING)}>
              <DialogDescription className="text-[12.5px]">
                {tenant?.name} currently has no owner. This is only for salons missing an owner, not for reassigning an existing one.
              </DialogDescription>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11.5px] font-semibold text-muted-foreground">First name</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11.5px] font-semibold text-muted-foreground">Last name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11.5px] font-semibold text-muted-foreground">Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@salon.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11.5px] font-semibold text-muted-foreground">Phone (optional)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" />
              </div>
              {detailsError && <p className="text-sm text-destructive">{detailsError}</p>}
            </div>
            <ArtifactDialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={handleContinue} disabled={isCheckingEmail}>
                {isCheckingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue
              </Button>
            </ArtifactDialogFooter>
          </>
        ) : (
          <>
            <ArtifactDialogHeader>
              <ArtifactDialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Confirm with your authenticator code
              </ArtifactDialogTitle>
            </ArtifactDialogHeader>
            <div className={cn(ARTIFACT_DIALOG_BODY_PADDING, "flex flex-col items-center gap-3")}>
              <DialogDescription className="text-center text-[12.5px]">
                Enter your current 6-digit code to confirm adding {firstName} {lastName} as owner of {tenant?.name}.
              </DialogDescription>
              <InputOTP maxLength={6} value={totpToken} onChange={setTotpToken} disabled={isSubmitting}>
                <InputOTPGroup className="gap-[7px]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-[48px] w-[40px] rounded-[8px] border first:rounded-[8px] last:rounded-[8px] first:border-l"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {totpError && <p className="text-sm text-destructive">{totpError}</p>}
            </div>
            <ArtifactDialogFooter>
              <Button variant="outline" onClick={() => setStep("details")} disabled={isSubmitting}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isSubmitting || totpToken.length !== 6}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm & add owner
              </Button>
            </ArtifactDialogFooter>
          </>
        )}
      </ArtifactDialogContent>
    </Dialog>
  );
}
