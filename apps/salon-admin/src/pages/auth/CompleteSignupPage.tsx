import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, User } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@ui/use-toast";
import { getGoogleProfileFields } from "@/lib/authCompletion";

export default function CompleteSignupPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, refreshAuthUser, refreshProfile } = useAuth();
  const googleProfile = getGoogleProfileFields(user);
  const [firstName, setFirstName] = useState(googleProfile.firstName);
  const [lastName, setLastName] = useState(googleProfile.lastName);
  const [phone, setPhone] = useState(googleProfile.phone);
  const initialPhoneRef = useRef(googleProfile.phone);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingPhoneVerification, setIsCheckingPhoneVerification] = useState(true);
  const [phoneVerifiedFor, setPhoneVerifiedFor] = useState<string | null>(null);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState<number | null>(null);
  const [otpCooldownSecondsLeft, setOtpCooldownSecondsLeft] = useState(0);

  const email = useMemo(() => user?.email || "", [user?.email]);
  const phoneIsVerified = phoneVerifiedFor !== null && phoneVerifiedFor === phone;

  useEffect(() => {
    if (!otpCooldownUntil) return;
    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((otpCooldownUntil - Date.now()) / 1000));
      setOtpCooldownSecondsLeft(secondsLeft);
      if (secondsLeft <= 0) setOtpCooldownUntil(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [otpCooldownUntil]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhoneVerification() {
      if (!user?.id) {
        setIsCheckingPhoneVerification(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("phone, phone_verified_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled && !error && data?.phone_verified_at && data.phone === initialPhoneRef.current) {
        setPhoneVerifiedFor(initialPhoneRef.current);
      }
      if (!cancelled) setIsCheckingPhoneVerification(false);
    }

    void loadPhoneVerification();
    return () => {
      cancelled = true;
    };
    // The profile check only needs to run once. Phone edits are handled
    // locally and immediately clear the verification state below.
  }, [user?.id]);

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (value !== phoneVerifiedFor) {
      setPhoneVerifiedFor(null);
      setOtpSentTo(null);
      setOtpCode("");
      setOtpError("");
    }
  };

  const readFunctionError = async (error: unknown, fallback: string) => {
    let message = fallback;
    if (error && typeof error === "object" && "context" in error && error.context) {
      try {
        const parsed = await (error.context as Response).json();
        message = parsed?.error || parsed?.message || message;
      } catch {
        // Keep the fallback when the function response is not JSON.
      }
    }
    return message;
  };

  const handleSendPhoneOtp = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setOtpError("Enter a valid international phone number first.");
      return;
    }

    setIsSendingOtp(true);
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("request-phone-change-otp", {
        body: { phone },
      });
      if (error || data?.error) {
        setOtpError(data?.error || (await readFunctionError(error, "Failed to send verification code.")));
        return;
      }
      setOtpSentTo(phone);
      setOtpCode("");
      setOtpCooldownUntil(Date.now() + 60 * 1000);
    } catch {
      setOtpError("Failed to send verification code. Please try again.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (otpCode.length !== 6 || !otpSentTo) return;

    setIsVerifyingOtp(true);
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("confirm-phone-change", {
        body: { phone: otpSentTo, otp: otpCode },
      });
      if (error || data?.error) {
        setOtpError(data?.error || (await readFunctionError(error, "Invalid or expired code.")));
        return;
      }
      setPhoneVerifiedFor(otpSentTo);
      setOtpSentTo(null);
      setOtpCode("");
    } catch {
      setOtpError("Invalid or expired code. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !phoneIsVerified) {
      toast({
        title: "Missing information",
        description: "First name, last name, and a verified phone number are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName,
          phone: phone.trim(),
        },
      });
      if (authError) throw authError;

      if (user?.id) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              user_id: user.id,
              full_name: fullName,
              phone: phone.trim(),
            },
            { onConflict: "user_id" },
          );
        if (profileError) throw profileError;
      }

      await supabase.auth.refreshSession();
      await refreshAuthUser();
      await refreshProfile();
      toast({
        title: "Profile completed",
        description: "Your account details have been updated.",
      });
      navigate("/onboarding", { replace: true });
    } catch (error) {
      console.error("complete signup failed", error);
      toast({
        title: "Failed to complete signup",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthLayout title="Complete your signup" subtitle="We need a few more details before you continue to onboarding.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthInput
            label="First name"
            type="text"
            placeholder="First name"
            icon={<User size={18} />}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <AuthInput
            label="Last name"
            type="text"
            placeholder="Last name"
            icon={<User size={18} />}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        <AuthInput label="Email" type="email" placeholder="Email" icon={<Mail size={18} />} value={email} onChange={() => {}} disabled />

        <AuthPhoneInput
          label="Phone number"
          value={phone}
          onChange={handlePhoneChange}
          disabled={isSaving || phoneIsVerified}
        />

        {!phoneIsVerified && phone && (
          <div className="space-y-2 -mt-2">
            {otpSentTo === phone ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    Enter verification code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    disabled={isSaving || isVerifyingOtp}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest"
                  />
                </div>
                <AuthButton
                  type="button"
                  variant="outline"
                  className="h-11 w-auto shrink-0 px-4"
                  disabled={isVerifyingOtp || otpCode.length !== 6 || isSaving}
                  isLoading={isVerifyingOtp}
                  onClick={handleVerifyPhoneOtp}
                >
                  Verify
                </AuthButton>
              </div>
            ) : (
              <AuthButton
                type="button"
                variant="outline"
                className="h-9 w-auto px-4 text-sm"
                disabled={
                  isSendingOtp ||
                  isSaving ||
                  isCheckingPhoneVerification ||
                  !/^\+[1-9]\d{7,14}$/.test(phone) ||
                  otpCooldownSecondsLeft > 0
                }
                isLoading={isSendingOtp}
                onClick={handleSendPhoneOtp}
              >
                {otpCooldownSecondsLeft > 0
                  ? `Resend code in ${otpCooldownSecondsLeft}s`
                  : "Send verification code"}
              </AuthButton>
            )}
            {otpError && <p className="text-sm text-destructive">{otpError}</p>}
            {otpSentTo === phone && !otpError && (
              <p className="text-xs text-muted-foreground">
                Code sent to {phone}. Enter it above to verify this number.
              </p>
            )}
          </div>
        )}

        {phoneIsVerified && <p className="text-sm text-success -mt-2">Phone number verified</p>}

        <AuthButton
          type="submit"
          isLoading={isSaving}
          disabled={
            isCheckingPhoneVerification ||
            !firstName.trim() ||
            !lastName.trim() ||
            !phone.trim() ||
            !phoneIsVerified
          }
        >
          Continue to onboarding
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
