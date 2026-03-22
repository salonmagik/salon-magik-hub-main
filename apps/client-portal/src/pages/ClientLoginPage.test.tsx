import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClientLoginPage from "./ClientLoginPage";

const signInWithOtpMock = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      verifyOtp: vi.fn(),
    },
  },
}));

vi.mock("@ui/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ClientLoginPage", () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
  });

  it("validates identifier before continuing", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <ClientLoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/please enter your email or phone number/i)).toBeInTheDocument();
  });

  it("advances to OTP step for valid email", async () => {
    signInWithOtpMock.mockResolvedValue({ error: null });
    render(
      <MemoryRouter future={routerFuture}>
        <ClientLoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/enter your email or phone number/i), {
      target: { value: "client@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("button", { name: /verify code/i })).toBeInTheDocument();
  });
});
