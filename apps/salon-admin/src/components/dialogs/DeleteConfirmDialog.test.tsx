import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

describe("DeleteConfirmDialog", () => {
  it("requires the exact item name before enabling deletion", () => {
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        itemName="Boho Braids"
        onConfirm={onConfirm}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    const confirmationInput = screen.getByLabelText(/type boho braids to confirm/i);

    expect(deleteButton).toBeDisabled();

    fireEvent.change(confirmationInput, { target: { value: "Boho braid" } });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(confirmationInput, { target: { value: "Boho Braids" } });
    expect(deleteButton).toBeEnabled();

    fireEvent.click(deleteButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
