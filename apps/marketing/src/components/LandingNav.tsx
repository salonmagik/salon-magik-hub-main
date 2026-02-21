import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@ui/button";

interface LandingNavProps {
  isWaitlistMode: boolean;
  isLoading: boolean;
  onWaitlistClick?: () => void;
}

export function LandingNav({ isWaitlistMode, isLoading, onWaitlistClick }: LandingNavProps) {
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || "https://app.salonmagik.com").replace(/\/$/, "");

  return (
    <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
        {/* Responsive logo: xs on mobile, sm on desktop */}
        <div className="sm:hidden">
          <SalonMagikLogo size="xs" />
        </div>
        <div className="hidden sm:block">
          <SalonMagikLogo size="sm" />
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <Link to="/pricing">
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm px-2 sm:px-4">
              Pricing
            </Button>
          </Link>
          {!isLoading && !isWaitlistMode && (
            <>
              <a href={`${salonAppUrl}/login`} className="hidden sm:block">
                <Button variant="ghost" size="sm" className="text-sm">
                  Log in
                </Button>
              </a>
              <a href={`${salonAppUrl}/signup`}>
                <Button size="sm" className="text-xs sm:text-sm px-3 sm:px-4">
                  Get started
                </Button>
              </a>
            </>
          )}
          {!isLoading && isWaitlistMode && (
            <Button size="sm" onClick={onWaitlistClick} className="text-xs sm:text-sm px-3 sm:px-4">
              Exclusive access
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
