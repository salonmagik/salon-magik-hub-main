import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackofficeLayout } from "./BackofficeLayout";
import { useBackofficeAuth, useBlockedRefundsCount } from "@/hooks";

vi.mock("@/hooks", () => ({
  useBackofficeAuth: vi.fn(),
  useBlockedRefundsCount: vi.fn(),
}));

vi.mock("@/components/session/InactivityGuard", () => ({
  InactivityGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/BackofficeOnboardingGate", () => ({
  BackofficeOnboardingGate: () => null,
}));

const mockedUseBackofficeAuth = vi.mocked(useBackofficeAuth);
const mockedUseBlockedRefundsCount = vi.mocked(useBlockedRefundsCount);

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/transactions"]}>
      <BackofficeLayout>
        <div>content</div>
      </BackofficeLayout>
    </MemoryRouter>,
  );
}

describe("BackofficeLayout — blocked refunds nav badge", () => {
  beforeEach(() => {
    mockedUseBackofficeAuth.mockReturnValue({
      profile: { full_name: "Test Admin" },
      backofficeUser: { role: "super_admin", is_sales_agent: false },
      signOut: vi.fn(),
      hasBackofficePageAccess: () => true,
      hasBackofficePermission: () => true,
    } as unknown as ReturnType<typeof useBackofficeAuth>);
  });

  it("renders the unresolved count on the Transactions nav entry", () => {
    mockedUseBlockedRefundsCount.mockReturnValue({ data: 4 } as unknown as ReturnType<typeof useBlockedRefundsCount>);
    renderLayout();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows no badge when there are no blocked refunds", () => {
    mockedUseBlockedRefundsCount.mockReturnValue({ data: 0 } as unknown as ReturnType<typeof useBlockedRefundsCount>);
    renderLayout();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
