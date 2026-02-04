import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import {
  LandingNav,
  LandingHero,
  BusinessTypes,
  FeaturesSection,
  BenefitsSection,
  CTASection,
  LandingFooter,
} from "@/components/landing";

export default function LandingPage() {
  const { isWaitlistMode, isLoading } = useWaitlistMode();

  return (
    <div className="min-h-screen bg-background">
      <LandingNav isWaitlistMode={isWaitlistMode} isLoading={isLoading} />
      <LandingHero isWaitlistMode={isWaitlistMode} isLoading={isLoading} />
      <BusinessTypes isWaitlistMode={isWaitlistMode} />
      <FeaturesSection />
      <BenefitsSection />
      <CTASection isWaitlistMode={isWaitlistMode} />
      <LandingFooter />
    </div>
  );
}
