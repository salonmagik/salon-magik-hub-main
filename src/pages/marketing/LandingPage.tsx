import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import {
  LandingNav,
  LandingHero,
  StatsBar,
  BusinessTypes,
  FeaturesSection,
  TestimonialsSection,
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
      <StatsBar />
      <BusinessTypes isWaitlistMode={isWaitlistMode} />
      <FeaturesSection />
      <TestimonialsSection />
      <BenefitsSection />
      <CTASection isWaitlistMode={isWaitlistMode} />
      <LandingFooter />
    </div>
  );
}
