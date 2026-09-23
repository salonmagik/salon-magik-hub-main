import { test, expect } from "@playwright/test";
import { installSupabaseMocks, seedSession, makeTenant, OWNER_USER, DEFAULT_MOCK_LOCATIONS } from "./mock-supabase";

// Payouts is gated on activeContextType === "owner_hub" (Business Hub) —
// ownerHubContext here is what makes that reachable at all; without it,
// PayoutsPage renders its "Payouts isn't available here" access-denied
// state instead, which is what every other test in this suite has been
// stuck seeing since resolve_user_contexts had no dedicated mock.
test("Payouts renders in Business Hub context with the Head Office branch switcher and merged accounts list", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant(),
    ownerHubContext: true,
  });

  await page.goto("/salon/payouts");

  // Proves owner_hub context actually resolved — the access-denied state
  // uses this exact heading when it's not.
  await expect(page.getByRole("heading", { name: "Payouts isn't available here" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();

  // The branch switcher: Head Office plus every DEFAULT_MOCK_LOCATIONS branch.
  await expect(page.getByRole("button", { name: /Head Office/ })).toBeVisible();
  for (const location of DEFAULT_MOCK_LOCATIONS) {
    await expect(page.getByRole("button", { name: location.name, exact: true })).toBeVisible();
  }

  // The merged Accounts tab — one section, not the old two-card split.
  await page.getByRole("tab", { name: "Accounts" }).click();
  await expect(page.getByText("Payout Accounts", { exact: true })).toBeVisible();
  await expect(page.getByText("Branch Payout Accounts")).toHaveCount(0);
  await expect(page.getByText("All Payout Accounts")).toHaveCount(0);

  expect(errors).toEqual([]);
});
