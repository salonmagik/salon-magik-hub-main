import { useState } from "react";
import { useGeoInterestMode, useWaitlistMode } from "@/hooks/useFeatureFlags";
import {
  LandingNav,
  LandingHero,
  CountryLaunchStrip,
  BusinessTypes,
  FeaturesSection,
  BenefitsSection,
  CTASection,
  LandingFooter,
  WaitlistDialog,
} from "@/components";

export default function LandingPage() {
  const { isWaitlistMode, isLoading } = useWaitlistMode();
  const { isEnabled: isGeoInterestEnabled } = useGeoInterestMode();
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [geoInterestOpen, setGeoInterestOpen] = useState(false);
  const [geoInterestSource, setGeoInterestSource] = useState<"hero_cta" | "footer_cta" | "launch_section">("hero_cta");

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
      <CountryLaunchStrip
        isEnabled={isGeoInterestEnabled}
        onOpenInterest={() => {
          setGeoInterestSource("launch_section");
          setGeoInterestOpen(true);
        }}
      />
      <BusinessTypes onWaitlistClick={() => setWaitlistOpen(true)} isWaitlistMode={isWaitlistMode} />
      <FeaturesSection />
      <BenefitsSection />
      <CTASection 
        isWaitlistMode={isWaitlistMode}
        onWaitlistClick={() => setWaitlistOpen(true)}
      />
      <LandingFooter />
      
      <WaitlistDialog open={waitlistOpen} onOpenChange={setWaitlistOpen} mode="waitlist" source="footer_cta" />
      <WaitlistDialog
        open={geoInterestOpen}
        onOpenChange={setGeoInterestOpen}
        mode="interest"
        source={geoInterestSource}
      />
    </div>
  );
}
