import { Link } from "react-router-dom";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@/components/ui/button";

interface LandingNavProps {
  isWaitlistMode: boolean;
  isLoading: boolean;
  onWaitlistClick?: () => void;
}

export function LandingNav({ isWaitlistMode, isLoading, onWaitlistClick }: LandingNavProps) {
  return (
    <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <SalonMagikLogo size="md" />
        <div className="flex items-center gap-4">
          <Link to="/pricing">
            <Button variant="ghost" size="sm">
              Pricing
            </Button>
          </Link>
          {!isLoading && !isWaitlistMode && (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
          {!isLoading && isWaitlistMode && (
            <Button size="sm" onClick={onWaitlistClick}>
              Exclusive access
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
