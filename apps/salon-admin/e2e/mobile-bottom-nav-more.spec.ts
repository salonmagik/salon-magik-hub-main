import { test, expect } from "@playwright/test";
import { installSupabaseMocks, seedSession, makeTenant, OWNER_USER } from "./mock-supabase";

// The bottom nav only ever shows the 4-5 primary destinations; everything
// else (Reports, Messaging, Staff, All Notifications, Settings, and — for a
// chain — the Business Hub/branch context switcher) lives in "More", which
// opens a bottom sheet with the BOTTOM_NAV_PATHS-filtered overflow list.
// There is no side drawer on mobile at all — the bottom nav is the only
// mobile navigation surface, so nothing on the bar is ever also duplicated
// in what "More" opens.
test("More on the mobile bottom nav opens a bottom sheet with the overflow items", async ({ page }) => {
  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant(),
  });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/salon");

  // No side drawer exists on mobile — the bottom nav is the only nav surface.
  await expect(page.locator("aside.lg\\:hidden")).toHaveCount(0);

  // Home/Bookings/Services/Transactions/More — Customers moved into More so
  // the branch bar stays at 5 tabs instead of 6.
  const bottomNav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(bottomNav.getByText("Customers", { exact: true })).toHaveCount(0);

  const moreTab = bottomNav.getByText("More");
  // Product-tour overlay (react-joyride) auto-launches on this page and isn't
  // part of what this test covers. `force: true` only skips Playwright's own
  // obscured-element check — the browser still hit-tests the real click
  // against whatever's on top, which is the tour overlay. Dispatching the
  // click directly on the node sidesteps hit-testing entirely.
  await moreTab.dispatchEvent("click");

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  // Items already on the bottom bar (e.g. Appointments) must not also be
  // duplicated inside the sheet it opens.
  await expect(sheet.getByText("Appointments", { exact: true })).toHaveCount(0);
  // An overflow item — not on the bottom bar — must be reachable here.
  await expect(sheet.getByText("Reports", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Customers", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Sign out", { exact: true })).toBeVisible();
});

test("a grouped overflow item (Branch Settings) expands its sub-pages in place instead of navigating away", async ({ page }) => {
  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant(),
  });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/salon");

  const moreTab = page.getByRole("navigation", { name: "Primary mobile navigation" }).getByText("More");
  await moreTab.dispatchEvent("click");

  const sheet = page.getByRole("dialog");
  const settingsRow = sheet.getByText("Branch Settings", { exact: true });
  await expect(settingsRow).toBeVisible();
  await expect(sheet.getByText("Branch Profile", { exact: true })).toHaveCount(0);

  await settingsRow.dispatchEvent("click");

  // Expanding reveals its sub-pages without closing the sheet or navigating.
  await expect(sheet.getByText("Branch Profile", { exact: true })).toBeVisible();
  await expect(sheet).toBeVisible();
});
