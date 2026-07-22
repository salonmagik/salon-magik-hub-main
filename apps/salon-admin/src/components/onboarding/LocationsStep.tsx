import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { MapPin, Plus, Trash2, Star } from "lucide-react";
import { cn } from "@shared/utils";
import { useMarketCountries } from "@/hooks/useMarketCountries";

export interface LocationInfo {
  id: string;
  name: string;
  city: string;
  address: string;
  country: string;
  timezone: string;
  openingTime: string;
  closingTime: string;
  openingDays: string[];
  isDefault: boolean;
}

export interface LocationsConfig {
  sameCountry: boolean;
  sameName: boolean;
  sameHours: boolean;
  locations: LocationInfo[];
}

interface LocationsStepProps {
  config: LocationsConfig;
  businessName: string;
  defaultCountry: string;
  defaultTimezone: string;
  defaultOpeningTime: string;
  defaultClosingTime: string;
  defaultOpeningDays: string[];
  maxLocations?: number;
  onChange: (config: LocationsConfig) => void;
}

const MARKET_TIMEZONES: Record<string, string> = {
  GH: "Africa/Accra",
  NG: "Africa/Lagos",
};

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return { value: `${hour}:00:00`, label: `${hour}:00` };
});

const DAYS_OF_WEEK = [
  { id: "monday", label: "M" },
  { id: "tuesday", label: "T" },
  { id: "wednesday", label: "W" },
  { id: "thursday", label: "T" },
  { id: "friday", label: "F" },
  { id: "saturday", label: "S" },
  { id: "sunday", label: "S" },
];

export function LocationsStep({
  config,
  businessName,
  defaultCountry,
  defaultTimezone,
  defaultOpeningTime,
  defaultClosingTime,
  defaultOpeningDays,
  maxLocations,
  onChange,
}: LocationsStepProps) {
  const { data: marketCountries = [] } = useMarketCountries();
  const resolvedMaxLocations = Math.max(1, maxLocations ?? Number.MAX_SAFE_INTEGER);
  const canAddMoreLocations = config.locations.length < resolvedMaxLocations;

  const addLocation = () => {
    if (!canAddMoreLocations) return;
    const newLocation: LocationInfo = {
      id: crypto.randomUUID(),
      name: config.sameName ? businessName : "",
      city: "",
      address: "",
      country: config.sameCountry ? defaultCountry : "",
      timezone: config.sameCountry ? defaultTimezone : "",
      openingTime: config.sameHours ? defaultOpeningTime : "09:00:00",
      closingTime: config.sameHours ? defaultClosingTime : "18:00:00",
      openingDays: config.sameHours ? defaultOpeningDays : ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
      isDefault: config.locations.length === 0,
    };
    onChange({ ...config, locations: [...config.locations, newLocation] });
  };

  const removeLocation = (id: string) => {
    const newLocations = config.locations.filter((l) => l.id !== id);
    // If we removed the default, make the first one default
    if (newLocations.length > 0 && !newLocations.some((l) => l.isDefault)) {
      newLocations[0].isDefault = true;
    }
    onChange({ ...config, locations: newLocations });
  };

  const updateLocation = (id: string, updates: Partial<LocationInfo>) => {
    const newLocations = config.locations.map((l) =>
      l.id === id ? { ...l, ...updates } : l
    );
    onChange({ ...config, locations: newLocations });
  };

  const setDefaultLocation = (id: string) => {
    const newLocations = config.locations.map((l) => ({
      ...l,
      isDefault: l.id === id,
    }));
    onChange({ ...config, locations: newLocations });
  };

  const toggleDay = (locationId: string, day: string) => {
    const location = config.locations.find((l) => l.id === locationId);
    if (!location) return;
    
    const newDays = location.openingDays.includes(day)
      ? location.openingDays.filter((d) => d !== day)
      : [...location.openingDays, day];
    updateLocation(locationId, { openingDays: newDays });
  };

  const handleToggleChange = (field: "sameCountry" | "sameName" | "sameHours", value: boolean) => {
    const updates: Partial<LocationsConfig> = { [field]: value };
    
    // When toggling on, update all locations with the default values
    if (value) {
      updates.locations = config.locations.map((loc) => {
        const locationUpdates: Partial<LocationInfo> = {};
        if (field === "sameCountry") {
          locationUpdates.country = defaultCountry;
          locationUpdates.timezone = defaultTimezone;
        }
        if (field === "sameName") {
          locationUpdates.name = businessName;
        }
        if (field === "sameHours") {
          locationUpdates.openingTime = defaultOpeningTime;
          locationUpdates.closingTime = defaultClosingTime;
          locationUpdates.openingDays = defaultOpeningDays;
        }
        return { ...loc, ...locationUpdates };
      });
    }
    
    onChange({ ...config, ...updates });
  };

  return (
    <div className="p-7">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-[#2E1F4E]">
          <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
          Locations
        </div>
        <h2 className="font-serif text-[24px] font-medium leading-snug tracking-[-0.3px] text-gray-900">
          Your branches
        </h2>
        <p className="mt-1.5 text-[14px] text-black/45">
          Add all your salon branches. You can add more later.
        </p>
      </div>

      <div className="space-y-4">
        {/* Toggle options */}
        <div className="space-y-3 rounded-[12px] bg-black/[0.03] p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sameCountry" className="cursor-pointer">
              All branches in the same country
            </Label>
            <Switch
              id="sameCountry"
              checked={config.sameCountry}
              onCheckedChange={(v) => handleToggleChange("sameCountry", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sameName" className="cursor-pointer">
              All branches share the business name
            </Label>
            <Switch
              id="sameName"
              checked={config.sameName}
              onCheckedChange={(v) => handleToggleChange("sameName", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sameHours" className="cursor-pointer">
              All branches have the same hours
            </Label>
            <Switch
              id="sameHours"
              checked={config.sameHours}
              onCheckedChange={(v) => handleToggleChange("sameHours", v)}
            />
          </div>
        </div>

        {/* Location cards */}
        <div className="space-y-3">
          {config.locations.map((location, index) => (
            <div
              key={location.id}
              className={cn(
                "border rounded-lg p-4 space-y-3",
                location.isDefault && "border-primary bg-primary/5"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Branch {index + 1}</span>
                  {location.isDefault && (
                    <span className="text-xs text-primary flex items-center gap-1">
                      <Star className="w-3 h-3 fill-primary" /> Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!location.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefaultLocation(location.id)}
                      className="rounded-[6px] px-2.5 py-1 text-[12px] text-black/45 transition-colors hover:bg-black/[0.04] hover:text-black/70"
                    >
                      Set as default
                    </button>
                  )}
                  {config.locations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLocation(location.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-red-400 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="Branch name"
                    value={location.name}
                    onChange={(e) => updateLocation(location.id, { name: e.target.value })}
                    disabled={config.sameName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City *</Label>
                  <Input
                    placeholder="City"
                    value={location.city}
                    onChange={(e) => updateLocation(location.id, { city: e.target.value })}
                  />
                </div>
              </div>

              {!config.sameCountry && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Country</Label>
                  <Select
                    value={location.country}
                    onValueChange={(v) => {
                      const timezone = MARKET_TIMEZONES[v] ?? location.timezone;
                      updateLocation(location.id, {
                        country: v,
                        timezone,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {marketCountries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Address</Label>
                <Input
                  placeholder="Street address"
                  value={location.address}
                  onChange={(e) => updateLocation(location.id, { address: e.target.value })}
                />
              </div>

              {!config.sameHours && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Opens</Label>
                      <Select
                        value={location.openingTime}
                        onValueChange={(v) => updateLocation(location.id, { openingTime: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Closes</Label>
                      <Select
                        value={location.closingTime}
                        onValueChange={(v) => updateLocation(location.id, { closingTime: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Open days</Label>
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(location.id, day.id)}
                          className={cn(
                            "w-8 h-8 rounded-full text-xs font-medium transition-colors",
                            location.openingDays.includes(day.id)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLocation}
          disabled={!canAddMoreLocations}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-black/[0.12] py-3 text-[13.5px] font-medium text-black/45 transition-colors hover:border-black/20 hover:text-black/65 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {canAddMoreLocations ? "Add location" : "Location limit reached"}
        </button>
        <p className="text-center text-[12px] text-black/35">
          Configured {config.locations.length} of {resolvedMaxLocations} locations.
        </p>
      </div>
    </div>
  );
}
