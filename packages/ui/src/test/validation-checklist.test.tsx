import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValidationChecklist } from "../ui/validation-checklist";

describe("ValidationChecklist", () => {
  it("renders password requirement items", () => {
    render(
      <ValidationChecklist
        items={[
          { label: "At least 8 characters", passed: true },
          { label: "One number", passed: false },
        ]}
      />
    );

    expect(screen.getByText(/password requirements/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/one number/i)).toBeInTheDocument();
  });
});
