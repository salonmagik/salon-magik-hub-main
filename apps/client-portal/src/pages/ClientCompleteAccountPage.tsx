import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { ValidationChecklist } from "@ui/validation-checklist";
import { useToast } from "@ui/ui/use-toast";
import { validatePasswordStrength } from "@shared/validation";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks";

export default function ClientCompleteAccountPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshAccount } = useClientAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const passwordValidation = useMemo(() => validatePasswordStrength(password), [password]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!passwordValidation.isValid) {
      setError("Password does not meet the security requirements.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      // Capture email before calling the edge function — updateUserById invalidates the
      // current refresh token as a security measure, so we must re-sign in afterwards.
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userEmail = currentUser?.email;

      const { data, error: invokeError } = await supabase.functions.invoke("auth-set-client-password", {
        body: { password },
      });

      if (invokeError || data?.error) {
        setError(data?.error || invokeError?.message || "Failed to secure your account.");
        return;
      }

      // Re-sign in with the new password to establish a fresh session
      // (the old refresh token was revoked by the password change)
      if (userEmail) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password,
        });
        if (signInError) {
          toast({
            title: "Password set",
            description: "Your password has been created. Please sign in to continue.",
          });
          navigate("/login", { replace: true });
          return;
        }
      }

      await refreshAccount();
      toast({
        title: "Account secured",
        description: "Your password has been set successfully.",
      });
      navigate("/", { replace: true });
    } catch (caughtError) {
      console.error("Failed to set client password", caughtError);
      setError("Failed to secure your account.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Secure your account"
      subtitle="Create a password to complete your Salon Magik customer account setup."
    >
      <AuthCard>
        <div className="mb-6 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            One-time required step
          </div>
          <p>
            You have verified your identity. Set a password now to finish securing this account before
            continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthInput
            label="New password"
            type="password"
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            error={error}
          />

          <AuthInput
            label="Confirm password"
            type="password"
            placeholder="Repeat your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
          />

          <ValidationChecklist
            title="Password requirements"
            description="Use a strong password to protect your customer account."
            rules={passwordValidation.rules}
          />

          <AuthButton
            type="submit"
            isLoading={isLoading}
            disabled={!passwordValidation.isValid || !confirmPassword}
          >
            Finish setup
          </AuthButton>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
