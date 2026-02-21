import { CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Building2 } from "lucide-react";
import { useMarketCountries } from "@/hooks/useMarketCountries";

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
    <>
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Business details</CardTitle>
        <CardDescription>
          Tell us about your salon so we can set everything up correctly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="businessName">Salon name *</Label>
          <Input
            id="businessName"
            placeholder="e.g., Glamour Hair Studio"
            value={businessInfo.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="country">Country *</Label>
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
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              placeholder="e.g., Lagos"
              value={businessInfo.city}
              onChange={(e) => handleChange("city", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address *</Label>
          <Input
            id="address"
            placeholder="e.g., 123 Victoria Island"
            value={businessInfo.address}
            onChange={(e) => handleChange("address", e.target.value)}
          />
        </div>

        {businessInfo.currency && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
            <span>Currency: <strong>{businessInfo.currency}</strong></span>
            <span>Timezone: <strong>{businessInfo.timezone}</strong></span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Opening time</Label>
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
          <div className="space-y-2">
            <Label>Closing time</Label>
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

        <div className="space-y-2">
          <Label>Days open *</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  businessInfo.openingDays.includes(day.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-muted"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </>
  );
}
