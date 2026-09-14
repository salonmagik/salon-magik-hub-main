import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import { useStaffInvitations, type StaffInvitation } from "./useStaffInvitations";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const { orderMock, eqMock, selectMock, fromMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const eqMock = vi.fn(() => ({ order: orderMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { orderMock, eqMock, selectMock, fromMock };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

const mockedUseAuth = vi.mocked(useAuth);

function baseInvitation(overrides: Partial<StaffInvitation>): StaffInvitation {
  return {
    id: "inv-1",
    tenant_id: "tenant-1",
    email: "person@example.com",
    first_name: "Ama",
    last_name: "Mensah",
    phone: null,
    role: "staff",
    token: "token-1",
    status: "pending",
    invited_by_id: "owner-1",
    accepted_at: null,
    expires_at: "2026-12-31T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    last_resent_at: null,
    resend_count: 0,
    invited_via: "staff_module",
    temp_password: null,
    temp_password_used: false,
    password_changed_at: null,
    ...overrides,
  };
}

describe("useStaffInvitations", () => {
  it("excludes role='owner' rows from every derived list", async () => {
    mockedUseAuth.mockReturnValue({ currentTenant: { id: "tenant-1" } } as unknown as ReturnType<typeof useAuth>);
    orderMock.mockResolvedValue({
      data: [
        baseInvitation({ id: "staff-inv", role: "staff", status: "pending" }),
        baseInvitation({ id: "owner-inv", role: "owner", status: "pending" }),
        baseInvitation({ id: "owner-accepted", role: "owner", status: "accepted", accepted_at: "2026-09-05T00:00:00Z" }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useStaffInvitations());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.invitations.map((i) => i.id)).toEqual(["staff-inv"]);
    expect(result.current.pendingInvitations.map((i) => i.id)).toEqual(["staff-inv"]);
    expect(result.current.acceptedInvitations.map((i) => i.id)).toEqual([]);
    expect(result.current.expiredInvitations.map((i) => i.id)).toEqual([]);
  });
});
