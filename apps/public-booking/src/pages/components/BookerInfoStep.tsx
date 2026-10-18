import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { PhoneInput } from "@ui/phone-input";
import { Button } from "@ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import { getCountryByCode, PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import {
  getCitiesForCountryRegion,
  getRegionsForCountry,
} from "@shared/address-geography";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { useMarketCountries } from "@/hooks/useMarketCountries";
import { validateE164Phone } from "@shared/validation";
import type { DeliveryAddress } from "@/hooks";
import { AlertTriangle, Check, Eye, EyeOff, Loader2, Lock, Mail, Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface BookerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  deliveryAddress: DeliveryAddress;
}

interface BookerInfoStepProps {
  info: BookerInfo;
  onChange: (info: BookerInfo) => void;
  requiresDeliveryAddress?: boolean;
  deliveryCountryCode?: string | null;
  emailStage?: "email" | "otp" | "password" | "details";
  /** True once this phone number is found registered to a different email — blocks continuing until resolved. */
  phoneEmailConflict?: boolean;
  password?: string;
  otpCode?: string;
  otpCountdown?: number;
  isProcessingEmail?: boolean;
  hasExistingAccount?: boolean;
  verificationError?: string;
  onEmailContinue?: () => void;
  onPasswordChange?: (value: string) => void;
  onPasswordSubmit?: () => void;
  onResetIdentity?: () => void;
  onOtpChange?: (value: string) => void;
  onOtpSubmit?: () => void;
  onOtpResend?: () => void;
  /** Fires whenever the in-place email edit (pencil → re-check) is open and unconfirmed, so the wizard can block "Continue" until it settles. */
  onEmailEditPendingChange?: (pending: boolean) => void;
}

export function BookerInfoStep({
  info,
  onChange,
  requiresDeliveryAddress = false,
  deliveryCountryCode,
  emailStage = "details",
  phoneEmailConflict = false,
  password = "",
  otpCode = "",
  otpCountdown = 0,
  isProcessingEmail = false,
  hasExistingAccount = false,
  verificationError = "",
  onEmailContinue,
  onPasswordChange,
  onPasswordSubmit,
  onResetIdentity,
  onOtpChange,
  onOtpSubmit,
  onOtpResend,
  onEmailEditPendingChange,
}: BookerInfoStepProps) {
  const { data: marketCountries } = useMarketCountries();
  const selectableCountries = marketCountries ?? PRODUCT_LIVE_COUNTRIES;
  const [showPassword, setShowPassword] = useState(false);
  const inferredCountryCode = deliveryCountryCode?.toUpperCase() || null;
  const inferredCountryName = inferredCountryCode ? getCountryByCode(inferredCountryCode)?.name || inferredCountryCode : "";
  const regionOptions = getRegionsForCountry(inferredCountryCode);
  const cityOptions = getCitiesForCountryRegion(inferredCountryCode, info.deliveryAddress.state);

  const updateField = (field: keyof BookerInfo, value: string) => {
    onChange({ ...info, [field]: value });
  };

  // Only relevant once we've reached the manual-entry form for someone who
  // doesn't already have an account (an existing account instead goes
  // through the OTP/password flow above, whose fields are already locked).
  // auth-resolve-identifier already confirmed no account exists for the
  // email they arrived with, so it starts locked without a second backend
  // round-trip -- clicking the pencil re-opens it, and "Check email" below
  // re-runs the SAME onEmailContinue/auth-resolve-identifier call used for
  // the very first email. If that now finds an account, emailStage moves to
  // "otp"/"password" (this whole block disappears, replaced by sign-in) --
  // so manually-typed name/phone are cleared defensively rather than risk
  // them leaking back in if the user bails out of sign-in to a guest entry.
  const showCheckedEmailField = emailStage === "details" && !hasExistingAccount;
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailJustConfirmed, setEmailJustConfirmed] = useState(false);
  const wasProcessingEmailRef = useRef(false);
  // Snapshot of the email at the moment edit mode opened — "Check email"
  // only makes sense once they've actually changed it, not the instant they
  // click the pencil.
  const emailAtEditStartRef = useRef("");
  const emailHasBeenEdited = emailEditing && info.email.trim() !== emailAtEditStartRef.current.trim();

  useEffect(() => {
    const wasProcessing = wasProcessingEmailRef.current;
    wasProcessingEmailRef.current = isProcessingEmail;
    if (!(wasProcessing && !isProcessingEmail && emailEditing)) return;

    if (emailStage === "details") {
      setEmailJustConfirmed(true);
      const timer = setTimeout(() => {
        setEmailJustConfirmed(false);
        setEmailEditing(false);
      }, 2000);
      return () => clearTimeout(timer);
    }

    setEmailEditing(false);
    onChange({ ...info, firstName: "", lastName: "", phone: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessingEmail, emailEditing, emailStage]);

  // Block "Continue" on the wizard's own footer for as long as the email is
  // unlocked for editing but hasn't been re-confirmed yet (covers both "they
  // just clicked the pencil" and "they edited it and the check is running").
  useEffect(() => {
    onEmailEditPendingChange?.(showCheckedEmailField && emailEditing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCheckedEmailField, emailEditing]);

  const phoneValidation = validateE164Phone(info.phone);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-serif text-lg font-semibold mb-2">Your Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {emailStage === "details"
            ? "Please provide your contact details for booking confirmation"
            : "Start with your email so we can check for saved details."}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Email *</Label>
        {showCheckedEmailField ? (
          <>
            <div className="relative">
              <Input
                type="email"
                value={info.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="john@example.com"
                disabled={!emailEditing || isProcessingEmail}
                className="pr-10"
              />
              {emailEditing && isProcessingEmail && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {emailJustConfirmed && (
                <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />
              )}
              {!emailEditing && !emailJustConfirmed && (
                <button
                  type="button"
                  onClick={() => {
                    emailAtEditStartRef.current = info.email;
                    setEmailEditing(true);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Edit email"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {emailHasBeenEdited && !isProcessingEmail && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onEmailContinue}
                disabled={!info.email.trim()}
              >
                <Mail className="w-3.5 h-3.5 mr-1.5" />
                Check email
              </Button>
            )}
          </>
        ) : (
          <Input
            type="email"
            value={info.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="john@example.com"
            disabled={
              emailStage === "otp" ||
              emailStage === "password" ||
              isProcessingEmail ||
              (emailStage === "details" && hasExistingAccount)
            }
          />
        )}
      </div>

      {emailStage === "email" && (
        <Button
          type="button"
          onClick={onEmailContinue}
          disabled={isProcessingEmail || !info.email.trim()}
          className="w-full"
        >
          {isProcessingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
          Continue with Email
        </Button>
      )}

      {emailStage === "otp" && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Verify your email
            </div>
            <p className="text-sm text-muted-foreground">
              We found an existing account for this email. Enter the 8-digit code we sent so we can prefill your details.
            </p>
          </div>
          <InputOTP maxLength={8} value={otpCode} onChange={onOtpChange}>
            <InputOTPGroup>
              {Array.from({ length: 8 }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {verificationError && <p className="text-sm text-destructive">{verificationError}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={onOtpSubmit} disabled={isProcessingEmail || otpCode.length !== 8} className="flex-1">
              {isProcessingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Verify and Prefill
            </Button>
            <Button type="button" variant="outline" onClick={onOtpResend} disabled={isProcessingEmail || otpCountdown > 0}>
              {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend"}
            </Button>
          </div>
        </div>
      )}

      {emailStage === "password" && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <Lock className="w-4 h-4 text-primary" />
              Enter your password
            </div>
            <p className="text-sm text-muted-foreground">
              We found an existing Salon Magik account for this email. Sign in to prefill your saved details.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => onPasswordChange?.(e.target.value)}
                placeholder="Enter your password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {verificationError && <p className="text-sm text-destructive">{verificationError}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={onPasswordSubmit} disabled={isProcessingEmail || !password.trim()} className="flex-1">
              {isProcessingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Sign in and Prefill
            </Button>
            <Button type="button" variant="outline" onClick={onResetIdentity} disabled={isProcessingEmail}>
              Use another email
            </Button>
          </div>
        </div>
      )}

      {emailStage !== "details" && emailStage !== "password" && !hasExistingAccount && verificationError && (
        <p className="text-sm text-destructive">{verificationError}</p>
      )}

      {emailStage === "details" && (
        <>
      {!hasExistingAccount && (
        <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>First Name *</Label>
          <Input
            value={info.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
            placeholder="John"
          />
        </div>
        <div className="space-y-2">
          <Label>Last Name *</Label>
          <Input
            value={info.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
            placeholder="Doe"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Phone</Label>
        <PhoneInput
          value={info.phone}
          onChange={(value) => updateField("phone", value)}
          placeholder="Phone number"
          defaultCountry="NG"
          allowedCountryCodes={selectableCountries.map((country) => country.code)}
          hasError={!phoneValidation.isValid}
        />
        {!phoneValidation.isValid && (
          <p className="text-sm text-destructive">{phoneValidation.error}</p>
        )}
        {phoneEmailConflict && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              This phone number is already registered to a different email address. Double-check the number, or use the email already on file for it.
            </p>
          </div>
        )}
      </div>
      </>
      )}

      <div className="space-y-2">
        <Label>Notes for the salon</Label>
        <Textarea
          value={info.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          placeholder="Any special requests..."
          rows={3}
        />
      </div>

      {requiresDeliveryAddress && (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <h4 className="font-medium">Delivery Address</h4>
            <p className="text-sm text-muted-foreground">
              We need this for the products marked for delivery.
            </p>
          </div>

          {inferredCountryName && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Delivery country: <span className="font-medium text-foreground">{inferredCountryName}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Address Line 1 *</Label>
            <Input
              value={info.deliveryAddress.line1}
              onChange={(e) =>
                onChange({
                  ...info,
                  deliveryAddress: { ...info.deliveryAddress, line1: e.target.value },
                })
              }
              placeholder="Street address"
            />
          </div>

          <div className="space-y-2">
            <Label>Address Line 2</Label>
            <Input
              value={info.deliveryAddress.line2 || ""}
              onChange={(e) =>
                onChange({
                  ...info,
                  deliveryAddress: { ...info.deliveryAddress, line2: e.target.value },
                })
              }
              placeholder="Apartment, suite, landmark"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City *</Label>
              <Select
                value={info.deliveryAddress.city || ""}
                onValueChange={(value) =>
                  onChange({
                    ...info,
                    deliveryAddress: {
                      ...info.deliveryAddress,
                      city: value,
                      country: inferredCountryName || info.deliveryAddress.country,
                    },
                  })
                }
                disabled={!info.deliveryAddress.state || cityOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!info.deliveryAddress.state ? "Select state first" : "Select city"} />
                </SelectTrigger>
                <SelectContent>
                  {cityOptions.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>State / Region *</Label>
              <Select
                value={info.deliveryAddress.state || ""}
                onValueChange={(value) =>
                  onChange({
                    ...info,
                    deliveryAddress: {
                      ...info.deliveryAddress,
                      state: value,
                      city: "",
                      country: inferredCountryName || info.deliveryAddress.country,
                    },
                  })
                }
                disabled={regionOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state / region" />
                </SelectTrigger>
                <SelectContent>
                  {regionOptions.map((region) => (
                    <SelectItem key={region.code} value={region.name}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-2">
              <Label>Postal Code</Label>
              <Input
                value={info.deliveryAddress.postalCode || ""}
                onChange={(e) =>
                  onChange({
                    ...info,
                    deliveryAddress: { ...info.deliveryAddress, postalCode: e.target.value },
                  })
                }
                placeholder="Postal code"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Delivery Notes</Label>
            <Textarea
              value={info.deliveryAddress.deliveryNotes || ""}
              onChange={(e) =>
                onChange({
                  ...info,
                  deliveryAddress: { ...info.deliveryAddress, deliveryNotes: e.target.value },
                })
              }
              placeholder="Landmarks, gate code, or delivery instructions"
              rows={2}
            />
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
