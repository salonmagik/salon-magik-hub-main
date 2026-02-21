import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookingWizard } from "./BookingWizard";

vi.mock("@/hooks", () => ({
  useBookingCart: () => ({
    items: [
      {
        id: "item-1",
        type: "service",
        isGift: false,
      },
    ],
    getTotal: () => 100,
    getTotalDuration: () => 45,
    clearCart: vi.fn(),
    getGiftItems: () => [],
    getItemCount: () => 1,
  }),
  useDepositCalculation: () => ({
    depositAmount: 20,
  }),
}));

vi.mock("./CartStep", () => ({ CartStep: () => <div>Cart step</div> }));
vi.mock("./SchedulingStep", () => ({ SchedulingStep: () => <div>Scheduling step</div> }));
vi.mock("./BookerInfoStep", () => ({ BookerInfoStep: () => <div>Booker step</div> }));
vi.mock("./GiftRecipientsStep", () => ({ GiftRecipientsStep: () => <div>Gift recipients step</div> }));
vi.mock("./ReviewStep", () => ({ ReviewStep: () => <div>Review step</div> }));
vi.mock("./PaymentStep", () => ({ PaymentStep: () => <div>Payment step</div> }));

describe("BookingWizard", () => {
  it("renders booking flow with cart step", () => {
    render(
      <BookingWizard
        open
        onOpenChange={vi.fn()}
        salon={{ id: "tenant-1", currency: "GHS" } as never}
        locations={[{ id: "loc-1", name: "Main", city: "Accra", country: "GH" } as never]}
      />
    );

    expect(screen.getByText(/cart step/i)).toBeInTheDocument();
  });
});
