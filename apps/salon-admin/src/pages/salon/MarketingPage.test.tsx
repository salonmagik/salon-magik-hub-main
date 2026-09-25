import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingPage from "./MarketingPage";
import { LegacyMarketingRedirect } from "@/components/marketing/LegacyMarketingRedirect";

const fixture = vi.hoisted(() => ({
  customers: ["Ama Owusu", "Kojo Mensah"].map((full_name, i) => ({ id: String(i), full_name, email: `${i}@example.test`, phone: `+23324000000${i}`, country: "GH", status: "active", created_at: "2026-01-01", last_visit_at: "2026-09-20" })),
  tenant: { id: "salon", name: "Bright Cuts Group", country: "GH", plan: "solo" },
  segments: { "0": { is_vip: true }, "1": { is_vip: true } },
  invoke: vi.fn(), refetch: vi.fn().mockResolvedValue(undefined), empty: [],
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ currentTenant: fixture.tenant, user: { id: "owner" }, activeContextType: "tenant", activeLocationId: null }) }));
vi.mock("@/hooks/useCustomers", () => ({ useCustomers: () => ({ customers: fixture.customers, isLoading: false, error: null }) }));
vi.mock("@/hooks/useCustomerSegments", () => ({ useCustomerSegments: () => ({ segments: fixture.segments, isLoading: false, error: null }) }));
vi.mock("@/hooks/useMessagingCredits", () => ({ useMessagingCredits: () => ({ credits: { balance: 340 }, stats: { creditsRemaining: 340, emailsSentThisMonth: 612 }, messageLogs: fixture.empty, isLoading: false, error: null, refetch: fixture.refetch }) }));
vi.mock("@/hooks/useEmailTemplates", () => ({ useEmailTemplates: () => ({ templates: fixture.empty, isLoading: false, refetch: fixture.refetch }), templateTypeLabels: {} }));
vi.mock("@/hooks/useSMSTemplates", () => ({ useSMSTemplates: () => ({ templates: fixture.empty, isLoading: false, refetch: fixture.refetch }), smsTemplateTypeLabels: {} }));
vi.mock("@/hooks/useWalkthroughAutoTrigger", () => ({ useWalkthroughAutoTrigger: () => undefined }));
vi.mock("@/components/layout/SalonSidebar", () => ({ SalonSidebar: ({ children }: { children: ReactNode }) => <>{children}</>, MobileQuickActionEffect: () => null }));
vi.mock("@/components/dialogs/EditTemplateDialog", () => ({ EditTemplateDialog: () => null }));
vi.mock("@/components/messaging/EditSMSTemplateDialog", () => ({ EditSMSTemplateDialog: () => null }));
vi.mock("@/components/billing/CreditPurchaseDialog", () => ({ CreditPurchaseDialog: () => null }));
vi.mock("@/components/PaymentSuccessModal", () => ({ PaymentSuccessModal: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: (table: string) => {
    const result = { data: table === "broadcast_drafts" ? null : [], error: null };
    const chain = { select: () => chain, eq: () => chain, not: () => chain, gt: () => chain, order: () => chain, maybeSingle: () => Promise.resolve(result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return chain;
  }, functions: { invoke: fixture.invoke },
} }));
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<MemoryRouter><QueryClientProvider client={client}><MarketingPage /></QueryClientProvider></MemoryRouter>);
}
async function selectEmail() {
  fireEvent.click(await screen.findByRole("button", { name: "VIP · 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Email Included with your plan" }));
}
beforeEach(() => {
  fixture.segments["0"].is_vip = true;
  fixture.segments["1"].is_vip = true;
  fixture.invoke.mockReset();
  fixture.invoke.mockResolvedValue({ data: { sent: 2, failed: 0, creditsUsed: 0 }, error: null });
});
describe("Marketing broadcast flow", () => {
  it("disables and does not select a zero-count segment", async () => {
    fixture.segments["0"].is_vip = false;
    fixture.segments["1"].is_vip = false;
    renderPage();

    const vip = await screen.findByRole("button", { name: "VIP · 0" });
    expect(vip).toBeDisabled();
    fireEvent.click(vip);
    expect(screen.queryByRole("heading", { name: "How should we reach them?" })).not.toBeInTheDocument();
  });

  it("leaves both channels blank until the user explicitly picks a template", async () => {
    renderPage(); await selectEmail();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Subject line" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send to 2 customers" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /How should we reach them/ }));
    fireEvent.click(screen.getByRole("button", { name: "SMS Uses credits" }));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Holiday hours" }));
    expect((screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).value).toContain("opening hours");
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it("preserves written text when navigating the steps or changing channels", async () => {
    renderPage(); await selectEmail();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Our salon opens at 10 tomorrow." } });
    fireEvent.click(screen.getByRole("button", { name: /How should we reach them/ }));
    fireEvent.click(screen.getByRole("button", { name: "SMS Uses credits" }));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Our salon opens at 10 tomorrow.");
  });
  it("previews without sending and sends only from the explicit final action", async () => {
    renderPage(); await selectEmail();
    fireEvent.change(screen.getByRole("textbox", { name: "Subject line" }), { target: { value: "Holiday opening hours" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "We open at 10 tomorrow." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = screen.getByRole("dialog");
    expect(within(preview).getByText("Holiday opening hours")).toBeInTheDocument();
    expect(within(preview).getByText("We open at 10 tomorrow.")).toBeInTheDocument();
    expect(fixture.invoke).not.toHaveBeenCalled();
    const send = within(preview).getByRole("button", { name: "Send message" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    await waitFor(() => expect(fixture.invoke).toHaveBeenCalledTimes(1));
    expect(fixture.invoke).toHaveBeenCalledWith("send-bulk-message", { body: expect.objectContaining({ customerIds: ["0", "1"], channel: "email", subject: "Holiday opening hours", message: "We open at 10 tomorrow." }) });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Sent to 2 customers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Broadcast sent" })).toBeDisabled();
  });
});


it("redirects old marketing links while preserving payment and audience context", async () => {
  function Destination() {
    const location = useLocation();
    return <output>{JSON.stringify({ path: location.pathname, search: location.search, hash: location.hash, state: location.state })}</output>;
  }
  render(<MemoryRouter initialEntries={[{ pathname: "/salon/messaging", search: "?purchase=success&reference=payment-123", hash: "#history", state: { lapsedClientIds: ["0"] } }]}><Routes><Route path="/salon/messaging" element={<LegacyMarketingRedirect />} /><Route path="/salon/marketing" element={<Destination />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(JSON.stringify({ path: "/salon/marketing", search: "?purchase=success&reference=payment-123", hash: "#history", state: { lapsedClientIds: ["0"] } })));
});
