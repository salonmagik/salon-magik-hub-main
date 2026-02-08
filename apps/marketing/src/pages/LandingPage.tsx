import { useState } from "react";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import {
  LandingNav,
  LandingHero,
  BusinessTypes,
  FeaturesSection,
  BenefitsSection,
  CTASection,
  LandingFooter,
  WaitlistDialog,
} from "@/components";

export default function LandingPage() {
  const { isWaitlistMode, isLoading } = useWaitlistMode();
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <LandingNav 
        isWaitlistMode={isWaitlistMode} 
        isLoading={isLoading} 
        onWaitlistClick={() => setWaitlistOpen(true)}
      />
      <LandingHero 
        isWaitlistMode={isWaitlistMode} 
        isLoading={isLoading}
        onWaitlistClick={() => setWaitlistOpen(true)}
      />
      <BusinessTypes onWaitlistClick={() => setWaitlistOpen(true)} isWaitlistMode={isWaitlistMode} />
      <FeaturesSection />
      <BenefitsSection />
      <CTASection 
        isWaitlistMode={isWaitlistMode}
        onWaitlistClick={() => setWaitlistOpen(true)}
      />
      <LandingFooter />
      
      <WaitlistDialog open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
