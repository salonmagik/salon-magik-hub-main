import { MapPin, Phone, ChevronDown } from "lucide-react";
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
    const brandColor = salon.brand_color || "#111827";
    const bio = salon.booking_page_bio || "";

    const heroHeading = salon.hero_heading || salon.name;
    const heroTagline = salon.hero_tagline || (bio ? bio.split(/[.!,]/)[0] : "");
    const heroCTAPrimary = salon.hero_cta_primary || "Book Now";
    const heroCTASecondary = salon.hero_cta_secondary || "Our Services";

    const scrollToCatalog = () => {
      document.getElementById("ecom-catalog")?.scrollIntoView({ behavior: "smooth" });
    };

    return (
      <>
        {/* ── Editorial split hero ───────────────────────────── */}
        <section className="grid min-h-[88vh] lg:grid-cols-2">
          {/* Left: copy panel */}
          <div className="flex flex-col justify-center px-8 py-20 lg:px-16 xl:px-24">
            {/* Eyebrow badge */}
            <div className="mb-6">
              <span
                className="self-start rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white"
                style={{ backgroundColor: brandColor }}
              >
                {salon.booking_status_message ? "Notice" : "Bookings Open"}
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-gray-900 sm:text-6xl xl:text-7xl">
              {heroHeading}
              {heroTagline && (
                <>
                  <br />
                  <span style={{ color: brandColor }}>{heroTagline}</span>
                </>
              )}
            </h1>

            {/* Sub-copy from bio */}
            {bio && (
              <p className="mt-6 max-w-sm text-base leading-relaxed text-gray-500">
                {bio}
              </p>
            )}

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap gap-4">
              <button
                type="button"
                className="px-8 py-3.5 text-[12px] font-bold uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                onClick={scrollToCatalog}
              >
                {heroCTAPrimary}
              </button>
              <button
                type="button"
                className="border px-8 py-3.5 text-[12px] font-bold uppercase tracking-[0.2em] transition-colors hover:bg-gray-50"
                style={{ borderColor: brandColor, color: brandColor }}
                onClick={scrollToCatalog}
              >
                {heroCTASecondary}
              </button>
            </div>

            {/* Location + contact */}
            <div className="mt-10 space-y-2 text-sm text-gray-400">
              {locations.slice(0, 3).map((loc) => (
                <div key={loc.id} className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{loc.city ? `${loc.name}, ${loc.city}` : loc.name}</span>
                </div>
              ))}
              {salon.show_contact_on_booking && salon.contact_phone && (
                <a
                  href={`tel:${salon.contact_phone}`}
                  className="flex items-center gap-2 transition-colors hover:text-gray-600"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {salon.contact_phone}
                </a>
              )}
            </div>

            {/* Country toggle */}
            {showCountryToggle && onCountryChange && (
              <div className="mt-6">
                <Select value={selectedCountryCode || undefined} onValueChange={onCountryChange}>
                  <SelectTrigger className="w-[200px] border-black/20 text-sm">
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

            {/* Scroll cue */}
            <div className="mt-14 hidden lg:flex items-center gap-2 text-[11px] uppercase tracking-widest text-gray-300">
              <ChevronDown className="h-4 w-4 animate-bounce" />
              Scroll to browse
            </div>
          </div>

          {/* Right: editorial image */}
          <div className="relative min-h-[50vw] bg-gray-100 lg:min-h-0">
            {salon.banner_urls && salon.banner_urls.length > 0 ? (
              <div className="absolute inset-0">
                <BannerCarousel
                  bannerUrls={salon.banner_urls}
                  salonName={salon.name}
                  autoPlayInterval={5000}
                  variant="ecommerce"
                />
              </div>
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${brandColor}18 0%, ${brandColor}06 60%, #f9f9f9 100%)`,
                }}
              >
                {/* Decorative monogram when no image */}
                <div
                  className="flex h-48 w-48 items-center justify-center rounded-full text-8xl font-black text-white opacity-20"
                  style={{ backgroundColor: brandColor }}
                >
                  {salon.name.charAt(0)}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Status message bar */}
        {salon.booking_status_message && (
          <div className="border-y border-black/8 bg-gray-50 py-3 text-center text-sm text-gray-600">
            {salon.booking_status_message}
          </div>
        )}

        {/* Divider before catalog */}
        <div className="border-t border-black/8" />
      </>
    );
  }

  /* ── Default theme ───────────────────────────────────── */
  return (
    <div className="space-y-4">
      {salon.banner_urls && salon.banner_urls.length > 0 ? (
        <BannerCarousel
          bannerUrls={salon.banner_urls}
          salonName={salon.name}
          autoPlayInterval={30000}
        />
      ) : (
        <div className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">{salon.name}</h1>
          {salon.booking_page_bio && (
            <p className="text-sm text-muted-foreground">{salon.booking_page_bio}</p>
          )}
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

      {locations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <Badge key={loc.id} variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {loc.city ? `${loc.name}, ${loc.city}` : loc.name}
            </Badge>
          ))}
        </div>
      )}

      {salon.show_contact_on_booking && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {salon.contact_phone && (
            <a href={`tel:${salon.contact_phone}`} className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Phone className="h-4 w-4" />
              {salon.contact_phone}
            </a>
          )}
          {primaryLocation?.address && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {primaryLocation.address}{primaryLocation.city ? `, ${primaryLocation.city}` : ""}
            </span>
          )}
        </div>
      )}

      {salon.booking_status_message && (
        <div className="rounded-lg border bg-muted/40 p-4" style={{ borderColor: "var(--brand-color, #2563EB)" }}>
          <p className="text-sm text-muted-foreground">{salon.booking_status_message}</p>
        </div>
      )}
    </div>
  );
}
