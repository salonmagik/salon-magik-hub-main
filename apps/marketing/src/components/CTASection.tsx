import { Link } from "react-router-dom";
import { Button } from "@ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

interface CTASectionProps {
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
}

export function CTASection({ isWaitlistMode, onWaitlistClick }: CTASectionProps) {
  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-semibold mb-4">
          {isWaitlistMode ? "Be among the first" : "Ready to grow your business?"}
        </h2>
        <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
          {isWaitlistMode
            ? "We're currently in private beta. Get exclusive early access and special launch pricing."
            : "Start your 14-day free trial today. No credit card required. Set up your salon in minutes."}
        </p>
        
        {isWaitlistMode ? (
          <Button size="lg" onClick={onWaitlistClick}>
            <Sparkles className="mr-2 w-4 h-4" />
            Get exclusive access
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup">
              <Button size="lg">
                Get started free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline" size="lg">
                See pricing
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
