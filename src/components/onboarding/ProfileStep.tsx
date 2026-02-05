import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { User } from "lucide-react";

export interface ProfileInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  useSignInEmail: boolean;
  useSignInPhone: boolean;
}

interface ProfileStepProps {
  profileInfo: ProfileInfo;
  signInEmail: string | null;
  signInPhone: string | null;
  onChange: (info: ProfileInfo) => void;
}

export function ProfileStep({ profileInfo, signInEmail, signInPhone, onChange }: ProfileStepProps) {
  const handleChange = (field: keyof ProfileInfo, value: string | boolean) => {
    const updated = { ...profileInfo, [field]: value };
    
    // Auto-populate when toggling "same as sign-in"
    if (field === "useSignInEmail" && value === true && signInEmail) {
      updated.email = signInEmail;
    }
    if (field === "useSignInPhone" && value === true && signInPhone) {
      updated.phone = signInPhone;
    }
    
    onChange(updated);
  };

  return (
    <>
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <User className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>
          Tell us a bit about yourself so we can personalize your experience.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name *</Label>
            <Input
              id="firstName"
              placeholder="John"
              value={profileInfo.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name *</Label>
            <Input
              id="lastName"
              placeholder="Doe"
              value={profileInfo.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="email">Email *</Label>
            {signInEmail && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="useSignInEmail"
                  checked={profileInfo.useSignInEmail}
                  onCheckedChange={(checked) => handleChange("useSignInEmail", checked === true)}
                />
                <label htmlFor="useSignInEmail" className="text-xs text-muted-foreground cursor-pointer">
                  Same as sign-in
                </label>
              </div>
            )}
          </div>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            value={profileInfo.email}
            onChange={(e) => handleChange("email", e.target.value)}
            disabled={profileInfo.useSignInEmail}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Phone number *</span>
            {signInPhone && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="useSignInPhone"
                  checked={profileInfo.useSignInPhone}
                  onCheckedChange={(checked) => handleChange("useSignInPhone", checked === true)}
                />
                <label htmlFor="useSignInPhone" className="text-xs text-muted-foreground cursor-pointer">
                  Same as sign-in
                </label>
              </div>
            )}
          </div>
          <AuthPhoneInput
            label=""
            value={profileInfo.phone}
            onChange={(value) => handleChange("phone", value)}
            disabled={profileInfo.useSignInPhone}
          />
        </div>
      </CardContent>
    </>
  );
}
