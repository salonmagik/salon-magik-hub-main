import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ForcePasswordChangeDialog } from "./ForcePasswordChangeDialog";

vi.mock("@ui/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("ForcePasswordChangeDialog", () => {
  it("keeps submit disabled until passwords are valid and matching", () => {
    render(<ForcePasswordChangeDialog open onPasswordChanged={vi.fn()} />);

    const submit = screen.getByRole("button", { name: /set password/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "ValidPass1!" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "ValidPass1!" },
    });

    expect(submit).toBeEnabled();
  });
});
