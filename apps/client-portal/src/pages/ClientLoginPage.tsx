import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { PhoneInput } from "@ui/phone-input";
import { useToast } from "@ui/ui/use-toast";
import { ArrowLeft, Lock, Mail, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@ui/button";
import { PRODUCT_LIVE_COUNTRIES } from "@shared/countries";

type LoginStep = "identifier" | "otp" | "password";
type IdentifierTab = "email" | "phone";
type IdentifierType = "email" | "phone";
type EmailOtpVerificationType = "email" | "magiclink";
type RouteState = {
  from?: {
    pathname?: string;
  };
};

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
  const [activeTab, setActiveTab] = useState<IdentifierTab>("email");
  const [emailValue, setEmailValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
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
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);

  const allowedCountryCodes = PRODUCT_LIVE_COUNTRIES.map((c) => c.code);

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
    return `We sent a code to ${resolvedIdentifier}`;
  }, [identifierType, resolvedIdentifier]);

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    let normalizedIdentifier: string;
    const nextIdentifierType: IdentifierType = activeTab;

    if (activeTab === "email") {
      const trimmed = emailValue.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError("Please enter a valid email address");
        return;
      }
      normalizedIdentifier = trimmed;
    } else {
      if (!phoneValue || phoneValue.replace(/\D/g, "").length < 7) {
        setError("Please enter your phone number");
        return;
      }
      normalizedIdentifier = phoneValue;
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
        setError("No account was found. Please check your details or contact the salon.");
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
        console.error("Email OTP send failed:", { emailOtpError, dataError: data?.error });
        setError("We're having trouble sending your verification email. Please try again.");
        return false;
      }

      setEmailOtpVerificationType(
        data?.verificationType === "magiclink" ? "magiclink" : "email",
      );
    } else {
      const { data: phoneOtpData, error: phoneOtpError } = await supabase.functions.invoke("send-phone-otp", {
        body: { phone: targetIdentifier },
      });

      if (phoneOtpError || phoneOtpData?.error) {
        if (phoneOtpData?.error === "cooldown") {
          setError("Please wait 60 seconds before requesting another code.");
        } else {
          setError("We're having trouble sending your verification code. Please try again.");
        }
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

  const handleForgotPassword = async () => {
    if (!resolution) return;
    setError("");
    setForgotPasswordMode(true);
    setIsLoading(true);
    try {
      const sent = await requestOtp(resolution.identifier, resolution.identifierType);
      if (sent) {
        setOtp("");
        setStep("otp");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const otpLength = resolution?.identifierType === "phone" ? 6 : 8;
    if (!resolution || otp.length !== otpLength) {
      setError(`Please enter the ${otpLength}-digit code`);
      return;
    }

    setIsLoading(true);

    try {
      if (resolution.identifierType === "phone") {
        const { data: phoneVerifyData, error: phoneVerifyError } = await supabase.functions.invoke("verify-phone-otp", {
          body: { phone: resolution.identifier, otp },
        });

        if (phoneVerifyError || phoneVerifyData?.error) {
          setError(phoneVerifyData?.error || "Invalid or expired code. Please try again.");
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: phoneVerifyData.access_token,
          refresh_token: phoneVerifyData.refresh_token,
        });
        if (sessionError) {
          setError("Failed to create session. Please try again.");
          return;
        }

        if (!resolution.hasPassword || forgotPasswordMode) {
          toast({
            title: "Identity verified",
            description: forgotPasswordMode
              ? "Set a new password to secure your account."
              : "Create a password to finish securing your account.",
          });
          navigate("/complete-account", { replace: true });
          return;
        }

        const routeState = location.state as RouteState | null;
        navigate(routeState?.from?.pathname || "/", { replace: true });
      } else {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email: resolution.identifier,
          token: otp,
          type: emailOtpVerificationType,
        });

        if (verifyError) {
          setError("Invalid or expired code. Please try again.");
          return;
        }

        if (data.session) {
          if (!resolution.hasPassword || forgotPasswordMode) {
            toast({
              title: "Identity verified",
              description: forgotPasswordMode
                ? "Set a new password to secure your account."
                : "Create a password to finish securing your account.",
            });
            navigate("/complete-account", { replace: true });
            return;
          }

          const routeState = location.state as RouteState | null;
          navigate(routeState?.from?.pathname || "/", { replace: true });
        }
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
      setForgotPasswordMode(false);
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
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as IdentifierTab);
                setError("");
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="email" className="gap-2">
                  <Mail size={16} />
                  Email
                </TabsTrigger>
                <TabsTrigger value="phone" className="gap-2">
                  <Phone size={16} />
                  Phone
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === "email" ? (
              <AuthInput
                label="Email address"
                type="email"
                placeholder="Enter your email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                error={error}
                autoComplete="email"
                autoFocus
              />
            ) : (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">Phone number</label>
                <PhoneInput
                  value={phoneValue}
                  onChange={setPhoneValue}
                  defaultCountry="GH"
                  allowedCountryCodes={allowedCountryCodes}
                  hasError={!!error}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}

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

            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>

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

              {(() => {
                const otpSlotCount = resolution?.identifierType === "phone" ? 6 : 8;
                return (
                  <InputOTP maxLength={otpSlotCount} value={otp} onChange={setOtp} className="justify-center">
                    <InputOTPGroup>
                      {Array.from({ length: otpSlotCount }, (_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                );
              })()}

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
