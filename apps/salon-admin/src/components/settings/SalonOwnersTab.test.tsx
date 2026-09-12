import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SalonOwnersTab } from "./SalonOwnersTab";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedRpc = vi.mocked(supabase.rpc);

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SalonOwnersTab />
    </QueryClientProvider>,
  );
}

describe("SalonOwnersTab", () => {
  it("renders two owners with name and email and no ranking", async () => {
    mockedUseAuth.mockReturnValue({ currentTenant: { id: "tenant-1" } } as any);
    mockedRpc.mockResolvedValue({
      data: [
        { user_id: "u1", full_name: "Ama Mensah", email: "ama@example.com", granted_at: "2026-01-01T00:00:00Z" },
        { user_id: "u2", full_name: "Kofi Osei", email: "kofi@example.com", granted_at: "2026-02-01T00:00:00Z" },
      ],
      error: null,
    } as any);

    renderTab();

    expect(await screen.findByText("Ama Mensah")).toBeInTheDocument();
    expect(screen.getByText("Kofi Osei")).toBeInTheDocument();
    expect(screen.getByText("ama@example.com")).toBeInTheDocument();
    expect(screen.getByText("kofi@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/primary owner|1st owner|2nd owner/i)).not.toBeInTheDocument();
  });

  it("renders the access message on OWNER_ACCESS_DENIED", async () => {
    mockedUseAuth.mockReturnValue({ currentTenant: { id: "tenant-1" } } as any);
    mockedRpc.mockResolvedValue({ data: null, error: { message: "OWNER_ACCESS_DENIED" } } as any);

    renderTab();

    await waitFor(() => {
      expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    });
  });
});
