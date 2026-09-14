import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { ValidationChecklist } from "@ui/validation-checklist";
import { useToast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { validatePasswordStrength } from "@shared/validation";

interface PendingInvitation {
  invitation_id: string;
  tenant_id: string;
  tenant_name: string;
  email: string;
  expires_at: string;
  invited_by_name: string | null;
  requires_password_change: boolean;
}

type PageState = "loading" | "new-account" | "promote-in-place" | "terminal";

export default function AcceptCoOwnerInvitationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut, refreshTenants } = useAuth();

  const [state, setState] = useState<PageState>("loading");
  const [invitation, setInvitation] = useState<PendingInvitation | null>(null);
  const [terminalMessage, setTerminalMessage] = useState(
    "This invitation is no longer valid. Ask the salon owner to send a new one.",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const passwordValidation = validatePasswordStrength(password);
  const allRequirementsMet = passwordValidation.isValid;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("get_my_pending_co_owner_invitation");
      if (!mounted) return;

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setState("terminal");
        return;
      }
      if (new Date(row.expires_at) <= new Date()) {
        setState("terminal");
        return;
      }

      setInvitation(row as PendingInvitation);
      setState(row.requires_password_change ? "new-account" : "promote-in-place");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const validate = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};
    if (!password) {
      newErrors.password = "Password is required";
    } else if (!allRequirementsMet) {
      newErrors.password = "Password does not meet requirements";
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAccept = async (newPassword?: string) => {
    if (!invitation) return;
    setIsSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("accept-co-owner-invitation", {
        body: newPassword ? { newPassword } : {},
      });

      if (error || data?.error) {
        toast({
          title: "Couldn't accept invitation",
          description: data?.error || error?.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // admin.updateUserById revokes the current refresh token as a side
      // effect of a password change — the same reason ForcePasswordChangeDialog
      // re-signs in today. A promote-in-place acceptance never changes the
      // password, so the existing session stays valid.
      if (newPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password: newPassword,
        });
        if (signInError) {
          toast({ title: "Please sign in", description: "Your password has been set. Sign in to continue." });
          navigate("/login", { replace: true });
          return;
        }
      }

      toast({ title: "Welcome aboard", description: `You're now an owner of ${invitation.tenant_name}.` });
      await refreshTenants();
      navigate("/salon/overview", { replace: true });
    } catch (err: any) {
      toast({
        title: "Couldn't accept invitation",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    void handleAccept(password);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen auth-background flex items-center justify-center p-4">
        <p className="text-muted-foreground">Loading your invitation…</p>
      </div>
    );
  }

  if (state === "terminal") {
    return (
      <div className="min-h-screen auth-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="flex justify-center mb-6">
            <SalonMagikLogo size="lg" />
          </div>
          <div className="w-16 h-16 bg-warning-bg rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-warning" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Invitation no longer valid</h1>
          <p className="text-muted-foreground mb-6">{terminalMessage}</p>
          <Button className="w-full" onClick={handleSignOut}>
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  if (state === "promote-in-place" && invitation) {
    return (
      <div className="min-h-screen auth-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="flex justify-center mb-6">
            <SalonMagikLogo size="lg" />
          </div>
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Become an owner of {invitation.tenant_name}</h1>
          <p className="text-muted-foreground mb-6">
            {invitation.invited_by_name || "A salon owner"} invited you to co-own{" "}
            <strong>{invitation.tenant_name}</strong>. You'll keep signing in with your existing password.
          </p>
          <div className="space-y-3">
            <Button className="w-full" disabled={isSubmitting} onClick={() => void handleAccept()}>
              {isSubmitting ? "Accepting…" : "Accept and become an owner"}
            </Button>
            <Button variant="outline" className="w-full" disabled={isSubmitting} onClick={handleSignOut}>
              Not now
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (state === "new-account" && invitation) {
    return (
      <div className="min-h-screen auth-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex justify-center mb-6">
            <SalonMagikLogo size="lg" />
          </div>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold mb-2">Become an owner of {invitation.tenant_name}</h1>
            <p className="text-muted-foreground">
              {invitation.invited_by_name || "A salon owner"} invited you to co-own{" "}
              <strong>{invitation.tenant_name}</strong>. Set a permanent password to continue.
            </p>
          </div>

          <form onSubmit={handleNewAccountSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-owner-password">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-owner-password"
                  type={showPassword ? "text" : "password"}
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-owner-password">Confirm password</Label>
              <Input
                id="confirm-owner-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
              />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
            </div>

            <ValidationChecklist items={passwordValidation.rules} />

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !allRequirementsMet || password !== confirmPassword}
            >
              {isSubmitting ? "Setting password…" : "Set password and accept"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return null;
}
