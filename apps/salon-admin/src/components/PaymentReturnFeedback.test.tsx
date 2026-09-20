import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PaymentReturnFeedback } from "./PaymentReturnFeedback";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));
function Location() { return <span data-testid="location">{useLocation().search}</span>; }
function setup(url = "/salon/subscription?subscription=success&reference=payment-123", tenantId: string | undefined = "salon-1", refresh = vi.fn().mockResolvedValue(undefined)) {
  return render(<MemoryRouter initialEntries={[url]}><PaymentReturnFeedback tenantId={tenantId} refresh={refresh} /><Location /></MemoryRouter>);
}
beforeEach(() => { invoke.mockReset(); });
afterEach(() => { vi.useRealTimers(); });
describe("payment return feedback", () => {
  it("shows loading immediately and waits for server confirmation and refreshed context", async () => {
    let resolve!: (value: unknown) => void;
    invoke.mockReturnValue(new Promise((done) => { resolve = done; }));
    setup();
    expect(screen.getByRole("dialog")).toHaveTextContent("Payment is being verified");
    expect(screen.queryByText("Subscription activated!")).not.toBeInTheDocument();
    await act(async () => resolve({ data: { activated: true }, error: null }));
    expect(await screen.findByText("Subscription activated!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("");
  });
  it("keeps an uncertain payment visible and retries verification, not checkout", async () => {
    invoke.mockResolvedValueOnce({ error: new Error("network") }).mockResolvedValueOnce({ data: { activated: true }, error: null });
    setup();
    expect(await screen.findByText("We couldn’t confirm your payment")).toBeInTheDocument();
    expect(screen.getByText("payment-123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check payment again" }));
    expect(await screen.findByText("Subscription activated!")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.every(([endpoint]) => endpoint === "verify-subscription-payment")).toBe(true);
  });
  it("does not celebrate a return URL without a reference", async () => {
    setup("/salon/subscription?subscription=success");
    expect(await screen.findByText("We couldn’t confirm your payment")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Check payment again" })).not.toBeInTheDocument();
  });
  it("does not treat an unconfirmed successful HTTP response as activated", async () => {
    invoke.mockResolvedValue({ data: { activated: false }, error: null });
    setup();
    expect(await screen.findByText("We couldn’t confirm your payment")).toBeInTheDocument();
  });
  it("handles rejected verification promises", async () => {
    invoke.mockRejectedValue(new Error("offline"));
    setup();
    expect(await screen.findByText("We couldn’t confirm your payment")).toBeInTheDocument();
  });
  it("shows cancellation without asserting no charge occurred", () => {
    setup("/salon/subscription?subscription=cancelled");
    expect(screen.getByText("Checkout cancelled")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("uses the plan-configuration verifier for upgrade returns", async () => {
    invoke.mockResolvedValue({ data: { applied: true }, error: null });
    setup("/salon/subscription?planconfig=success&trxref=upgrade-123");
    expect(await screen.findByText("Your plan is updated!")).toBeInTheDocument();
    expect(invoke.mock.calls[0][0]).toBe("verify-plan-configuration-payment");
  });
  it("times out instead of leaving the user in an indefinite spinner", async () => {
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    setup();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("We couldn’t confirm your payment")).toBeInTheDocument();
  });
});
