import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerDetailDialog } from "./CustomerDetailDialog";

vi.mock("@ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ currentTenant: { id: "tenant-1" } }),
}));

vi.mock("@/hooks/useCustomerPurse", () => ({
  useCustomerPurse: () => ({
    purse: null,
    fetchPurseTransactions: vi.fn().mockResolvedValue([]),
    fetchAllCustomerTransactions: vi.fn().mockResolvedValue([]),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useAppointments", () => ({
  useAppointments: () => ({
    appointments: [],
    isLoading: false,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: null,
    isLoading: false,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    })),
  },
}));

describe("CustomerDetailDialog", () => {
  it("renders customer details without hook-order errors", async () => {
    render(
      <CustomerDetailDialog
        open
        onOpenChange={vi.fn()}
        customer={{
          id: "customer-1",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+233000000000",
          created_at: "2026-01-01T00:00:00.000Z",
        } as never}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
    });
  });
});
