import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  usePublicSalon,
  usePublicCatalog,
  useBookingCountryContext,
  BookingCartProvider,
} from "@/hooks";
import type { PublicCatalogMode } from "@/hooks/usePublicCatalog";
import { resolvePublicBookingSlug } from "@/lib/slugResolution";
import { BookingLayout } from "./components/BookingLayout";
import { SalonHeader } from "./components/SalonHeader";
import { CatalogView } from "./components/CatalogView";
import { BookingWizard } from "./components/BookingWizard";
import { Skeleton } from "@ui/skeleton";
import { Button } from "@ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { isLightColor } from "@shared/color";
import { COUNTRIES, getCountryByCode } from "@shared/countries";
import { getCurrencyForCountryCode } from "@shared/country-currency";

const normalizeCountryValue = (value: string | null | undefined): string =>
  (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

const toCountryCode = (value: string | null | undefined): string | null => {
  const normalized = normalizeCountryValue(value);
  if (!normalized) return null;
  if (normalized.length === 2 && getCountryByCode(normalized)) return normalized;
  const byName = COUNTRIES.find((country) => normalizeCountryValue(country.name) === normalized);
  return byName?.code ?? null;
};

function BookingPageContent() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = resolvePublicBookingSlug({
    routeSlug,
    hostname: window.location.hostname,
    search: window.location.search,
    configuredBaseDomain: import.meta.env.VITE_PUBLIC_BOOKING_BASE_DOMAIN as string | undefined,
    isDev: import.meta.env.DEV,
  });

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [modalCountryCode, setModalCountryCode] = useState<string | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

  const {
    countryContextEnabled,
    selectedCountryCode,
    supportedCountryCodes,
    requiresCountrySelection,
    setCountry,
    isLoading: countryContextLoading,
  } = useBookingCountryContext({
    tenantSlug: slug,
    enabled: Boolean(slug),
  });

  const catalogMode: PublicCatalogMode = countryContextEnabled ? "chain_country_scoped" : "legacy";
  const effectiveCountryCode = countryContextEnabled ? selectedCountryCode : null;

  const { salon, locations, isLoading: salonLoading, notFound } = usePublicSalon(
    slug,
    effectiveCountryCode,
    catalogMode,
  );

  const countryScopedLocations = useMemo(() => {
    if (!countryContextEnabled || !selectedCountryCode) return locations;
    const matches = locations.filter(
      (location) => toCountryCode(location.country) === selectedCountryCode,
    );
    // Keep storefront functional if legacy country values cannot be normalized.
    return matches.length > 0 ? matches : locations;
  }, [countryContextEnabled, selectedCountryCode, locations]);
  const locationIds = useMemo(
    () => countryScopedLocations.map((location) => location.id),
    [countryScopedLocations],
  );
  const scopedLocationIds = useMemo(() => {
    if (!countryContextEnabled) return [];
    if (selectedLocationIds.length === 0) return locationIds;
    return selectedLocationIds.filter((locationId) => locationIds.includes(locationId));
  }, [countryContextEnabled, locationIds, selectedLocationIds]);

  const {
    services,
    packages,
    products,
    categories,
    isLoading: catalogLoading,
  } = usePublicCatalog(salon?.id, effectiveCountryCode, scopedLocationIds, catalogMode);

  const cartScopeKey = `${slug ?? "unknown"}:${effectiveCountryCode ?? "legacy"}`;
  const storefrontCurrency = getCurrencyForCountryCode(effectiveCountryCode, salon?.currency || "USD");
  const isCatalogBlocked = countryContextEnabled && requiresCountrySelection && !selectedCountryCode;
  const isLoading = salonLoading || countryContextLoading || (!isCatalogBlocked && catalogLoading);

  useEffect(() => {
    if (salon?.name) {
      document.title = `Book at ${salon.name} | SalonMagik`;
    } else {
      document.title = "Book Appointment | SalonMagik";
    }

    return () => {
      document.title = "SalonMagik";
    };
  }, [salon?.name]);

  useEffect(() => {
    if (!salon?.brand_color) return;

    const root = document.documentElement;
    const brandColor = salon.brand_color;
    const textColor = isLightColor(brandColor) ? "#1a1a1a" : "#ffffff";

    root.style.setProperty("--brand-color", brandColor);
    root.style.setProperty("--brand-foreground", textColor);

    return () => {
      root.style.removeProperty("--brand-color");
      root.style.removeProperty("--brand-foreground");
    };
  }, [salon?.brand_color]);

  useEffect(() => {
    if (!isCatalogBlocked) {
      setModalCountryCode(null);
      return;
    }

    if (!modalCountryCode && supportedCountryCodes.length > 0) {
      setModalCountryCode(supportedCountryCodes[0]);
    }
  }, [isCatalogBlocked, supportedCountryCodes, modalCountryCode]);

  useEffect(() => {
    setSelectedLocationIds((prev) => {
      if (locationIds.length === 0) {
        return prev.length === 0 ? prev : [];
      }

      const next = prev.filter((locationId) => locationIds.includes(locationId));
      if (next.length === prev.length && next.every((locationId, idx) => locationId === prev[idx])) {
        return prev;
      }

      return next;
    });
  }, [locationIds]);

  if (isLoading) {
    return (
      <BookingCartProvider scopeKey={cartScopeKey}>
        <BookingLayout onCartClick={() => {}} cartCount={0}>
          <div className="space-y-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          </div>
        </BookingLayout>
      </BookingCartProvider>
    );
  }

  if (notFound || !salon) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center max-w-md px-4">
          <h1 className="text-4xl font-bold mb-4">Salon Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This booking page doesn't exist or online booking is not enabled for this salon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BookingCartProvider scopeKey={cartScopeKey}>
      <>
        <BookingLayout
          salon={salon}
          onCartClick={() => setCheckoutOpen(true)}
        >
          <div className="space-y-8">
            <SalonHeader
              salon={salon}
              locations={countryScopedLocations}
              supportedCountryCodes={countryContextEnabled ? supportedCountryCodes : []}
              selectedCountryCode={countryContextEnabled ? selectedCountryCode : null}
              onCountryChange={countryContextEnabled ? setCountry : undefined}
            />

            {!isCatalogBlocked ? (
              <CatalogView
                services={services}
                packages={packages}
                products={products}
                categories={categories}
                locations={countryScopedLocations}
                currency={storefrontCurrency}
                selectedLocationIds={selectedLocationIds}
                onLocationFilterChange={setSelectedLocationIds}
              />
            ) : (
              <div className="rounded-xl border bg-muted/20 p-8 text-center space-y-2">
                <h2 className="text-xl font-semibold">Select your shopping country</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a country to load available services, products, packages, and vouchers.
                </p>
              </div>
            )}
          </div>
        </BookingLayout>

        <BookingWizard
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          salon={salon}
          locations={countryScopedLocations}
          selectedCountryCode={selectedCountryCode}
        />

        <Dialog open={isCatalogBlocked}>
          <DialogContent className="sm:max-w-md [&>button]:hidden">
            <DialogHeader>
              <DialogTitle>Select your country</DialogTitle>
              <DialogDescription>
                We could not match your location to this salon's supported countries. Pick where you want to shop.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Select value={modalCountryCode || undefined} onValueChange={setModalCountryCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose country" />
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

              <Button
                className="w-full"
                onClick={() => {
                  if (!modalCountryCode) return;
                  setCountry(modalCountryCode);
                }}
                disabled={!modalCountryCode}
              >
                Continue to {getCountryByCode(modalCountryCode || "")?.name ?? "selected country"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    </BookingCartProvider>
  );
}

export default function BookingPage() {
  return <BookingPageContent />;
}
