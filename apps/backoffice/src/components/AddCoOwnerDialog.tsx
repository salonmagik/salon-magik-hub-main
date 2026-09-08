import { useEffect, useState } from "react";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { Crown, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";

interface AddCoOwnerDialogProps {
  tenant: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface TenantOwner {
  userId: string;
  fullName: string | null;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Restricted to salons with exactly one active owner — the mirror image of
 * AddTenantOwnerDialog's "no owner yet" restriction (AD-2). Every use
 * requires a fresh TOTP code, independent of the session-level "already
 * verified this session" flag, since granting ownership is a different
 * tier of consequence than the rest of what backoffice does.
 */
export function AddCoOwnerDialog({ tenant, onOpenChange, onSuccess }: AddCoOwnerDialogProps) {
  const [step, setStep] = useState<"details" | "totp">("details");
  const [owners, setOwners] = useState<TenantOwner[]>([]);
  const [isLoadingOwners, setIsLoadingOwners] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [existingMemberNote, setExistingMemberNote] = useState(false);
  const [totpToken, setTotpToken] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setStep("details");
    setOwners([]);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setDetailsError(null);
    setExistingMemberNote(false);
    setTotpToken("");
    setTotpError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  // Load the current owner(s) as soon as the dialog opens — shown in the
  // confirmation step and sent back as confirmedOwnerUserIds so a stale
  // confirmation (the owner set changed while the dialog was open) is
  // rejected server-side rather than silently acted on (FR-6).
  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    setIsLoadingOwners(true);
    (async () => {
      const { data, error } = await (supabase.rpc as any)("get_tenant_owners", { p_tenant_id: tenant.id });
      if (cancelled) return;
      if (error) {
        toast.error("Couldn't load this salon's current owners. Please try again.");
        onOpenChange(false);
        return;
      }
      setOwners(
        (data || []).map((row: any) => ({ userId: row.user_id, fullName: row.full_name, email: row.email })),
      );
      setIsLoadingOwners(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const handleContinue = async () => {
    setDetailsError(null);
    setExistingMemberNote(false);
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setDetailsError("Enter a valid email address.");
      return;
    }

    setIsCheckingEmail(true);
    try {
      const { data, error } = await (supabase.rpc as any)("check_owner_invite_email", {
        p_email: trimmedEmail,
        p_tenant_id: tenant?.id,
      });
      if (error) {
        setDetailsError("Something went wrong checking this email. Please try again.");
        return;
      }
      if (data?.available === false) {
        setDetailsError(
          data.reason === "already_owner_this_tenant"
            ? `${trimmedEmail} is already an owner of this salon.`
            : data.reason === "already_owner_other_tenant"
              ? "This email already owns another salon on Salon Magik."
              : "This email has a Salon Magik account under a different role at another salon and can't be added yet.",
        );
        return;
      }
      if (data?.note === "existing_member") {
        setExistingMemberNote(true);
      }
      if (!firstName.trim() || !lastName.trim()) {
        // Names are only required when the target has no existing account —
        // the server makes the final call, but an existing member (or any
        // other existing account) never needs them collected here.
        if (data?.note !== "existing_member") {
          setDetailsError("Enter the co-owner's first and last name.");
          return;
        }
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
      const { data, error } = await supabase.functions.invoke("backoffice-add-tenant-co-owner", {
        body: {
          tenantId: tenant.id,
          email: email.trim().toLowerCase(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || null,
          confirmedOwnerUserIds: owners.map((o) => o.userId),
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
        data?.status === "already_owner"
          ? (data.message || `That person is already an owner of ${tenant.name}.`)
          : `${tenant.name} now has a second owner.`,
      );
      close();
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(tenant)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        {step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-600" />
                Add co-owner
              </DialogTitle>
              <DialogDescription>
                {isLoadingOwners
                  ? "Loading this salon's current owner…"
                  : owners.length > 0
                    ? `This salon's current owner: ${owners.map((o) => o.fullName || o.email).join(", ")}. Add a second owner below.`
                    : `${tenant?.name} doesn't have exactly one active owner right now.`}
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="co-owner@salon.com" />
              </div>
              {existingMemberNote && (
                <p className="text-sm text-muted-foreground">
                  This person is already a team member at this salon — they'll be promoted to owner.
                </p>
              )}
              {!existingMemberNote && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>First name</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Phone (optional)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" />
              </div>
              {detailsError && <p className="text-sm text-destructive">{detailsError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={handleContinue} disabled={isCheckingEmail || isLoadingOwners || owners.length !== 1}>
                {isCheckingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                This salon's current owner is {owners.map((o) => o.fullName || o.email).join(", ")}. Enter your
                current 6-digit code to confirm adding {email} as a second owner of {tenant?.name}.
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
                Confirm & add co-owner
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
