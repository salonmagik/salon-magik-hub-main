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

  it("disables continue until a valid email is entered", () => {
    render(
      <MemoryRouter future={routerFuture}>
        <ClientLoginPage />
      </MemoryRouter>
    );

    // Email tab is active by default — Continue stays disabled rather than
    // letting an empty/invalid submit through and showing a post-hoc error.
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
      target: { value: "not-an-email" },
    });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
      target: { value: "client@example.com" },
    });
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
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
      })
      .mockResolvedValueOnce({
        data: { verificationType: "email" },
        error: null,
      });
    render(
      <MemoryRouter future={routerFuture}>
        <ClientLoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
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

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
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

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
      target: { value: "missing@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/no account was found/i)).toBeInTheDocument();
  });
});
