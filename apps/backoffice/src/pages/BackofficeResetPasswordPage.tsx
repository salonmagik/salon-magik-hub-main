import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { useToast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Shield, Eye, EyeOff, AlertCircle, Check, Circle } from "lucide-react";
import { cn } from "@shared/utils";

export default function BackofficeResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const token = searchParams.get("token");

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError("No reset token provided");
        setIsVerifying(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-reset-token", {
          body: { token },
        });

        if (error || !data?.valid) {
          setTokenError(data?.error || "Invalid or expired reset link");
          setTokenValid(false);
        } else {
          setTokenValid(true);
          setEmail(data.email || "");
        }
      } catch (err) {
        setTokenError("Failed to verify reset link");
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please ensure both passwords are identical",
        variant: "destructive",
      });
      return;
    }

    if (totpCode.length !== 6) {
      toast({
        title: "Authenticator code required",
        description: "Please enter your 6-digit authenticator code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("complete-backoffice-password-reset", {
        body: {
          token,
          newPassword: password,
          totpCode,
        },
      });

      if (error || !data?.success) {
        toast({
          title: "Reset failed",
          description: data?.error || error?.message || "Failed to reset password",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Password reset successful",
        description: "You can now sign in with your new password",
      });

      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checks = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Z]/.test(password), label: "One uppercase letter" },
    { ok: /[0-9]/.test(password), label: "One number" },
    { ok: password.length > 0 && password === confirmPassword, label: "Passwords match" },
  ];

  if (isVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex w-full max-w-[400px] justify-center rounded-2xl border border-border bg-card py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-destructive">
              <AlertCircle className="h-5 w-5 text-destructive-foreground" />
            </div>
            <div className="text-lg font-bold text-foreground">Invalid reset link</div>
            <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">{tokenError}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7">
            <Button
              onClick={() => navigate("/forgot-password")}
              className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
            >
              Request new reset link
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-lg font-bold text-foreground">Set a new password</div>
          <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">For {email}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">
          <form onSubmit={handleSubmit} className="space-y-0">
            <div className="mb-3.5">
              <Label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                New password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-auto rounded-[8px] border-input px-[13px] py-[11px] pr-10 text-[13.5px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mb-[18px]">
              <Label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Confirm new password
              </Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="h-auto rounded-[8px] border-input px-[13px] py-[11px] text-[13.5px]"
              />
            </div>

            <div className="mb-[22px] flex flex-col gap-1.5">
              {checks.map((c) => (
                <div
                  key={c.label}
                  className={cn("flex items-center gap-1.5 text-xs", c.ok ? "text-success" : "text-muted-foreground")}
                >
                  {c.ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {c.label}
                </div>
              ))}
            </div>

            <div className="mb-[18px]">
              <Label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Authenticator code
              </Label>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode}>
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className={cn(
                          "h-12 w-10 rounded-[8px] border-l text-lg font-bold",
                          totpCode.length > i && "border-primary bg-primary/10",
                        )}
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
