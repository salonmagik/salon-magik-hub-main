import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import heroImage from "@/assets/landing/salon-hero.jpg";

interface LandingHeroProps {
  isWaitlistMode: boolean;
  isLoading: boolean;
}

export function LandingHero({ isWaitlistMode, isLoading }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Professional hairstylist working in a modern salon"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/60" />
      </div>

      {/* Content */}
      <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-32">
        <div className="max-w-2xl space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight">
            The booking software{" "}
            <span className="text-primary">built for Africa</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-lg">
            Run your salon, spa, or barbershop with one simple platform. 
            Bookings, payments, and customer management — all in one place.
          </p>

          {!isLoading && !isWaitlistMode && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Link to="/signup">
                <Button size="lg" className="w-full sm:w-auto text-base">
                  Get started free
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base bg-card/80 backdrop-blur-sm">
                <Play className="mr-2 w-4 h-4" />
                Watch demo
              </Button>
            </div>
          )}

          {!isLoading && isWaitlistMode && (
            <div className="pt-4">
              <Link to="#waitlist">
                <Button size="lg" className="text-base">
                  Join the waitlist
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
