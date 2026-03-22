import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, Send, Phone } from "lucide-react";
import { useToast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@ui/input-otp";
import { Lock } from "lucide-react";
import {
  validatePasswordStrength,
  validatePhoneByCountry,
} from "@shared/validation";
import { getCountryByDialCode, parseE164 } from "@shared/countries";
import { ValidationChecklist } from "@ui/validation-checklist";

type PhoneFlowStep = "phone" | "otp" | "newPassword";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"email" | "phone">("email");
  
  // Email flow state
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isEmailSubmitted, setIsEmailSubmitted] = useState(false);

  // Phone flow state
  const [phoneFlowStep, setPhoneFlowStep] = useState<PhoneFlowStep>("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [isPhoneSuccess, setIsPhoneSuccess] = useState(false);

  const emailTrimmed = email.trim();
  const isEmailValid = /\S+@\S+\.\S+/.test(emailTrimmed);
  const parsedPhone = parseE164(phone);
  const phoneCountry = parsedPhone ? getCountryByDialCode(parsedPhone.dialCode)?.code ?? "" : "";
  const phoneValidation = validatePhoneByCountry(phoneCountry, parsedPhone?.nationalNumber ?? "");
  const passwordValidation = validatePasswordStrength(newPassword);
  const isConfirmMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPasswordReset =
    passwordValidation.isValid && isConfirmMatch && !isLoading;

  // Email flow handlers
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailTrimmed) {
      setEmailError("Email is required");
      return;
    }
    
    if (!isEmailValid) {
      setEmailError("Please enter a valid email");
      return;
    }
    
    setIsLoading(true);
    setEmailError("");
    
    try {
      // Call custom edge function instead of Supabase default
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: { 
          email: emailTrimmed, 
          origin: window.location.origin 
        },
      });
      
      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to send reset email",
          variant: "destructive",
        });
      } else {
        setIsEmailSubmitted(true);
        toast({
          title: "Reset link sent",
          description: "Check your email for the password reset link.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Phone flow handlers
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Please enter a valid phone number");
      return;
    }
    
    setIsLoading(true);
    setPhoneError("");
    
    try {
      // Send OTP to phone for password reset
      const { error } = await supabase.auth.signInWithOtp({
        phone: phone,
      });
      
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setPhoneFlowStep("otp");
        toast({
          title: "OTP sent",
          description: "Enter the code we sent to your phone.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      setOtpError("Please enter the 6-digit code");
      return;
    }
    
    setIsLoading(true);
    setOtpError("");
    
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone,
        token: otp,
        type: "sms",
      });
      
      if (error) {
        setOtpError("Invalid or expired code. Please try again.");
      } else {
        setPhoneFlowStep("newPassword");
        toast({
          title: "Phone verified",
          description: "Now set your new password.",
        });
      }
    } catch (error) {
      setOtpError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let hasError = false;
    
    if (!newPassword) {
      setPasswordError("Password is required");
      hasError = true;
    } else {
      if (!passwordValidation.isValid) {
        setPasswordError("Password does not meet all requirements");
        hasError = true;
      }
    }
    
    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords do not match");
      hasError = true;
    }
    
    if (hasError) return;
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setIsPhoneSuccess(true);
        toast({
          title: "Password updated",
          description: "Your password has been successfully reset.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phone,
      });
      
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Code resent",
          description: "A new verification code has been sent.",
        });
        setOtp("");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resend code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Email submitted success view
  if (isEmailSubmitted) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We've sent a password reset link to your email address."
      >
        <AuthCard className="text-center">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-success" />
          </div>
          <p className="text-muted-foreground mb-6">
            Click the link in your email to reset your password. If you don't see it, check your spam folder.
          </p>
          <AuthButton
            variant="outline"
            onClick={() => setIsEmailSubmitted(false)}
            icon={<ArrowLeft size={18} />}
          >
            Try another email
          </AuthButton>
        </AuthCard>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  // Phone flow success view
  if (isPhoneSuccess) {
    return (
      <AuthLayout
        title="Password reset successful"
        subtitle="Your password has been updated."
      >
        <AuthCard className="text-center">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="w-8 h-8 text-success" />
          </div>
          <p className="text-muted-foreground mb-6">
            You can now sign in with your new password.
          </p>
          <AuthButton onClick={() => window.location.href = "/login"}>
            Sign in
          </AuthButton>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="No worries! We'll help you reset it."
    >
      <AuthCard>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "email" | "phone")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail size={16} />
              Email
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex items-center gap-2">
              <Phone size={16} />
              Phone
            </TabsTrigger>
          </TabsList>

          {/* Email Tab */}
          <TabsContent value="email">
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Enter your email and we'll send you a reset link.
              </p>
              <AuthInput
                label="Email address"
                type="email"
                placeholder="Enter your email address"
                icon={<Mail size={18} />}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                error={emailError}
                disabled={isLoading}
              />

              <AuthButton
                type="submit"
                isLoading={isLoading}
                disabled={!isEmailValid || isLoading}
                icon={<Send size={18} />}
              >
                Send reset link
              </AuthButton>
            </form>
          </TabsContent>

          {/* Phone Tab */}
          <TabsContent value="phone">
            {phoneFlowStep === "phone" && (
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your phone number to receive a verification code.
                </p>
                <AuthPhoneInput
                  label="Phone number"
                  value={phone}
                  onChange={(value) => {
                    setPhone(value);
                    setPhoneError("");
                  }}
                  error={phoneError}
                  disabled={isLoading}
                  defaultCountry="NG"
                />

                <AuthButton
                  type="submit"
                  isLoading={isLoading}
                  disabled={!phoneValidation.isValid || isLoading}
                  icon={<Send size={18} />}
                >
                  Send verification code
                </AuthButton>
              </form>
            )}

            {phoneFlowStep === "otp" && (
              <form onSubmit={handleOtpVerify} className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the 6-digit code sent to {phone}
                </p>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    Verification code
                  </label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(value) => {
                        setOtp(value);
                        setOtpError("");
                      }}
                      disabled={isLoading}
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
                  </div>
                  {otpError && <p className="text-sm text-destructive text-center">{otpError}</p>}
                </div>

                <AuthButton type="submit" isLoading={isLoading} disabled={otp.length !== 6 || isLoading}>
                  Verify code
                </AuthButton>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={isLoading}
                    className="text-sm text-primary hover:underline"
                  >
                    Resend code
                  </button>
                  <p className="text-xs text-muted-foreground">or</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneFlowStep("phone");
                      setOtp("");
                      setOtpError("");
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Use a different number
                  </button>
                </div>
              </form>
            )}

            {phoneFlowStep === "newPassword" && (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Create a strong password for your account.
                </p>
                
                <AuthInput
                  label="New password"
                  type="password"
                  placeholder="Enter new password"
                  icon={<Lock size={18} />}
                  value={newPassword}
                  onChange={(e) => {
                    const nextPassword = e.target.value;
                    setNewPassword(nextPassword);
                    setPasswordError("");
                    if (confirmPassword) {
                      setConfirmError(
                        nextPassword === confirmPassword ? "" : "Passwords do not match"
                      );
                    }
                  }}
                  error={passwordError}
                  disabled={isLoading}
                />

                <AuthInput
                  label="Confirm password"
                  type="password"
                  placeholder="Confirm new password"
                  icon={<Lock size={18} />}
                  value={confirmPassword}
                  onChange={(e) => {
                    const nextConfirm = e.target.value;
                    setConfirmPassword(nextConfirm);
                    setConfirmError(
                      newPassword && nextConfirm !== newPassword ? "Passwords do not match" : ""
                    );
                  }}
                  error={confirmError}
                  disabled={isLoading}
                />

                <ValidationChecklist items={passwordValidation.rules} />

                <AuthButton type="submit" isLoading={isLoading} disabled={!canSubmitPasswordReset}>
                  Reset password
                </AuthButton>
              </form>
            )}
          </TabsContent>
        </Tabs>

        <p className="mt-4 text-center">
          <Link to="/login" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </AuthCard>

      {/* Support Note */}
      <AuthCard className="mt-4 text-center bg-surface border-0">
        <p className="text-sm text-muted-foreground">
          <strong className="text-primary">Need help?</strong> Contact our support team at{" "}
          <a href="mailto:support@salonmagik.com" className="text-primary hover:underline">
            support@salonmagik.com
          </a>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
