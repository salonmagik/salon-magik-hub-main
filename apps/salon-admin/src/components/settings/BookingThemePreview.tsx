import { useMemo, useState } from "react";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { MapPin, Phone, Search, ShoppingBag, Clock, Package as PackageIcon, Sparkles } from "lucide-react";
import { formatCurrency } from "@shared/currency";

type BookingThemeKey = "default" | "ecommerce";

interface PreviewLocation {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
}

interface BookingThemePreviewProps {
  themeKey: BookingThemeKey;
  salonName: string;
  brandColor: string;
  bannerUrls: string[];
  bookingStatusMessage?: string | null;
  contactPhone?: string | null;
  showContactOnBooking?: boolean;
  locations: PreviewLocation[];
  mode?: "card" | "dialog";
}

type PreviewItem = {
  id: string;
  type: "service" | "package" | "product";
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  durationMinutes?: number;
  locationNames: string[];
};

const previewItems: PreviewItem[] = [
  {
    id: "svc-signature",
    type: "service",
    name: "Signature Silk Press",
    description: "A polished appointment-led service page with fast discovery and clear pricing.",
    price: 180,
    durationMinutes: 90,
    locationNames: ["Osu", "Airport"],
  },
  {
    id: "pkg-glow",
    type: "package",
    name: "Glow Weekend Bundle",
    description: "Service package presentation with merchandising-style layout and stronger upsell cues.",
    price: 320,
    originalPrice: 370,
    durationMinutes: 150,
    locationNames: ["Osu"],
  },
  {
    id: "prd-serum",
    type: "product",
    name: "Repair Serum",
    description: "Retail add-ons shown in the same storefront flow as services and packages.",
    price: 85,
    locationNames: ["Airport", "East Legon"],
  },
];

export function BookingThemePreview({
  themeKey,
  salonName,
  brandColor,
  bannerUrls,
  bookingStatusMessage,
  contactPhone,
  showContactOnBooking = true,
  locations,
  mode = "card",
}: BookingThemePreviewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const isDialog = mode === "dialog";
  const isEcommerceTheme = themeKey === "ecommerce";
  const primaryLocation = locations[0];

  const filteredItems = useMemo(() => {
    if (activeTab === "all") return previewItems;
    return previewItems.filter((item) => item.type === activeTab.slice(0, -1));
  }, [activeTab]);

  const themeLabel = isEcommerceTheme ? "E-commerce" : "Default";

  const renderHero = () => {
    if (isEcommerceTheme) {
      return (
        <div className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
          {bannerUrls.length > 0 ? (
            <div
              className="relative h-64 bg-cover bg-center"
              style={{ backgroundImage: `url(${bannerUrls[0]})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#1f1b17]/80 via-[#1f1b17]/35 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6 text-white sm:p-8">
                <p className="text-xs uppercase tracking-[0.22em] text-white/75">Bookings + storefront</p>
                <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{salonName}</h1>
              </div>
            </div>
          ) : (
            <div className="relative h-64 bg-[linear-gradient(135deg,#fbf3e2_0%,#ead8b9_100%)]">
              <div className="absolute inset-0 bg-gradient-to-r from-[#1f1b17]/75 via-[#1f1b17]/25 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6 text-white sm:p-8">
                <p className="text-xs uppercase tracking-[0.22em] text-white/75">Bookings + storefront</p>
                <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{salonName}</h1>
              </div>
            </div>
          )}

          <div className="grid gap-5 p-5 lg:grid-cols-[1.5fr_0.85fr] lg:p-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-stone-900 text-white hover:bg-stone-900">Shopify-style theme</Badge>
                {bookingStatusMessage ? <Badge variant="secondary">Booking notice active</Badge> : null}
              </div>

              <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">{salonName}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                  A richer storefront-style booking page for services, packages, vouchers, and retail add-ons.
                </p>
              </div>

              {locations.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {locations.map((location) => (
                    <Badge key={location.id} variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                      <MapPin className="h-3 w-3" />
                      {location.name}{location.city ? `, ${location.city}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {showContactOnBooking ? (
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {contactPhone ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-4 w-4" />
                      {contactPhone}
                    </div>
                  ) : null}
                  {primaryLocation?.address ? (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {primaryLocation.address}{primaryLocation.city ? `, ${primaryLocation.city}` : ""}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-[24px] border border-stone-200 bg-[#fcfaf6] p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">Shopping context</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Customers can browse bookable services, bundles, and retail items in one flow.
                </p>
              </div>
              {bookingStatusMessage ? (
                <div className="rounded-2xl border bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                  <p className="mt-2 text-sm text-muted-foreground">{bookingStatusMessage}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {bannerUrls.length > 0 ? (
          <div className="overflow-hidden rounded-3xl border">
            <div
              className="relative h-56 bg-cover bg-center"
              style={{ backgroundImage: `url(${bannerUrls[0]})` }}
            >
              <div className="absolute inset-0 bg-black/25" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <h1 className="text-2xl font-bold md:text-3xl">{salonName}</h1>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <h1 className="text-2xl font-bold md:text-3xl">{salonName}</h1>
          </div>
        )}

        {locations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {locations.map((location) => (
              <Badge key={location.id} variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {location.name}{location.city ? `, ${location.city}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}

        {showContactOnBooking ? (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {contactPhone ? (
              <div className="flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                {contactPhone}
              </div>
            ) : null}
            {primaryLocation?.address ? (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {primaryLocation.address}{primaryLocation.city ? `, ${primaryLocation.city}` : ""}
              </div>
            ) : null}
          </div>
        ) : null}

        {bookingStatusMessage ? (
          <div className="rounded-lg bg-muted p-4" style={{ border: `1px solid ${brandColor}` }}>
            <p className="text-sm text-muted-foreground">{bookingStatusMessage}</p>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={isEcommerceTheme ? "rounded-[30px] border border-stone-200 bg-[#f4efe6] text-slate-900" : "rounded-[28px] border bg-background"}
      style={{ ["--brand-color" as string]: brandColor, ["--brand-foreground" as string]: "#ffffff" }}
    >
      <div className="border-b border-dashed px-5 py-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        {themeLabel} theme simulator
      </div>

      <div className={isDialog ? "max-h-[72vh] overflow-y-auto" : "max-h-[480px] overflow-y-auto"}>
        <div className={isEcommerceTheme ? "min-h-full bg-[#f4efe6]" : "min-h-full bg-background"}>
          <header
            className={
              isEcommerceTheme
                ? "sticky top-0 z-10 border-b border-stone-200 bg-[#fffaf3]/95 backdrop-blur"
                : "sticky top-0 z-10 border-b bg-background/95 backdrop-blur"
            }
          >
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  {salonName.charAt(0) || "S"}
                </div>
                <span className="hidden text-lg font-semibold sm:block">{salonName}</span>
                {isEcommerceTheme ? (
                  <Badge variant="secondary" className="hidden border border-stone-200 bg-white text-stone-700 md:inline-flex">
                    Storefront theme
                  </Badge>
                ) : null}
              </div>

              <Button
                variant="outline"
                size="icon"
                className={isEcommerceTheme ? "relative border-slate-200 bg-white hover:bg-slate-50" : "relative"}
              >
                <ShoppingBag className="h-5 w-5" />
                <Badge
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center border-0 p-0 text-xs text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  3
                </Badge>
              </Button>
            </div>
          </header>

          <main className={isEcommerceTheme ? "mx-auto max-w-6xl px-4 py-8" : "mx-auto max-w-5xl px-4 py-6"}>
            <div className="space-y-6">
              {renderHero()}

              <div className={isEcommerceTheme ? "rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm" : ""}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value=""
                      readOnly
                      placeholder="Search services, packages, products..."
                      className={isEcommerceTheme ? "bg-[#fcfaf6] pl-9" : "pl-9"}
                    />
                  </div>
                  <Button variant="outline" className={isEcommerceTheme ? "justify-start bg-[#fcfaf6] sm:w-[180px]" : "sm:w-[180px]"}>
                    Sort: Name A-Z
                  </Button>
                </div>

                {locations.length > 1 ? (
                  <div className={isEcommerceTheme ? "mt-4 space-y-2 rounded-2xl border border-stone-200 bg-[#fcfaf6] p-3" : "mt-4 space-y-2 rounded-lg border p-3"}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4" />
                      Filter by city
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                        All locations
                      </button>
                      {locations.slice(0, 3).map((location) => (
                        <button key={location.id} type="button" className="rounded-full border bg-background px-3 py-1.5 text-xs">
                          {location.city || location.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className={isEcommerceTheme ? "mt-4 w-full justify-start overflow-x-auto rounded-full bg-stone-100 p-1" : "mt-4 w-full justify-start overflow-x-auto"}>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="services">Services</TabsTrigger>
                    <TabsTrigger value="packages">Packages</TabsTrigger>
                    <TabsTrigger value="products">Products</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className={isEcommerceTheme ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
                {filteredItems.map((item) => {
                  const hasDiscount = item.originalPrice && item.originalPrice > item.price;
                  const discountPercent = hasDiscount && item.originalPrice
                    ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)
                    : 0;

                  return (
                    <div
                      key={item.id}
                      className={
                        isEcommerceTheme
                          ? "flex min-h-[240px] flex-col rounded-[26px] border border-stone-200 bg-white p-3 shadow-sm"
                          : "flex min-h-[200px] flex-col rounded-xl border bg-card p-4"
                      }
                    >
                      <div className={isEcommerceTheme ? "mb-4 space-y-4" : "mb-3 flex gap-3"}>
                        <div
                          className={isEcommerceTheme ? "h-48 w-full shrink-0 rounded-[22px]" : "h-20 w-20 shrink-0 rounded-lg"}
                          style={{
                            background: item.type === "product"
                              ? "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
                              : item.type === "package"
                                ? "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)"
                                : "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-start justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {item.type}
                            </span>
                            <div className="text-right">
                              <span className="text-base font-bold">{formatCurrency(item.price, "GHS")}</span>
                              {hasDiscount ? (
                                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                                  <span className="text-xs text-muted-foreground line-through">
                                    {formatCurrency(item.originalPrice!, "GHS")}
                                  </span>
                                  <Badge variant="destructive" className="px-1 py-0 text-xs">
                                    -{discountPercent}%
                                  </Badge>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <h3 className={isEcommerceTheme ? "line-clamp-1 text-lg font-semibold" : "line-clamp-1 text-base font-semibold"}>{item.name}</h3>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.locationNames.map((locationName) => (
                              <Badge key={locationName} variant="outline" className="gap-1 text-[10px]">
                                <MapPin className="h-2.5 w-2.5" />
                                {locationName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1" />

                      <div className={isEcommerceTheme ? "mt-3 flex flex-col gap-3" : "mt-3 flex items-end justify-between gap-2"}>
                        <div className="flex flex-wrap gap-1.5">
                          {item.type === "service" ? (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Clock className="h-3 w-3" />
                              {item.durationMinutes} min
                            </Badge>
                          ) : null}
                          {item.type === "package" ? (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <PackageIcon className="h-3 w-3" />
                              Bundle
                            </Badge>
                          ) : null}
                          {item.type === "product" ? (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Sparkles className="h-3 w-3" />
                              Retail add-on
                            </Badge>
                          ) : null}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className={isEcommerceTheme ? "w-full border-0" : "border-0"}
                          style={{ backgroundColor: brandColor, color: "#fff" }}
                        >
                          <ShoppingBag className="mr-1.5 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
