import { useState } from "react";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Crown } from "lucide-react";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";

export interface OwnerInviteInfo {
  name: string;
  email: string;
  phone: string;
}

interface OwnerInviteStepProps {
  ownerInfo: OwnerInviteInfo;
  onChange: (info: OwnerInviteInfo) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OwnerInviteStep({ ownerInfo, onChange }: OwnerInviteStepProps) {
  const [touched, setTouched] = useState({ name: false, email: false });

  const handleChange = (field: keyof OwnerInviteInfo, value: string) => {
    onChange({ ...ownerInfo, [field]: value });
  };

  const nameError = touched.name && !ownerInfo.name.trim() ? "Owner's name is required" : null;
  const emailError = touched.email
    ? !ownerInfo.email.trim()
      ? "Owner's email is required"
      : !EMAIL_RE.test(ownerInfo.email.trim())
        ? "Enter a valid email address"
        : null
    : null;

  return (
    <div className="p-7">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-[#2E1F4E]">
          <Crown className="h-3.5 w-3.5" strokeWidth={2} />
          Owner invite
        </div>
        <h2 className="text-[24px] font-medium leading-snug tracking-[-0.3px] text-gray-900">
          Invite the salon owner
        </h2>
        <p className="mt-1.5 text-[14px] text-black/45">
          Since you're not the owner, we'll send them an invitation to complete billing setup.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ownerName" className="text-[13.5px] font-medium text-gray-700">
            Owner's name *
          </Label>
          <Input
            id="ownerName"
            placeholder="Jane Smith"
            value={ownerInfo.name}
            onChange={(e) => handleChange("name", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            className={nameError ? "border-red-400 focus-visible:ring-red-300" : ""}
          />
          {nameError && <p className="text-[12px] text-red-500">{nameError}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ownerEmail" className="text-[13.5px] font-medium text-gray-700">
            Owner's email *
          </Label>
          <Input
            id="ownerEmail"
            type="email"
            placeholder="owner@salon.com"
            value={ownerInfo.email}
            onChange={(e) => handleChange("email", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            className={emailError ? "border-red-400 focus-visible:ring-red-300" : ""}
          />
          {emailError && <p className="text-[12px] text-red-500">{emailError}</p>}
        </div>

        <AuthPhoneInput
          label="Owner's phone (optional)"
          value={ownerInfo.phone}
          onChange={(value) => handleChange("phone", value)}
        />

        <div className="rounded-[10px] bg-black/[0.03] px-4 py-3 text-[13px] text-black/50">
          We'll send an invitation to the owner's email. They can complete the setup and grant you
          access to financial features.
        </div>
      </div>
    </div>
  );
}
