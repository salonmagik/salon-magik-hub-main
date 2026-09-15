import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "./NotificationsPanel";
import type { Notification } from "@/hooks/useNotifications";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    activeContextType: "location",
    setActiveContext: vi.fn(),
    assignedLocationIds: [],
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

const systemSettingsNotification: Notification = {
  id: "notif-1",
  tenant_id: "tenant-1",
  user_id: null,
  type: "system",
  title: "Appointment reminders are now on",
  description: "Your customers now get an email reminder before their appointment.",
  read: false,
  urgent: false,
  is_gifted: false,
  entity_type: "notification_settings",
  entity_id: null,
  created_at: "2026-09-15T00:00:00.000Z",
};

function renderPanel(notifications: Notification[]) {
  return render(
    <NotificationsPanel
      open
      onOpenChange={vi.fn()}
      notificationsData={{
        notifications,
        isLoading: false,
        markAsRead: vi.fn().mockResolvedValue(undefined),
        markAllAsRead: vi.fn().mockResolvedValue(undefined),
        refetch: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}
    />,
  );
}

describe("NotificationsPanel", () => {
  it("routes a notification_settings system notice to the notifications settings tab", async () => {
    renderPanel([systemSettingsNotification]);

    fireEvent.click(screen.getByText(systemSettingsNotification.title));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/salon/settings?tab=notifications"),
    );
  });
});
