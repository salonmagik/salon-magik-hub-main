import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { useMarketCountries } from "@/hooks/useMarketCountries";
import { cn } from "@shared/utils";

export interface BusinessInfo {
  name: string;
  country: string;
  currency: string;
  city: string;
  address: string;
  timezone: string;
  openingTime: string;
  closingTime: string;
  openingDays: string[];
}

interface BusinessStepProps {
  businessInfo: BusinessInfo;
  onChange: (info: BusinessInfo) => void;
}

const MARKET_DEFAULTS: Record<string, { currency: string; timezone: string }> = {
  GH: { currency: "GHS", timezone: "Africa/Accra" },
  NG: { currency: "NGN", timezone: "Africa/Lagos" },
};

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return { value: `${hour}:00:00`, label: `${hour}:00` };
});

const DAYS_OF_WEEK = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

export function BusinessStep({ businessInfo, onChange }: BusinessStepProps) {
  const { data: marketCountries = [] } = useMarketCountries();

  const handleChange = (field: keyof BusinessInfo, value: string | string[]) => {
    onChange({ ...businessInfo, [field]: value });
  };

  const handleCountryChange = (countryCode: string) => {
    const defaults = MARKET_DEFAULTS[countryCode] ?? { currency: "USD", timezone: "UTC" };
    onChange({
      ...businessInfo,
      country: countryCode,
      currency: defaults.currency,
      timezone: defaults.timezone,
    });
  };

  const toggleDay = (day: string) => {
    const newDays = businessInfo.openingDays.includes(day)
      ? businessInfo.openingDays.filter((d) => d !== day)
      : [...businessInfo.openingDays, day];
    handleChange("openingDays", newDays);
  };

  return (
    <div className="p-7">
      <div className="mb-6">
        <h2 className="font-serif text-[22px] font-medium leading-snug tracking-[-0.2px] text-gray-900">
          Business details
        </h2>
        <p className="mt-1 text-[14px] text-black/45">
          Tell us about your salon so we can set everything up correctly.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="businessName" className="text-[13.5px] font-medium text-gray-700">
            Salon name *
          </Label>
          <Input
            id="businessName"
            placeholder="e.g., Glamour Hair Studio"
            value={businessInfo.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="country" className="text-[13.5px] font-medium text-gray-700">
              Country *
            </Label>
            <Select value={businessInfo.country} onValueChange={handleCountryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {marketCountries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city" className="text-[13.5px] font-medium text-gray-700">
              City *
            </Label>
            <Input
              id="city"
              placeholder="e.g., Lagos"
              value={businessInfo.city}
              onChange={(e) => handleChange("city", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address" className="text-[13.5px] font-medium text-gray-700">
            Address
          </Label>
          <Input
            id="address"
            placeholder="e.g., 123 Victoria Island"
            value={businessInfo.address}
            onChange={(e) => handleChange("address", e.target.value)}
          />
        </div>

        {businessInfo.currency && (
          <div className="flex items-center gap-4 rounded-[10px] bg-black/[0.03] px-4 py-3 text-[13px] text-black/50">
            <span>
              Currency: <strong className="text-black/70">{businessInfo.currency}</strong>
            </span>
            <span>
              Timezone: <strong className="text-black/70">{businessInfo.timezone}</strong>
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[13.5px] font-medium text-gray-700">Opening time</Label>
            <Select
              value={businessInfo.openingTime}
              onValueChange={(v) => handleChange("openingTime", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time.value} value={time.value}>
                    {time.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13.5px] font-medium text-gray-700">Closing time</Label>
            <Select
              value={businessInfo.closingTime}
              onValueChange={(v) => handleChange("closingTime", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time.value} value={time.value}>
                    {time.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13.5px] font-medium text-gray-700">Days open *</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  businessInfo.openingDays.includes(day.id)
                    ? "border-[#2E1F4E] bg-[#2E1F4E] text-white"
                    : "border-black/[0.1] bg-white text-black/60 hover:border-black/20",
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
