import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClientLoginPage from "./ClientLoginPage";

const signInWithOtpMock = vi.fn();
const invokeMock = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      verifyOtp: vi.fn(),
    },
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@ui/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ClientLoginPage", () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
    invokeMock.mockReset();
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
    invokeMock
      .mockResolvedValueOnce({
        data: {
          exists: true,
          identifier: "client@example.com",
          identifierType: "email",
          hasPassword: false,
          requiresOtp: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { allowed: true, retryAt: new Date(Date.now() + 60_000).toISOString() },
        error: null,
      });
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

  it("shows password step when the account already has a password", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        exists: true,
        identifier: "client@example.com",
        identifierType: "email",
        hasPassword: true,
        requiresOtp: false,
      },
      error: null,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <ClientLoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/enter your email or phone number/i), {
      target: { value: "client@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows the missing account message when no customer record is found", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        exists: false,
        identifierType: "email",
        hasPassword: false,
        requiresOtp: false,
      },
      error: null,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <ClientLoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/enter your email or phone number/i), {
      target: { value: "missing@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/no customer account was found/i)).toBeInTheDocument();
  });
});
