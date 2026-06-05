import { ReactNode } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { useBookingCart, type PublicTenant } from "@/hooks";

interface BookingLayoutProps {
  children: ReactNode;
  salon?: PublicTenant | null;
  themeKey?: string | null;
  isThemePreview?: boolean;
  onCartClick: () => void;
  cartCount?: number;
}

export function BookingLayout({
  children,
  salon,
  themeKey,
  isThemePreview = false,
  onCartClick,
}: BookingLayoutProps) {
  const { getItemCount } = useBookingCart();
  const itemCount = getItemCount();
  const brandColor = salon?.brand_color || "#111827";
  const isEcommerceTheme = themeKey === "ecommerce";

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
          {/* Logo */}
          <div className="flex items-center gap-3">
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

          {/* Cart */}
          <Button
            variant={isEcommerceTheme ? "ghost" : "outline"}
            size="icon"
            className="relative"
            onClick={onCartClick}
          >
            <ShoppingBag className={isEcommerceTheme ? "h-5 w-5 text-gray-700" : "h-5 w-5"} />
            {itemCount > 0 && (
              <Badge
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center border-0 p-0 text-[10px] font-bold text-white"
                style={{ backgroundColor: brandColor }}
              >
                {itemCount}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      {/* For ecommerce: full-width, children own their layout */}
      {isEcommerceTheme ? (
        <main className="w-full overflow-x-hidden">{children}</main>
      ) : (
        <main className="container mx-auto max-w-5xl px-4 py-6">{children}</main>
      )}

      <footer className={isEcommerceTheme ? "border-t border-black/8 py-8" : "mt-12 border-t py-6"}>
        <div className={isEcommerceTheme ? "mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between text-[11px] uppercase tracking-widest text-gray-400" : "container mx-auto px-4 text-center text-sm text-muted-foreground"}>
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
