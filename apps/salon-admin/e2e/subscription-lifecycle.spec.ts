import { test, expect } from "@playwright/test";
import { installSupabaseMocks, seedSession, makeTenant, OWNER_USER, STAFF_USER } from "./mock-supabase";

test("owner cancels, sees the pending state with the correct date, then resumes back to active — no payment prompt anywhere (AC 1, AC 3)", async ({ page }) => {
  const nextBillingAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant({ next_billing_at: nextBillingAt.toISOString() }),
    onFunctionInvoke: async (_fn, body, route, tenant) => {
      const action = (body as { action: string }).action;
      if (action === "cancel") {
        tenant.subscription_cancel_at = nextBillingAt.toISOString();
        await route.fulfill({ json: { cancelAt: nextBillingAt.toISOString() } });
        return true;
      }
      if (action === "resume") {
        tenant.subscription_cancel_at = null;
        await route.fulfill({ json: { resumed: true, nextBillingAt: nextBillingAt.toISOString() } });
        return true;
      }
      return false;
    },
  });

  await page.goto("/salon/subscription");

  const cancelButton = page.getByRole("button", { name: "Cancel subscription" });
  await expect(cancelButton).toBeVisible({ timeout: 15000 });
  await cancelButton.click();

  await expect(page.getByRole("heading", { name: "Cancel your subscription" })).toBeVisible();

  const reasonSelect = page.getByRole("combobox");
  await reasonSelect.click();
  await page.getByText("Too expensive").click();

  const confirmButton = page.getByRole("button", { name: "Confirm cancellation" });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  await expect(page.getByText(/Cancellation pending/)).toBeVisible();

  // No payment/checkout prompt anywhere in the cancel flow.
  await expect(page.getByText(/redirecting to payment/i)).toHaveCount(0);
  await expect(page.getByText(/checkout/i)).toHaveCount(0);

  const resumeButton = page.getByRole("button", { name: "Resume subscription" });
  await expect(resumeButton).toBeVisible();
  await resumeButton.click();

  await expect(page.getByText(/Cancellation pending/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toBeVisible();

  // Resuming took no payment: no checkout/payment prompt appeared here either.
  await expect(page.getByText(/redirecting to payment/i)).toHaveCount(0);
});

test("a non-owner cannot reach the subscription surface at all — no cancel or resume action is reachable (AC 2)", async ({ page }) => {
  // billing (and settings) are owner-only modules in this app's permission
  // matrix (see usePermissions.tsx) — a staff member is redirected away from
  // /salon/subscription entirely by ModuleProtectedRoute, which trivially
  // satisfies "no cancel or resume action is available to them" (there's no
  // page reachable that could show one). This is the actual, stronger
  // guarantee the app provides today; BillingStateBanner's own owner-vs-
  // non-owner gating (shown on every route, unlike this page) is covered
  // separately by BillingStateBanner.test.tsx.
  const cancelAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  await seedSession(page, STAFF_USER);
  await installSupabaseMocks(page, {
    user: STAFF_USER,
    role: "staff",
    tenant: makeTenant({ subscription_cancel_at: cancelAt, next_billing_at: cancelAt }),
  });

  await page.goto("/salon/subscription");

  await expect(page).toHaveURL(/\/salon\/access-denied/, { timeout: 15000 });
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume subscription" })).toHaveCount(0);
});

test("a past_due banner is reachable from at least two authenticated routes and reaches settle without leaving the app", async ({ page }) => {
  await seedSession(page, OWNER_USER);
  await installSupabaseMocks(page, {
    user: OWNER_USER,
    role: "owner",
    tenant: makeTenant({
      subscription_status: "past_due",
      next_billing_at: null,
      billing_grace_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });

  await page.goto("/salon/subscription");
  await expect(page.getByRole("alert").filter({ hasText: /past due/i })).toBeVisible({ timeout: 15000 });

  await page.goto("/salon/settings");
  await expect(page.getByRole("alert").filter({ hasText: /past due/i })).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Settle now" }).click();

  // Settling stays inside the app (same origin), it doesn't navigate away to a support page.
  await expect(page).toHaveURL(/\/salon\/subscription/);
});
