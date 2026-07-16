import { useMemo, useState } from "react";
import { Badge } from "@ui/badge";
import { ShoppingBag, Calendar, Search, Clock, Package as PackageIcon, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";

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
  bookingPageBio?: string | null;
  bookingStatusMessage?: string | null;
  contactPhone?: string | null;
  showContactOnBooking?: boolean;
  locations: PreviewLocation[];
  mode?: "card" | "dialog";
  storefrontMode?: "services" | "products" | "both";
  heroHeading?: string | null;
  heroTagline?: string | null;
  heroCTAPrimary?: string | null;
  heroCTASecondary?: string | null;
}

type PreviewItem = {
  id: string;
  type: "service" | "package" | "product";
  name: string;
  price: number;
  originalPrice?: number;
  durationMinutes?: number;
  gradient: string;
};

const previewItems: PreviewItem[] = [
  { id: "1", type: "service", name: "Signature Silk Press", price: 180, durationMinutes: 90, gradient: "linear-gradient(135deg,#f5e6ff 0%,#e2d0f7 100%)" },
  { id: "2", type: "package", name: "Glow Weekend Bundle", price: 320, originalPrice: 375, gradient: "linear-gradient(135deg,#e0f2fe 0%,#bae6fd 100%)" },
  { id: "3", type: "product", name: "Repair Serum", price: 85, gradient: "linear-gradient(135deg,#fef9c3 0%,#fde68a 100%)" },
  { id: "4", type: "service", name: "Deep Condition Treatment", price: 120, durationMinutes: 60, gradient: "linear-gradient(135deg,#fce7f3 0%,#f9a8d4 100%)" },
];

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-gray-200 shadow-xl">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1">
          <div className="h-2 w-2 rounded-full bg-gray-300" />
          <span className="truncate text-[11px] text-gray-400">{url}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

export function BookingThemePreview({
  themeKey,
  salonName,
  brandColor,
  bannerUrls,
  bookingPageBio,
  bookingStatusMessage,
  contactPhone,
  showContactOnBooking = true,
  locations,
  mode = "card",
  storefrontMode = "both",
  heroHeading,
  heroTagline,
  heroCTAPrimary,
  heroCTASecondary,
}: BookingThemePreviewProps) {
  const [typeFilter, setTypeFilter] = useState("all");
  const isDialog = mode === "dialog";
  const isEcommerceTheme = themeKey === "ecommerce";
  const isModeRestricted = storefrontMode !== "both";
  const brand = brandColor?.startsWith("#") ? brandColor : "#111827";

  const slug = salonName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const displayUrl = `salonmagik.com/book/${slug || "your-salon"}`;

  const modeItems = useMemo(() => {
    if (storefrontMode === "services") return previewItems.filter((i) => i.type !== "product");
    if (storefrontMode === "products") return previewItems.filter((i) => i.type !== "service");
    return previewItems;
  }, [storefrontMode]);

  const filteredItems = useMemo(() => {
    if (typeFilter === "all") return modeItems;
    return modeItems.filter((i) => i.type === typeFilter);
  }, [modeItems, typeFilter]);

  const isServiceFeel = (itemType: PreviewItem["type"]) => storefrontMode === "services" && itemType !== "product";

  const discountPct = (item: PreviewItem) =>
    item.originalPrice ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100) : 0;

  /* ── Ecommerce editorial preview ──────────────────────── */
  if (isEcommerceTheme) {
    const bio = bookingPageBio || "";
    const displayHeading = heroHeading || salonName;
    const displayTagline = heroTagline ?? (bio ? bio.split(/[.!,]/)[0] : "");
    const primaryCTA = heroCTAPrimary || "Book Now";
    const secondaryCTA = heroCTASecondary || "Our Services";

    return (
      <BrowserChrome url={displayUrl}>
        <div
          className={cn("bg-white text-gray-900", isDialog ? "max-h-[68vh] overflow-y-auto" : "max-h-[540px] overflow-y-auto")}
          style={{ "--brand-color": brand } as React.CSSProperties}
        >
          {/* Minimal nav */}
          <div className="flex h-12 items-center justify-between border-b border-black/8 px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center text-[11px] font-black text-white" style={{ backgroundColor: brand }}>
                {salonName.charAt(0) || "S"}
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-widest">{salonName}</span>
            </div>
            <div className="relative">
              <ShoppingBag className="h-4 w-4 text-gray-600" />
            </div>
          </div>

          {/* Hero: split */}
          <div className="grid min-h-[280px] grid-cols-2">
            {/* Left copy */}
            <div className="flex flex-col justify-center px-6 py-10">
              <span className="mb-3 self-start rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white" style={{ backgroundColor: brand }}>
                Bookings Open
              </span>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-gray-900">
                {displayHeading}
                {displayTagline && (
                  <><br /><span style={{ color: brand }}>{displayTagline}</span></>
                )}
              </h2>
              {bio && (
                <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-gray-500">
                  {bio}
                </p>
              )}
              <div className="mt-5 flex gap-2">
                <button type="button" className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white" style={{ backgroundColor: brand }}>
                  {primaryCTA}
                </button>
                <button type="button" className="border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ borderColor: brand, color: brand }}>
                  {secondaryCTA}
                </button>
              </div>
              {showContactOnBooking && contactPhone && (
                <p className="mt-4 text-[10px] text-gray-400">{contactPhone}</p>
              )}
            </div>

            {/* Right image */}
            <div className="relative bg-gray-100">
              {bannerUrls.length > 0 ? (
                <img src={bannerUrls[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${brand}22 0%, ${brand}08 100%)` }}
                >
                  <span className="text-5xl font-black opacity-10" style={{ color: brand }}>
                    {salonName.charAt(0)}
                  </span>
                </div>
              )}
              {/* Edge fade */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent" />
            </div>
          </div>

          {bookingStatusMessage && (
            <div className="border-y border-black/8 bg-gray-50 py-2 text-center text-[10px] text-gray-500">
              {bookingStatusMessage}
            </div>
          )}

          {/* Catalog section */}
          <div className="px-6 py-8">
            {/* Header row */}
            <div className="mb-6 flex items-center justify-between border-b border-black/8 pb-4">
              <p className="text-[11px] text-gray-400">{filteredItems.length} items</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                <div className="h-7 w-40 rounded border border-black/12 bg-white pl-7 text-[10px] leading-7 text-gray-400">Search…</div>
              </div>
            </div>

            <div className="grid grid-cols-[140px_1fr] gap-8">
              {/* Sidebar */}
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400">Sort By</p>
                  <div className="h-6 rounded border border-black/12 bg-white px-2 text-[10px] leading-6 text-gray-500">Name A–Z ▾</div>
                </div>
                {!isModeRestricted && (
                  <div className="border-t border-black/8 pt-4">
                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400">Type</p>
                    <ul className="space-y-2">
                      {["All", "Services", "Packages", "Products"].map((t) => {
                        const val = t === "All" ? "all" : t.toLowerCase().slice(0, -1);
                        const active = typeFilter === val;
                        return (
                          <li key={t}>
                            <button
                              type="button"
                              onClick={() => setTypeFilter(val)}
                              className="text-[10px] transition-colors"
                              style={{ color: active ? brand : "#9ca3af", fontWeight: active ? 600 : 400 }}
                            >
                              {t}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {locations.length > 0 && (
                  <div className="border-t border-black/8 pt-4">
                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400">Location</p>
                    <ul className="space-y-1.5">
                      <li><span className="text-[10px] font-semibold" style={{ color: brand }}>All</span></li>
                      {locations.slice(0, 3).map((loc) => (
                        <li key={loc.id}><span className="text-[10px] text-gray-400">{loc.city || loc.name}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 gap-3">
                {filteredItems.map((item) => {
                  const dp = discountPct(item);
                  return (
                    <div key={item.id} className="group">
                      {/* Image */}
                      <div className="relative mb-2 aspect-[3/4] overflow-hidden bg-gray-100">
                        <div className="h-full w-full" style={{ background: item.gradient }} />
                        <div className="absolute left-0 top-0 p-2">
                          {dp > 0 ? (
                            <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white" style={{ backgroundColor: brand }}>
                              -{dp}%
                            </span>
                          ) : (
                            <span className="rounded-full bg-black px-1.5 py-0.5 text-[8px] font-semibold text-white">
                              {item.type === "package" ? "Bundle" : item.type === "product" ? "Retail" : "Service"}
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow opacity-0 transition-opacity group-hover:opacity-100">
                          {isServiceFeel(item.type) ? (
                            <Calendar className="h-3 w-3" style={{ color: brand }} />
                          ) : (
                            <ShoppingBag className="h-3 w-3" style={{ color: brand }} />
                          )}
                        </div>
                      </div>
                      {/* Text */}
                      <p className="text-[9px] uppercase tracking-widest text-gray-400">
                        {item.type}{item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}
                      </p>
                      <p className="text-[11px] font-medium text-gray-900">{item.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold">{formatCurrency(item.price, "GHS")}</span>
                        {item.originalPrice && (
                          <span className="text-[10px] text-gray-400 line-through">{formatCurrency(item.originalPrice, "GHS")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </BrowserChrome>
    );
  }

  /* ── Default theme preview ────────────────────────────── */
  return (
    <BrowserChrome url={displayUrl}>
      <div
        className={cn("bg-background", isDialog ? "max-h-[68vh] overflow-y-auto" : "max-h-[540px] overflow-y-auto")}
        style={{ "--brand-color": brand } as React.CSSProperties}
      >
        <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b bg-background/95 px-5 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: brand }}>
              {salonName.charAt(0) || "S"}
            </div>
            <span className="text-sm font-semibold">{salonName}</span>
          </div>
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="space-y-5 p-5">
          {bannerUrls.length > 0 ? (
            <div className="relative h-36 overflow-hidden rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url(${bannerUrls[0]})` }}>
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-x-0 bottom-0 p-3"><h1 className="text-base font-bold text-white">{salonName}</h1></div>
            </div>
          ) : (
            <div>
              <h1 className="text-lg font-bold">{salonName}</h1>
              {bookingPageBio && <p className="mt-1 text-xs text-muted-foreground">{bookingPageBio}</p>}
            </div>
          )}

          {locations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {locations.slice(0, 3).map((loc) => (
                <span key={loc.id} className="flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px]">
                  {loc.city ? `${loc.name}, ${loc.city}` : loc.name}
                </span>
              ))}
            </div>
          )}

          {bookingStatusMessage && (
            <div className="rounded-lg border bg-muted/40 p-3 text-[11px] text-muted-foreground" style={{ borderColor: brand }}>
              {bookingStatusMessage}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <div className="h-9 rounded-md border bg-background pl-9 text-[11px] leading-9 text-muted-foreground">Search…</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modeItems.map((item) => {
              const dp = discountPct(item);
              return (
                <div key={item.id} className="flex gap-3 rounded-xl border bg-card p-3">
                  <div className="h-14 w-14 shrink-0 rounded-lg" style={{ background: item.gradient }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.type}</span>
                      <span className="text-xs font-bold">{formatCurrency(item.price, "GHS")}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs font-semibold">{item.name}</p>
                    {item.durationMinutes && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />{item.durationMinutes} min
                      </div>
                    )}
                    {dp > 0 && <Badge variant="destructive" className="mt-1 px-1 py-0 text-[10px]">-{dp}%</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}
