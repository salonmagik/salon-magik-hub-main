import { ReactNode } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBookingCart, type PublicTenant } from "@/hooks/booking";

interface BookingLayoutProps {
  children: ReactNode;
  salon?: PublicTenant | null;
  onCartClick: () => void;
  cartCount?: number;
}

export function BookingLayout({ children, salon, onCartClick }: BookingLayoutProps) {
  const { getItemCount } = useBookingCart();
  const itemCount = getItemCount();
  const brandColor = salon?.brand_color || "#2563EB";

  return (
    <div
      className="min-h-screen bg-background"
      style={{ "--brand-color": brandColor } as React.CSSProperties}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
          </div>

          <Button
            variant="outline"
            size="icon"
            className="relative"
            onClick={onCartClick}
          >
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 && (
              <Badge
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                variant="default"
              >
                {itemCount}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-5xl">{children}</main>

      {/* Footer */}
      <footer className="border-t py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Powered by SalonMagik
        </div>
      </footer>
    </div>
  );
}
