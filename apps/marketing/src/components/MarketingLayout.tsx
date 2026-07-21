import { type ReactNode } from "react";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import { LandingNav } from "./LandingNav";
import { LandingFooter } from "./LandingFooter";

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { isWaitlistMode, isLoading } = useWaitlistMode();
  return (
    <div className="min-h-screen bg-brand-cream">
      <LandingNav isWaitlistMode={isWaitlistMode} isLoading={isLoading} />
      {children}
      <LandingFooter />
    </div>
  );
}
