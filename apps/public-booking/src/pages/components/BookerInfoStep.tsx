import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { PhoneInput } from "@ui/phone-input";
import { PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import { getCitiesForCountryRegion, getCountryByCode, getRegionsForCountry } from "@shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { useMarketCountries } from "@/hooks/useMarketCountries";
import type { DeliveryAddress } from "@/hooks";

export interface BookerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  deliveryAddress: DeliveryAddress;
}

interface BookerInfoStepProps {
  info: BookerInfo;
  onChange: (info: BookerInfo) => void;
  requiresDeliveryAddress?: boolean;
  deliveryCountryCode?: string | null;
}

export function BookerInfoStep({
  info,
  onChange,
  requiresDeliveryAddress = false,
  deliveryCountryCode,
}: BookerInfoStepProps) {
  const { data: marketCountries } = useMarketCountries();
  const selectableCountries = marketCountries ?? PRODUCT_LIVE_COUNTRIES;
  const inferredCountryCode = deliveryCountryCode?.toUpperCase() || null;
  const inferredCountryName = inferredCountryCode ? getCountryByCode(inferredCountryCode)?.name || inferredCountryCode : "";
  const regionOptions = getRegionsForCountry(inferredCountryCode);
  const cityOptions = getCitiesForCountryRegion(inferredCountryCode, info.deliveryAddress.state);

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
          allowedCountryCodes={selectableCountries.map((country) => country.code)}
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

      {requiresDeliveryAddress && (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <h4 className="font-medium">Delivery Address</h4>
            <p className="text-sm text-muted-foreground">
              We need this for the products marked for delivery.
            </p>
          </div>

          {inferredCountryName && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Delivery country: <span className="font-medium text-foreground">{inferredCountryName}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Address Line 1 *</Label>
            <Input
              value={info.deliveryAddress.line1}
              onChange={(e) =>
                onChange({
                  ...info,
                  deliveryAddress: { ...info.deliveryAddress, line1: e.target.value },
                })
              }
              placeholder="Street address"
            />
          </div>

          <div className="space-y-2">
            <Label>Address Line 2</Label>
            <Input
              value={info.deliveryAddress.line2 || ""}
              onChange={(e) =>
                onChange({
                  ...info,
                  deliveryAddress: { ...info.deliveryAddress, line2: e.target.value },
                })
              }
              placeholder="Apartment, suite, landmark"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City *</Label>
              <Select
                value={info.deliveryAddress.city || ""}
                onValueChange={(value) =>
                  onChange({
                    ...info,
                    deliveryAddress: {
                      ...info.deliveryAddress,
                      city: value,
                      country: inferredCountryName || info.deliveryAddress.country,
                    },
                  })
                }
                disabled={!info.deliveryAddress.state || cityOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!info.deliveryAddress.state ? "Select state first" : "Select city"} />
                </SelectTrigger>
                <SelectContent>
                  {cityOptions.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>State / Region *</Label>
              <Select
                value={info.deliveryAddress.state || ""}
                onValueChange={(value) =>
                  onChange({
                    ...info,
                    deliveryAddress: {
                      ...info.deliveryAddress,
                      state: value,
                      city: "",
                      country: inferredCountryName || info.deliveryAddress.country,
                    },
                  })
                }
                disabled={regionOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state / region" />
                </SelectTrigger>
                <SelectContent>
                  {regionOptions.map((region) => (
                    <SelectItem key={region.code} value={region.name}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-2">
              <Label>Postal Code</Label>
              <Input
                value={info.deliveryAddress.postalCode || ""}
                onChange={(e) =>
                  onChange({
                    ...info,
                    deliveryAddress: { ...info.deliveryAddress, postalCode: e.target.value },
                  })
                }
                placeholder="Postal code"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Delivery Notes</Label>
            <Textarea
              value={info.deliveryAddress.deliveryNotes || ""}
              onChange={(e) =>
                onChange({
                  ...info,
                  deliveryAddress: { ...info.deliveryAddress, deliveryNotes: e.target.value },
                })
              }
              placeholder="Landmarks, gate code, or delivery instructions"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}
