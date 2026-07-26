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
import type { DeliveryAddress } from "@/hooks";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

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
}

export function BookerInfoStep({
  info,
  onChange,
  requiresDeliveryAddress = false,
  deliveryCountryCode,
  emailStage = "details",
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Your Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {emailStage === "details"
            ? "Please provide your contact details for booking confirmation"
            : "Start with your email so we can check for saved details."}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Email *</Label>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>First Name *</Label>
          <Input
            value={info.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
            placeholder="John"
            disabled={hasExistingAccount}
          />
        </div>
        <div className="space-y-2">
          <Label>Last Name *</Label>
          <Input
            value={info.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
            placeholder="Doe"
            disabled={hasExistingAccount}
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
          disabled={hasExistingAccount}
        />
      </div>

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
