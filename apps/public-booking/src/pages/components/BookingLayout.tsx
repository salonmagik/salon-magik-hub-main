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

export function BookingLayout({ children, salon, themeKey, isThemePreview = false, onCartClick }: BookingLayoutProps) {
  const { getItemCount } = useBookingCart();
  const itemCount = getItemCount();
  const brandColor = salon?.brand_color || "#2563EB";
  const isEcommerceTheme = themeKey === "ecommerce";

  return (
    <div
      className={isEcommerceTheme ? "min-h-screen bg-[#f4efe6] text-slate-900" : "min-h-screen bg-background"}
      style={{
        "--brand-color": brandColor,
        "--theme-surface": isEcommerceTheme ? "#fffaf3" : "hsl(var(--background))",
      } as React.CSSProperties}
    >
      {isThemePreview && (
        <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
          <div className="container mx-auto flex items-center justify-center px-4 py-2 text-xs font-medium uppercase tracking-[0.2em]">
            Preview mode
          </div>
        </div>
      )}

      <header
        className={
          isEcommerceTheme
            ? "sticky top-0 z-50 border-b border-stone-200 bg-[color:var(--theme-surface)]/95 backdrop-blur"
            : "sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        }
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {salon?.logo_url ? (
              <img
                src={salon.logo_url}
                alt={salon.name}
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                {salon?.name?.charAt(0) || "S"}
              </div>
            )}
            <span className="font-semibold text-lg hidden sm:block">
              {salon?.name || "Book Appointment"}
            </span>
            {isEcommerceTheme && (
              <Badge variant="secondary" className="hidden md:inline-flex border border-stone-200 bg-white text-stone-700">
                Storefront theme
              </Badge>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className={isEcommerceTheme ? "relative border-slate-200 bg-white hover:bg-slate-50" : "relative"}
            onClick={onCartClick}
          >
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 && (
              <Badge
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs text-white border-0"
                style={{ backgroundColor: 'var(--brand-color, hsl(220, 91%, 54%))' }}
              >
                {itemCount}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      <main className={isEcommerceTheme ? "container mx-auto max-w-6xl px-4 py-8" : "container mx-auto max-w-5xl px-4 py-6"}>
        {children}
      </main>

      <footer className={isEcommerceTheme ? "mt-12 border-t border-stone-200 py-6" : "mt-12 border-t py-6"}>
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Powered by SalonMagik
        </div>
      </footer>
    </div>
  );
}
