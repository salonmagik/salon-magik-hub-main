import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OnboardingPage from "./OnboardingPage";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 14 }),
}));

vi.mock("@ui/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "owner@example.com", user_metadata: { full_name: "Owner" } },
    refreshTenants: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePlans", () => ({
  usePlans: () => ({
    data: [{ id: "plan-chain", slug: "chain" }, { id: "plan-studio", slug: "studio" }],
  }),
}));

vi.mock("@/hooks/useAdditionalLocationPricing", () => ({
  useChainPriceQuote: () => ({
    data: {
      total_price: 300,
      requires_custom: true,
      breakdown: [{ tier_label: "11+", locations: 1, subtotal: null }],
    },
  }),
}));

vi.mock("@/components/onboarding/RoleStep", () => ({
  RoleStep: ({ onRoleSelect }: { onRoleSelect: (role: "owner") => void }) => (
    <button onClick={() => onRoleSelect("owner")}>Pick Owner</button>
  ),
}));

vi.mock("@/components/onboarding/BusinessStep", () => ({
  BusinessStep: ({ onChange }: { onChange: (value: any) => void }) => (
    <button
      onClick={() =>
        onChange({
          name: "Salon",
          country: "GH",
          currency: "GHS",
          city: "Accra",
          address: "Street",
          timezone: "Africa/Accra",
          openingTime: "09:00:00",
          closingTime: "18:00:00",
          openingDays: ["monday"],
        })
      }
    >
      Fill Business
    </button>
  ),
}));

vi.mock("@/components/onboarding/PlanStep", () => ({
  PlanStep: ({ onPlanSelect }: { onPlanSelect: (plan: "chain") => void }) => (
    <button onClick={() => onPlanSelect("chain")}>Pick Chain</button>
  ),
}));

vi.mock("@/components/onboarding/OwnerInviteStep", () => ({ OwnerInviteStep: () => <div>Owner Invite</div> }));
vi.mock("@/components/onboarding/LocationsStep", () => ({ LocationsStep: () => <div>Locations</div> }));
vi.mock("@/components/onboarding/ReviewStep", () => ({ ReviewStep: () => <div>Review</div> }));
vi.mock("@/components/SalonMagikLogo", () => ({ SalonMagikLogo: () => <div>Logo</div> }));
vi.mock("@/hooks/usePermissions", () => ({ seedDefaultPermissions: vi.fn() }));
vi.mock("@/hooks/usePlanPricing", () => ({ getCurrencyForCountry: () => "GHS" }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

describe("OnboardingPage", () => {
  it("shows chain expected locations input on plan step", () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("button", { name: /pick owner/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /fill business/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /pick chain/i }));
    expect(screen.getByLabelText(/expected total locations now/i)).toBeInTheDocument();
  });
});
