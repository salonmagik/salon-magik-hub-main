import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { Crown } from "lucide-react";

export interface OwnerInviteInfo {
  name: string;
  email: string;
  phone: string;
}

interface OwnerInviteStepProps {
  ownerInfo: OwnerInviteInfo;
  onChange: (info: OwnerInviteInfo) => void;
}

export function OwnerInviteStep({ ownerInfo, onChange }: OwnerInviteStepProps) {
  const handleChange = (field: keyof OwnerInviteInfo, value: string) => {
    onChange({ ...ownerInfo, [field]: value });
  };

  return (
    <>
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <Crown className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Invite the salon owner</CardTitle>
        <CardDescription>
          Since you're not the owner, we'll need to invite them to complete the setup. 
          They'll have access to billing and financial settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ownerName">Owner's name *</Label>
          <Input
            id="ownerName"
            placeholder="Jane Smith"
            value={ownerInfo.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ownerEmail">Owner's email *</Label>
          <Input
            id="ownerEmail"
            type="email"
            placeholder="owner@salon.com"
            value={ownerInfo.email}
            onChange={(e) => handleChange("email", e.target.value)}
          />
        </div>

        <AuthPhoneInput
          label="Owner's phone (optional)"
          value={ownerInfo.phone}
          onChange={(value) => handleChange("phone", value)}
        />

        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
          We'll send an invitation to the owner's email. They can complete the setup 
          and grant you access to financial features.
        </p>
      </CardContent>
    </>
  );
}
