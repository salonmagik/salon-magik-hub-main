import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SubscriptionLedgerPage from "./SubscriptionLedgerPage";

vi.mock("@/components/BackofficeLayout", () => ({
  BackofficeLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks", () => ({
  useSubscriptionLedger: () => ({
    data: [
      {
        tenant_id: "t-cancel-pending",
        tenant_name: "Cancel Pending Salon",
        country: "GH",
        plan: "studio",
        subscription_status: "active",
        next_billing_at: "2026-10-05T00:00:00Z",
        currency: "GHS",
        base_mrr: 100,
        addon_mrr: 0,
        addon_breakdown: null,
        comms_balance: 5,
        comms_last_purchase_at: null,
        comms_last_purchase_amount: null,
        comms_last_purchase_currency: null,
        subscription_cancel_at: "2026-10-05T00:00:00Z",
        cancellation_reason: "too_expensive",
        cancellation_reason_note: "will miss you",
        cancellation_requested_by_email: "owner@test.local",
        cancellation_requested_at: "2026-09-01T00:00:00Z",
        billing_grace_ends_at: null,
        suspended_at: null,
        billing_retry_count: 0,
      },
      {
        tenant_id: "t-suspended",
        tenant_name: "Suspended Salon",
        country: "NG",
        plan: "solo",
        subscription_status: "suspended",
        next_billing_at: null,
        currency: "NGN",
        base_mrr: 50,
        addon_mrr: 0,
        addon_breakdown: null,
        comms_balance: 0,
        comms_last_purchase_at: null,
        comms_last_purchase_amount: null,
        comms_last_purchase_currency: null,
        subscription_cancel_at: null,
        cancellation_reason: null,
        cancellation_reason_note: null,
        cancellation_requested_by_email: null,
        cancellation_requested_at: null,
        billing_grace_ends_at: null,
        suspended_at: "2026-08-20T00:00:00Z",
        billing_retry_count: 3,
      },
    ],
    isLoading: false,
  }),
  useTenantBillingActivity: () => ({ data: [], isLoading: false }),
}));

describe("SubscriptionLedgerPage", () => {
  it("renders a cancellation-pending row with a distinct label", () => {
    render(<SubscriptionLedgerPage />);
    expect(screen.getByText("Cancel Pending Salon")).toBeInTheDocument();
    expect(screen.getByText("cancellation pending")).toBeInTheDocument();
  });

  it("renders a suspended row with a distinct status label", () => {
    render(<SubscriptionLedgerPage />);
    expect(screen.getByText("Suspended Salon")).toBeInTheDocument();
    expect(screen.getByText("suspended")).toBeInTheDocument();
  });

  it("shows cancellation reason, requester and timestamps in the tenant drawer", () => {
    render(<SubscriptionLedgerPage />);
    fireEvent.click(screen.getByText("Cancel Pending Salon"));

    expect(screen.getByText(/Cancellation pending — access until/)).toBeInTheDocument();
    expect(screen.getByText(/too expensive/)).toBeInTheDocument();
    expect(screen.getByText(/will miss you/)).toBeInTheDocument();
    expect(screen.getByText(/Requested by owner@test\.local/)).toBeInTheDocument();
  });

  it("shows the suspended timestamp in the tenant drawer", () => {
    render(<SubscriptionLedgerPage />);
    fireEvent.click(screen.getByText("Suspended Salon"));

    expect(screen.getByText(/Suspended since/)).toBeInTheDocument();
  });
});
