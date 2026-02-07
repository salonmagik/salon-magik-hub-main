import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";

export interface BookerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
}

interface BookerInfoStepProps {
  info: BookerInfo;
  onChange: (info: BookerInfo) => void;
}

export function BookerInfoStep({ info, onChange }: BookerInfoStepProps) {
  const updateField = (field: keyof BookerInfo, value: string) => {
    onChange({ ...info, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Your Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please provide your contact details for booking confirmation
        </p>
      </div>

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
        <Label>Email *</Label>
        <Input
          type="email"
          value={info.email}
          onChange={(e) => updateField("email", e.target.value)}
          placeholder="john@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label>Phone</Label>
        <PhoneInput
          value={info.phone}
          onChange={(value) => updateField("phone", value)}
          placeholder="Phone number"
          defaultCountry="NG"
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
    </div>
  );
}
