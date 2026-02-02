import { forwardRef } from "react";
import { PhoneInput, PhoneInputProps } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";

interface AuthPhoneInputProps extends Omit<PhoneInputProps, "hasError"> {
  label: string;
  error?: string;
}

export const AuthPhoneInput = forwardRef<HTMLInputElement, AuthPhoneInputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
        <PhoneInput
          ref={ref}
          hasError={!!error}
          className={cn(className)}
          {...props}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

AuthPhoneInput.displayName = "AuthPhoneInput";
