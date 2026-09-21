import { test, expect } from "@playwright/test";
import { installSupabaseMocks, seedSession, makeTenant, OWNER_USER } from "./mock-supabase";

// The mobile bottom nav is meant to hide on scroll-down and reveal again on
// scroll-up/near-top (SalonSidebar.tsx). That behavior depends on the content
// pane actually being its own scroll container — a `min-h-screen` ancestor
// (a height floor, not a bound) let the whole page scroll at the window
// level instead, so the pane's own `scroll` listener never fired and the nav
// never moved. This pins the fix: the pane must be a real scroll boundary,
// and the nav must actually respond to scrolling it.
test("mobile bottom nav hides on scroll down and reappears on scroll up", async ({ page }) => {
  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant(),
  });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/salon");

  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(nav).toBeVisible();

  const contentPane = page.locator("main > div.overflow-y-auto").first();
  await expect(contentPane).toBeVisible();

  // Confirm the pane is genuinely scrollable (the bug this test guards
  // against: an unbounded ancestor makes this pane's own scrollHeight equal
  // its clientHeight, because the *page*, not the pane, absorbs the overflow).
  await contentPane.evaluate((el) => {
    const spacer = document.createElement("div");
    spacer.style.height = "2000px";
    spacer.dataset.testSpacer = "true";
    el.appendChild(spacer);
  });
  const [scrollHeight, clientHeight] = await contentPane.evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  const isHidden = () => nav.evaluate((el) => el.className.includes("pointer-events-none"));

  expect(await isHidden()).toBe(false);

  await contentPane.evaluate((el) => {
    el.scrollTop = 400;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(isHidden).toBe(true);

  await contentPane.evaluate((el) => {
    el.scrollTop = 100;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(isHidden).toBe(false);
});
