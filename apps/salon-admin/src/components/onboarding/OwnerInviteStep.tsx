import { Input } from "@ui/input";
import { Label } from "@ui/label";
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

export function OwnerInviteStep({ ownerInfo, onChange }: OwnerInviteStepProps) {
  const handleChange = (field: keyof OwnerInviteInfo, value: string) => {
    onChange({ ...ownerInfo, [field]: value });
  };

  return (
    <div className="p-7">
      <div className="mb-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#2E1F4E]/10 text-[22px]">
          👑
        </div>
        <h2 className="font-serif text-[22px] font-medium leading-snug tracking-[-0.2px] text-gray-900">
          Invite the salon owner
        </h2>
        <p className="mt-1 text-[14px] text-black/45">
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
          />
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
          />
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
