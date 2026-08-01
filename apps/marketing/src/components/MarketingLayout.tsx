import { type ReactNode } from "react";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import { LandingNav } from "./LandingNav";
import { LandingFooter } from "./LandingFooter";
import { useWaitlist } from "./WaitlistProvider";

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { isWaitlistMode, isLoading } = useWaitlistMode();
  const { openWaitlist } = useWaitlist();
  return (
    <div className="min-h-screen bg-brand-cream">
      <LandingNav
        isWaitlistMode={isWaitlistMode}
        isLoading={isLoading}
        onWaitlistClick={openWaitlist}
      />
      {children}
      <LandingFooter />
    </div>
  );
}
