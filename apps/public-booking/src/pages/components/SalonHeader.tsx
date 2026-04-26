import { MapPin, Phone } from "lucide-react";
import { Badge } from "@ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { getCountryByCode } from "@shared/countries";
import { BannerCarousel } from "@/components/BannerCarousel";
import type { PublicTenant, PublicLocation } from "@/hooks";

interface SalonHeaderProps {
  salon: PublicTenant;
  themeKey?: string | null;
  locations: PublicLocation[];
  supportedCountryCodes?: string[];
  selectedCountryCode?: string | null;
  onCountryChange?: (countryCode: string) => void;
}

export function SalonHeader({
  salon,
  themeKey,
  locations,
  supportedCountryCodes = [],
  selectedCountryCode,
  onCountryChange,
}: SalonHeaderProps) {
  const primaryLocation = locations[0];
  const showCountryToggle = supportedCountryCodes.length > 1;
  const isEcommerceTheme = themeKey === "ecommerce";

  if (isEcommerceTheme) {
    return (
      <div className="space-y-5">
        <div className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
          {salon.banner_urls && salon.banner_urls.length > 0 ? (
            <BannerCarousel
              bannerUrls={salon.banner_urls}
              salonName={salon.name}
              autoPlayInterval={30000}
              variant="ecommerce"
            />
          ) : (
            <div className="relative h-64 bg-[linear-gradient(135deg,#fbf3e2_0%,#ead8b9_100%)]">
              <div className="absolute inset-0 bg-gradient-to-r from-[#1f1b17]/75 via-[#1f1b17]/25 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6 text-white sm:p-8">
                <p className="text-xs uppercase tracking-[0.22em] text-white/75">Bookings + storefront</p>
                <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{salon.name}</h1>
              </div>
            </div>
          )}

          <div className="grid gap-5 p-5 lg:grid-cols-[1.5fr_0.85fr] lg:p-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-stone-900 text-white hover:bg-stone-900">Shopify-style theme</Badge>
                {salon.booking_status_message && <Badge variant="secondary">Booking notice active</Badge>}
              </div>

              <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">{salon.name}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                  A richer storefront-style booking page for services, packages, vouchers, and retail add-ons.
                </p>
              </div>

              {locations.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {locations.map((location) => (
                    <Badge key={location.id} variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                      <MapPin className="h-3 w-3" />
                      {location.name}, {location.city}
                    </Badge>
                  ))}
                </div>
              )}

              {salon.show_contact_on_booking && (
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {salon.contact_phone && (
                    <a href={`tel:${salon.contact_phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                      <Phone className="h-4 w-4" />
                      {salon.contact_phone}
                    </a>
                  )}
                  {primaryLocation?.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {primaryLocation.address}, {primaryLocation.city}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-[24px] border border-stone-200 bg-[#fcfaf6] p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">Shopping context</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Customers can browse bookable services, bundles, and retail items in one flow.
                </p>
              </div>

              {showCountryToggle && onCountryChange && (
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Country</span>
                  <Select value={selectedCountryCode || undefined} onValueChange={onCountryChange}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {supportedCountryCodes.map((code) => {
                        const country = getCountryByCode(code);
                        return (
                          <SelectItem key={code} value={code}>
                            {country ? `${country.flag} ${country.name}` : code}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {salon.booking_status_message && (
                <div className="rounded-2xl border bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                  <p className="mt-2 text-sm text-muted-foreground">{salon.booking_status_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Banner Carousel */}
      {salon.banner_urls && salon.banner_urls.length > 0 ? (
        <BannerCarousel 
          bannerUrls={salon.banner_urls} 
          salonName={salon.name}
          autoPlayInterval={30000}
        />
      ) : (
        /* Salon Info (if no banner) */
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">{salon.name}</h1>
        </div>
      )}

      {showCountryToggle && onCountryChange && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Country:</span>
          <Select value={selectedCountryCode || undefined} onValueChange={onCountryChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {supportedCountryCodes.map((code) => {
                const country = getCountryByCode(code);
                return (
                  <SelectItem key={code} value={code}>
                    {country ? `${country.flag} ${country.name}` : code}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Location Tags */}
      {locations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((location) => (
            <Badge key={location.id} variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {location.name}, {location.city}
            </Badge>
          ))}
        </div>
      )}

      {/* Contact Information */}
      {salon.show_contact_on_booking && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {salon.contact_phone && (
            <a 
              href={`tel:${salon.contact_phone}`}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Phone className="h-4 w-4" />
              {salon.contact_phone}
            </a>
          )}
          {primaryLocation?.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {primaryLocation.address}, {primaryLocation.city}
            </div>
          )}
        </div>
      )}

      {/* Status Message */}
      {salon.booking_status_message && (
        <div 
          className="p-4 rounded-lg bg-muted"
          style={{ 
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: salon.brand_color || "#2563EB" 
          }}
        >
          <p className="text-sm text-muted-foreground">{salon.booking_status_message}</p>
        </div>
      )}
    </div>
  );
}
