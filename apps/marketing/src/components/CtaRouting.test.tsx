import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CTASection } from "./CTASection";
import { LandingHero } from "./LandingHero";
import { LandingNav } from "./LandingNav";

const usePlansMock = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

vi.mock("@/hooks", () => ({
  usePlans: () => usePlansMock(),
}));

describe("marketing CTA routing", () => {
  beforeEach(() => {
    usePlansMock.mockReturnValue({ data: [{ is_recommended: true, trial_days: 14 }] });
  });

  it("uses configured salon app URL override for login and signup links", () => {
    vi.stubEnv("VITE_SALON_APP_URL", "https://preview.salonmagik.app");

    const { unmount } = render(
      <MemoryRouter future={routerFuture}>
        <LandingNav isLoading={false} isWaitlistMode={false} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "https://preview.salonmagik.app/login"
    );
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute(
      "href",
      "https://preview.salonmagik.app/signup"
    );

    unmount();
    vi.unstubAllEnvs();
  });

  it("applies the same override on hero and CTA section", () => {
    vi.stubEnv("VITE_SALON_APP_URL", "https://preview.salonmagik.app");

    render(
      <MemoryRouter future={routerFuture}>
        <LandingHero isLoading={false} isWaitlistMode={false} />
        <CTASection isWaitlistMode={false} />
      </MemoryRouter>
    );

    const signupLinks = screen.getAllByRole("link", { name: /get started free/i });
    expect(signupLinks).toHaveLength(2);
    signupLinks.forEach((link) =>
      expect(link).toHaveAttribute("href", "https://preview.salonmagik.app/signup")
    );

    vi.unstubAllEnvs();
  });
});
