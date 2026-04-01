import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { useToast } from "@ui/ui/use-toast";
import { ArrowLeft, Lock, Mail, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@ui/button";

type LoginStep = "identifier" | "otp" | "password";
type IdentifierType = "email" | "phone";
type EmailOtpVerificationType = "email" | "magiclink";
type RouteState = {
  from?: {
    pathname?: string;
  };
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhone(value: string) {
  return /^\+?[\d\s()-]{10,}$/.test(value.trim());
}

function toPhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : `+${digits.replace(/\D/g, "")}`;
}

type Resolution = {
  exists: boolean;
  identifier: string;
  identifierType: IdentifierType;
  hasPassword: boolean;
  requiresOtp: boolean;
};

export default function ClientLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<IdentifierType | null>(null);
  const [resolvedIdentifier, setResolvedIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [emailOtpVerificationType, setEmailOtpVerificationType] =
    useState<EmailOtpVerificationType>("email");

  useEffect(() => {
    if (!resendAvailableAt) {
      setCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000),
      );
      setCountdown(remainingSeconds);
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  const identifierHint = useMemo(() => {
    if (identifierType === "phone") return "We sent a code to your phone number";
    return `We sent a code to ${resolvedIdentifier || identifier}`;
  }, [identifier, identifierType, resolvedIdentifier]);

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError("Please enter your email or phone number");
      return;
    }

    let nextIdentifierType: IdentifierType;
    let normalizedIdentifier: string;

    if (isEmail(trimmedIdentifier)) {
      nextIdentifierType = "email";
      normalizedIdentifier = trimmedIdentifier.toLowerCase();
    } else if (isPhone(trimmedIdentifier)) {
      nextIdentifierType = "phone";
      normalizedIdentifier = toPhone(trimmedIdentifier);
    } else {
      setError("Please enter a valid email address or phone number");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: resolveError } = await supabase.functions.invoke("auth-resolve-identifier", {
        body: { identifier: normalizedIdentifier },
      });

      if (resolveError || data?.error) {
        setError(data?.error || resolveError?.message || "We could not prepare your account.");
        return;
      }

      if (!data?.exists) {
        setError("No customer account was found for this email or phone number yet.");
        return;
      }

      const nextResolution: Resolution = {
        exists: true,
        identifier: data.identifier || normalizedIdentifier,
        identifierType: data.identifierType || nextIdentifierType,
        hasPassword: Boolean(data.hasPassword),
        requiresOtp: Boolean(data.requiresOtp),
      };

      setResolution(nextResolution);
      setIdentifierType(nextResolution.identifierType);
      setResolvedIdentifier(nextResolution.identifier);

      if (nextResolution.hasPassword) {
        setStep("password");
        setPassword("");
        return;
      }

      const sendStarted = await requestOtp(nextResolution.identifier, nextResolution.identifierType);
      if (sendStarted) {
        setStep("otp");
      }
    } catch (caughtError) {
      console.error("Client login identifier step failed", caughtError);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const requestOtp = async (targetIdentifier: string, targetType: IdentifierType) => {
    const { data: limitData, error: limitError } = await supabase.functions.invoke("auth-check-otp-rate-limit", {
      body: {
        identifier: targetIdentifier,
        appScope: "client_portal",
      },
    });

    if (limitError || limitData?.error) {
      setError(limitData?.error || limitError?.message || "Failed to prepare verification.");
      return false;
    }

    if (!limitData?.allowed) {
      setResendAvailableAt(limitData.retryAt ?? null);
      if (limitData.reason === "hourly_limit") {
        setError("You have reached the maximum number of OTP requests for this hour.");
      } else {
        setError("Please wait before requesting another verification code.");
      }
      return false;
    }

    setResendAvailableAt(limitData.retryAt ?? null);

    if (targetType === "email") {
      const { data, error: emailOtpError } = await supabase.functions.invoke("send-client-login-otp", {
        body: { email: targetIdentifier },
      });

      if (emailOtpError || data?.error) {
        setError(data?.error || emailOtpError?.message || "Failed to send verification email.");
        return false;
      }

      setEmailOtpVerificationType(
        data?.verificationType === "magiclink" ? "magiclink" : "email",
      );
    } else {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: targetIdentifier,
        options: { shouldCreateUser: false },
      } as never);

      if (otpError) {
        setError(otpError.message);
        return false;
      }
    }

    toast({
      title: targetType === "email" ? "Check your email" : "Check your phone",
      description:
        targetType === "email"
          ? "We sent a one-time code to your email address."
          : "We sent a one-time code to your phone number.",
    });
    return true;
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!resolution || !password) {
      setError("Enter your password to continue.");
      return;
    }

    setIsLoading(true);
    try {
      const credentials =
        resolution.identifierType === "email"
          ? { email: resolution.identifier, password }
          : { phone: resolution.identifier, password };

      const { error: signInError } = await supabase.auth.signInWithPassword(credentials as never);
      if (signInError) {
        setError("Incorrect password. Please try again.");
        return;
      }

      const routeState = location.state as RouteState | null;
      navigate(routeState?.from?.pathname || "/", { replace: true });
    } catch (caughtError) {
      console.error("Client password login failed", caughtError);
      setError("Failed to sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!resolution || otp.length !== 8) {
      setError("Please enter the 8-digit code");
      return;
    }

    setIsLoading(true);

    try {
      const verificationPayload =
        resolution.identifierType === "email"
          ? { email: resolution.identifier, token: otp, type: emailOtpVerificationType }
          : { phone: resolution.identifier, token: otp, type: "sms" as const };
      const { data, error: verifyError } = await supabase.auth.verifyOtp(verificationPayload);

      if (verifyError) {
        setError("Invalid or expired code. Please try again.");
        return;
      }

      if (data.session) {
        if (!resolution.hasPassword) {
          toast({
            title: "Identity verified",
            description: "Create a password to finish securing your account.",
          });
          navigate("/complete-account", { replace: true });
          return;
        }

        const routeState = location.state as RouteState | null;
        navigate(routeState?.from?.pathname || "/", { replace: true });
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "otp" || step === "password") {
      setStep("identifier");
      setOtp("");
      setPassword("");
      setError("");
      setResolution(null);
      setEmailOtpVerificationType("email");
    }
  };

  const handleResendOtp = async () => {
    if (!resolution || countdown > 0) return;
    setIsLoading(true);
    setError("");
    try {
      await requestOtp(resolution.identifier, resolution.identifierType);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title={
        step === "identifier"
          ? "Welcome Back"
          : step === "otp"
            ? "Enter Verification Code"
            : "Enter Password"
      }
      subtitle={
        step === "identifier"
          ? "Sign in to manage your bookings and account"
          : step === "otp"
            ? identifierHint
            : "Enter the password linked to this account to continue"
      }
    >
      <AuthCard>
        {step !== "identifier" && (
          <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}

        {step === "identifier" && (
          <form onSubmit={handleIdentifierSubmit} className="space-y-4">
            <AuthInput
              label="Email or Phone"
              type="text"
              placeholder="Enter your email or phone number"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              error={error}
              autoComplete="email"
              autoFocus
            />

            <AuthButton type="submit" isLoading={isLoading}>
              Continue
            </AuthButton>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                {identifierType === "email" ? <Mail className="h-4 w-4 text-primary" /> : <Phone className="h-4 w-4 text-primary" />}
                {resolvedIdentifier}
              </div>
              <p>Your account is already secured. Enter your password to continue.</p>
            </div>

            <AuthInput
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
              icon={<Lock className="h-4 w-4" />}
            />

            <AuthButton type="submit" isLoading={isLoading}>
              Sign in
            </AuthButton>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>

              <InputOTP maxLength={8} value={otp} onChange={setOtp} className="justify-center">
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                  <InputOTPSlot index={6} />
                  <InputOTPSlot index={7} />
                </InputOTPGroup>
              </InputOTP>

              {error && <p className="text-center text-sm text-destructive">{error}</p>}
            </div>

            <AuthButton type="submit" isLoading={isLoading}>
              Verify Code
            </AuthButton>

            <div className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isLoading || countdown > 0}
                className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {countdown > 0 ? `Resend available in ${countdown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  );
}
