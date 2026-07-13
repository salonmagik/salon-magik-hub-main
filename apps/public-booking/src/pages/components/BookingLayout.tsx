import { ReactNode, useState, useRef, useEffect } from "react";
import { ShoppingBag, Search, X } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { useBookingCart, type PublicTenant } from "@/hooks";

interface SearchSuggestion {
  id: string;
  name: string;
  type: string;
  imageUrl?: string | null;
}

interface BookingLayoutProps {
  children: ReactNode;
  salon?: PublicTenant | null;
  themeKey?: string | null;
  isThemePreview?: boolean;
  onCartClick: () => void;
  cartCount?: number;
  /** Controlled search query for ecommerce header search */
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchSuggestions?: SearchSuggestion[];
  onSuggestionSelect?: (itemId: string) => void;
}

function BrandIconButton({
  brandColor,
  onClick,
  label,
  className = "",
  children,
}: {
  brandColor: string;
  onClick?: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${className}`}
      style={{ backgroundColor: hovered ? `${brandColor}1a` : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

export function BookingLayout({
  children,
  salon,
  themeKey,
  isThemePreview = false,
  onCartClick,
  searchQuery = "",
  onSearchChange,
  searchSuggestions = [],
  onSuggestionSelect,
}: BookingLayoutProps) {
  const { getItemCount } = useBookingCart();
  const itemCount = getItemCount();
  const brandColor = salon?.brand_color || "#111827";
  const isEcommerceTheme = themeKey === "ecommerce";
  const [searchOpen, setSearchOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const handleSearchToggle = () => {
    if (searchOpen && searchQuery) {
      onSearchChange?.("");
    }
    if (searchOpen) setShowSuggestions(false);
    setSearchOpen((prev) => !prev);
  };

  return (
    <div
      className={isEcommerceTheme ? "min-h-screen bg-white text-gray-900" : "min-h-screen bg-background"}
      style={{
        "--brand-color": brandColor,
        "--brand-foreground": "#ffffff",
      } as React.CSSProperties}
    >
      {isThemePreview && (
        <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
          <div className="mx-auto flex items-center justify-center px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em]">
            Preview mode
          </div>
        </div>
      )}

      <header
        className={
          isEcommerceTheme
            ? "sticky top-0 z-50 border-b border-black/8 bg-white/95 backdrop-blur"
            : "sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        }
      >
        <div className={isEcommerceTheme ? "mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8" : "container mx-auto flex h-16 items-center justify-between px-4"}>
          {/* Logo — hidden when search bar is open on small screens */}
          <div className={`flex items-center gap-3 ${isEcommerceTheme && searchOpen ? "hidden sm:flex" : "flex"}`}>
            {salon?.logo_url ? (
              <img src={salon.logo_url} alt={salon.name} className={isEcommerceTheme ? "h-8 w-8 object-contain" : "h-9 w-9 rounded-lg object-cover"} />
            ) : (
              <div
                className={isEcommerceTheme ? "flex h-8 w-8 items-center justify-center text-sm font-bold text-white" : "flex h-9 w-9 items-center justify-center rounded-lg text-base font-bold text-white"}
                style={{ backgroundColor: brandColor }}
              >
                {salon?.name?.charAt(0) || "S"}
              </div>
            )}
            <span className={isEcommerceTheme ? "text-sm font-semibold uppercase tracking-widest" : "hidden font-semibold sm:block"}>
              {salon?.name || "Book Appointment"}
            </span>
          </div>

          {/* Ecommerce: expandable inline search + cart */}
          {isEcommerceTheme ? (
            <div className="flex items-center gap-2">
              {searchOpen ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => onSearchChange?.(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      placeholder="Search services, products…"
                      className="h-9 w-56 rounded-full border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:w-72"
                    />
                    {showSuggestions && searchQuery.length >= 2 && searchSuggestions.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                        {searchSuggestions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              onSearchChange?.(item.name);
                              setShowSuggestions(false);
                              onSuggestionSelect?.(item.id);
                            }}
                          >
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                            ) : (
                              <div className="h-8 w-8 flex-shrink-0 rounded bg-gray-100" />
                            )}
                            <span className="flex-1 truncate font-medium text-gray-900">{item.name}</span>
                            <span className="text-xs capitalize text-gray-400">{item.type}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <BrandIconButton brandColor={brandColor} onClick={handleSearchToggle} label="Close search">
                    <X className="h-4 w-4 text-gray-600" />
                  </BrandIconButton>
                </div>
              ) : (
                <BrandIconButton brandColor={brandColor} onClick={handleSearchToggle} label="Search">
                  <Search className="h-5 w-5 text-gray-700" />
                </BrandIconButton>
              )}
              <BrandIconButton brandColor={brandColor} onClick={onCartClick} label="Cart">
                <ShoppingBag className="h-5 w-5 text-gray-700" />
                {itemCount > 0 && (
                  <Badge
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center border-0 p-0 text-[10px] font-bold text-white"
                    style={{ backgroundColor: brandColor }}
                  >
                    {itemCount}
                  </Badge>
                )}
              </BrandIconButton>
            </div>
          ) : (
            <Button variant="outline" size="icon" className="relative" onClick={onCartClick}>
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <Badge
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center border-0 p-0 text-[10px] font-bold text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  {itemCount}
                </Badge>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* For ecommerce: full-width, children own their layout */}
      {isEcommerceTheme ? (
        <main className="w-full overflow-x-hidden">{children}</main>
      ) : (
        <main className="container mx-auto max-w-5xl px-4 py-6">{children}</main>
      )}

      <footer className={isEcommerceTheme ? "border-t border-black/8" : "mt-12 border-t py-6"}>
        {isEcommerceTheme && salon?.about_text && (
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-start">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">About</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-900">{salon.name}</h2>
              </div>
              <p className="text-base leading-relaxed text-gray-600 lg:pt-1">{salon.about_text}</p>
            </div>
          </div>
        )}
        <div className={isEcommerceTheme ? "border-t border-black/8 py-6 mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between text-[11px] uppercase tracking-widest text-gray-400" : "container mx-auto px-4 text-center text-sm text-muted-foreground"}>
          {isEcommerceTheme ? (
            <>
              <span>{salon?.name}</span>
              <span>Powered by SalonMagik</span>
            </>
          ) : (
            <span>Powered by SalonMagik</span>
          )}
        </div>
      </footer>
    </div>
  );
}
