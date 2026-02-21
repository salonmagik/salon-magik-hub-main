import { forwardRef } from "react";
import { PhoneInput, PhoneInputProps } from "@ui/phone-input";
import { cn } from "@shared/utils";
import { PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import { useMarketCountries } from "@/hooks/useMarketCountries";

interface AuthPhoneInputProps extends Omit<PhoneInputProps, "hasError"> {
  label: string;
  error?: string;
}

export const AuthPhoneInput = forwardRef<HTMLInputElement, AuthPhoneInputProps>(
  ({ label, error, className, ...props }, ref) => {
    const { data: marketCountries } = useMarketCountries();
    const allowedCountryCodes =
      props.allowedCountryCodes ?? (marketCountries ?? PRODUCT_LIVE_COUNTRIES).map((country) => country.code);

    return (
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
        <PhoneInput
          ref={ref}
          hasError={!!error}
          className={cn(className)}
          allowedCountryCodes={allowedCountryCodes}
          {...props}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

AuthPhoneInput.displayName = "AuthPhoneInput";
