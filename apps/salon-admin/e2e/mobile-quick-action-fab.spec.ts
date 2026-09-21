import { test, expect } from "@playwright/test";
import { installSupabaseMocks, seedSession, makeTenant, OWNER_USER } from "./mock-supabase";

// A "+" used to float above the bottom nav on some pages (Appointments,
// Customers, Staff, Services, Cashflow, Messaging, the Business Hub
// overview) with their own action(s), while every page also carried a
// second, unrelated "+" in the mobile header for the global Quick Create
// dialog. Both are now one FAB: a page registers its own action(s) via
// SalonSidebar's setMobileQuickAction, and a page that registers nothing —
// like the dashboard this test loads — falls back to that same Quick
// Create dialog instead of doing nothing.
test("the mobile quick-action FAB falls back to Quick Create on a page with no registered action", async ({ page }) => {
  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant(),
  });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/salon");

  // The old always-visible mobile header icon is gone — the FAB is the only "+".
  await expect(page.locator('[data-tour-id="tour-quick-create-mobile"]')).toHaveCount(1);
  await expect(page.locator('header [data-tour-id="tour-quick-create-mobile"]')).toHaveCount(0);

  const fab = page.locator('[data-tour-id="tour-quick-create-mobile"]');
  await fab.dispatchEvent("click");

  await expect(page.getByRole("heading", { name: "Quick Create" })).toBeVisible();
});
