import { useEffect, useMemo, useState } from "react";
import { useBackofficeAuth } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { useToast } from "@ui/ui/use-toast";
import { CheckCircle2, Copy, Eye, EyeOff, X } from "lucide-react";

const BACKOFFICE_2FA_REMINDER_DISMISSED_KEY = "backoffice_2fa_reminder_dismissed";

function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (const byte of array) {
    secret += chars[byte % 32];
  }
  return secret;
}

type PasswordStep = "closed" | "form" | "success";

export function BackofficeOnboardingGate() {
  const { toast } = useToast();
  const {
    user,
    backofficeUser,
    requiresPasswordChange,
    refreshBackofficeUser,
    markPasswordChanged,
    setupTotp,
  } = useBackofficeAuth();

  const [passwordStep, setPasswordStep] = useState<PasswordStep>("closed");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isTotpModalOpen, setIsTotpModalOpen] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isSavingTotp, setIsSavingTotp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isReminderDismissed, setIsReminderDismissed] = useState(false);

  const requirements = [
    { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { label: "One number", test: (p: string) => /\d/.test(p) },
    { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ];

  const allRequirementsMet = requirements.every((r) => r.test(password));
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmitPassword = allRequirementsMet && passwordsMatch && !isSavingPassword;

  useEffect(() => {
    if (requiresPasswordChange) {
      setPasswordStep("form");
      return;
    }

    if (passwordStep === "form") {
      setPasswordStep("closed");
    }
  }, [passwordStep, requiresPasswordChange]);

  useEffect(() => {
    setIsReminderDismissed(sessionStorage.getItem(BACKOFFICE_2FA_REMINDER_DISMISSED_KEY) === "true");
  }, []);

  useEffect(() => {
    if (isTotpModalOpen && !totpSecret) {
      setTotpSecret(generateSecret());
      setTotpCode("");
    }
  }, [isTotpModalOpen, totpSecret]);

  const shouldShow2faReminder =
    !!backofficeUser && !requiresPasswordChange && !backofficeUser.totp_enabled && !isReminderDismissed;

  const otpauthUrl = useMemo(() => {
    if (!user?.email || !totpSecret) return "";
    return `otpauth://totp/SalonMagik:${user.email}?secret=${totpSecret}&issuer=SalonMagik&algorithm=SHA1&digits=6&period=30`;
  }, [user?.email, totpSecret]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!allRequirementsMet) {
      setPasswordError("Password must meet all requirements.");
      return;
    }

    if (!passwordsMatch) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Session expired. Please sign in again.");

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      const { error: boErr } = await supabase
        .from("backoffice_users")
        .update({
          temp_password_required: false,
          password_changed_at: new Date().toISOString(),
        })
        .eq("user_id", userData.user.id);

      if (boErr) throw boErr;

      markPasswordChanged();
      await Promise.race([refreshBackofficeUser(), new Promise((resolve) => setTimeout(resolve, 1200))]);

      setPasswordStep("success");
      setPassword("");
      setConfirm("");
      toast({
        title: "Password updated",
        description: "Your account is now secured with your new password.",
      });
    } catch (err: any) {
      setPasswordError(err?.message || "Could not update password. Please try again.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleCopySecret = async () => {
    await navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSetupTotp = async () => {
    if (totpCode.length !== 6) return;

    setIsSavingTotp(true);
    const success = await setupTotp(totpSecret);

    if (success) {
      await refreshBackofficeUser();
      setIsTotpModalOpen(false);
      setTotpSecret("");
      setTotpCode("");
      sessionStorage.removeItem(BACKOFFICE_2FA_REMINDER_DISMISSED_KEY);
      setIsReminderDismissed(false);
      toast({
        title: "2FA enabled",
        description: "Two-factor authentication has been enabled for your account.",
      });
    } else {
      toast({
        title: "Setup failed",
        description: "Could not complete 2FA setup. Please try again.",
        variant: "destructive",
      });
    }

    setIsSavingTotp(false);
  };

  const dismissReminderForSession = () => {
    sessionStorage.setItem(BACKOFFICE_2FA_REMINDER_DISMISSED_KEY, "true");
    setIsReminderDismissed(true);
  };

  return (
    <>
      {shouldShow2faReminder && (
        <div className="mx-6 mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Secure your account with 2FA</p>
              <p className="mt-1 text-red-600">
                Enable two-factor authentication to protect your BackOffice access.
              </p>
              <button
                type="button"
                className="mt-2 font-semibold underline underline-offset-2"
                onClick={() => setIsTotpModalOpen(true)}
              >
                Begin
              </button>
            </div>

            <button
              type="button"
              className="rounded p-1 text-red-500 transition hover:bg-red-100"
              aria-label="Dismiss reminder"
              onClick={dismissReminderForSession}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={passwordStep !== "closed"}>
        <AlertDialogContent>
          {passwordStep === "form" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Set a new password</AlertDialogTitle>
                <AlertDialogDescription>
                  This is your first login with a temporary password. Update it now to continue.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">New password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError(null);
                      }}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {requirements.map((req) => {
                      const ok = req.test(password);
                      return (
                        <li key={req.label} className={ok ? "text-emerald-600" : "text-red-600"}>
                          {ok ? "•" : "○"} {req.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm password</label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value);
                        setPasswordError(null);
                      }}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}

                <AlertDialogFooter>
                  <Button type="submit" disabled={!canSubmitPassword} className="w-full">
                    {isSavingPassword ? "Saving..." : "Save and continue"}
                  </Button>
                </AlertDialogFooter>
              </form>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Congratulations!
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Your password has been updated successfully. Continue to your dashboard or complete 2FA now.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <Button variant="outline" onClick={() => setPasswordStep("closed")}>
                  View dashboard
                </Button>
                <Button
                  onClick={() => {
                    setPasswordStep("closed");
                    setIsTotpModalOpen(true);
                  }}
                >
                  Set up 2FA
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isTotpModalOpen} onOpenChange={setIsTotpModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with Google Authenticator/Authy, then enter the 6-digit code.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {otpauthUrl && (
              <div className="rounded-md bg-muted p-4 text-center">
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`}
                    alt="Scan this QR with your authenticator app"
                    className="h-44 w-44 rounded bg-white p-2"
                  />
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <code className="rounded bg-background px-2 py-1 text-xs">
                    {totpSecret.match(/.{1,4}/g)?.join(" ")}
                  </code>
                  <Button type="button" size="icon" variant="ghost" onClick={handleCopySecret}>
                    <Copy className={`h-4 w-4 ${copied ? "text-emerald-600" : ""}`} />
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Enter 6-digit code</p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} disabled={isSavingTotp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <Button className="w-full" disabled={totpCode.length !== 6 || isSavingTotp} onClick={handleSetupTotp}>
              {isSavingTotp ? "Enabling..." : "Enable 2FA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
