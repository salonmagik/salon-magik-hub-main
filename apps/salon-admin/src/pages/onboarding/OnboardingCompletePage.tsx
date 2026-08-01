import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import type { SubscriptionPlan } from "@/components/onboarding/PlanStep";
import type { LocationInfo } from "@/components/onboarding/LocationsStep";

interface PromoPreview {
  valid: boolean;
  campaignName?: string;
  discountType?: string;
  discountValue?: number;
  billingTargets?: string[];
  campaignEndsAt?: string | null;
  expiresAt?: string | null;
}

interface OnboardingCompleteState {
  initialPlan: SubscriptionPlan;
  currency: string;
  trialDays: number;
  promoPreview: PromoPreview | null;
  chainLocations: LocationInfo[];
  businessName: string;
}

/**
 * Rendered under a plain ProtectedRoute (not OnboardingRoute) so it survives
 * hasCompletedOnboarding flipping to true from the refreshTenants() call that
 * happens right before we navigate here. OnboardingRoute would redirect away
 * before this ever painted.
 */
export default function OnboardingCompletePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as OnboardingCompleteState | null;

  if (!state) {
    return <Navigate to="/salon/overview" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F6F2] p-4">
      <WelcomeModal
        initialPlan={state.initialPlan}
        currency={state.currency}
        trialDays={state.trialDays}
        promoPreview={state.promoPreview}
        chainLocations={state.chainLocations}
        businessName={state.businessName}
        onDismiss={() => navigate("/salon/overview")}
      />
    </div>
  );
}
