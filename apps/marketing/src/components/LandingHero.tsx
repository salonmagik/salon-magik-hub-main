import { Link } from "react-router-dom";
import { Button } from "@ui/button";
import { ArrowRight, Play } from "lucide-react";
const heroImage = "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1600&q=80";

interface LandingHeroProps {
  isWaitlistMode: boolean;
  isLoading: boolean;
  onWaitlistClick?: () => void;
}

export function LandingHero({ isWaitlistMode, isLoading, onWaitlistClick }: LandingHeroProps) {
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
            <span className="text-primary">built for beauty professionals</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
            Say goodbye to the hustle and go from 0 to 100 with a platform built for your salon. 
            Manage schedules, customers and staff. Accept payments, offer packages and vouchers, and more.
            <br className="hidden sm:block" />
            Everything you need to grow, all in one place.
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
              <Button size="lg" className="text-base" onClick={onWaitlistClick}>
                Get exclusive access
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
