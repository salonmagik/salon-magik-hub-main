import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

type LoginStep = "identifier" | "otp" | "password";

// Detect if input is email or phone
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPhone = (value: string) => /^\+?[\d\s-]{10,}$/.test(value.replace(/\s/g, ""));

export default function ClientLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<"email" | "phone" | null>(null);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    const trimmedIdentifier = identifier.trim();
    
    if (!trimmedIdentifier) {
      setError("Please enter your email or phone number");
      return;
    }

    // Detect type
    if (isEmail(trimmedIdentifier)) {
      setIdentifierType("email");
    } else if (isPhone(trimmedIdentifier)) {
      setIdentifierType("phone");
    } else {
      setError("Please enter a valid email address or phone number");
      return;
    }

    setIsLoading(true);

    try {
      if (isEmail(trimmedIdentifier)) {
        // Send OTP via email
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedIdentifier,
          options: {
            shouldCreateUser: false, // Only existing customers
          },
        });

        if (error) {
          if (error.message.includes("User not found")) {
            setError("No account found with this email. Please contact your salon.");
          } else {
            setError(error.message);
          }
          return;
        }

        toast({
          title: "Check your email",
          description: "We've sent a verification code to your email address.",
        });
        setStep("otp");
      } else {
        // Phone OTP requires SMS provider (Twilio/Africa's Talking)
        // Show informative message with alternative
        setError("Phone login coming soon. Please use your email address, or contact your salon for assistance.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: identifier,
        token: otp,
        type: "email",
      });

      if (error) {
        setError("Invalid or expired code. Please try again.");
        return;
      }

      if (data.session) {
        // Check if user has a password set - for now, complete login directly
        // Password prompt will be implemented when the edge function is ready
        const from = (location.state as any)?.from?.pathname || "/client";
        navigate(from, { replace: true });
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "otp") {
      setStep("identifier");
      setOtp("");
    } else if (step === "password") {
      setStep("otp");
      setPassword("");
    }
    setError("");
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: identifier,
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      toast({
        title: "Code resent",
        description: "A new verification code has been sent to your email.",
      });
    } catch (err) {
      setError("Failed to resend code. Please try again.");
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
          ? "Sign in to manage your bookings"
          : step === "otp"
          ? `We sent a code to ${identifier}`
          : "Please enter your password to continue"
      }
    >
      <AuthCard>
        {step !== "identifier" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
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

            <p className="text-center text-sm text-muted-foreground mt-4">
              Don't have an account?{" "}
              <span className="text-foreground">
                Book with a salon to get started
              </span>
            </p>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                className="justify-center"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
            </div>

            <AuthButton type="submit" isLoading={isLoading}>
              Verify Code
            </AuthButton>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={handleResendOtp}
                disabled={isLoading}
                className="text-sm"
              >
                Didn't receive the code? Resend
              </Button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            <AuthInput
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
              autoComplete="current-password"
              autoFocus
            />

            <AuthButton type="submit" isLoading={isLoading}>
              Sign In
            </AuthButton>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  );
}
