import { describe, expect, it } from "vitest";
import { needsDetailsConfirmation } from "./ConfirmDetailsModal";

describe("needsDetailsConfirmation", () => {
  it("is false before a password-initialized account exists", () => {
    expect(needsDetailsConfirmation(null)).toBe(false);
    expect(needsDetailsConfirmation({ client_password_initialized: false })).toBe(false);
  });

  it("is true for a fresh account that has never confirmed or skipped", () => {
    expect(needsDetailsConfirmation({ client_password_initialized: true })).toBe(true);
  });

  it("is false once genuinely confirmed", () => {
    expect(
      needsDetailsConfirmation({
        client_password_initialized: true,
        details_confirmed_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  // The bug this whole change fixes: skipping used to be indistinguishable
  // from confirming, so a skip was as permanent as a real confirmation and
  // the customer had no way back to the form.
  it("is false after a skip too — the automatic prompt doesn't reappear, but that's not the same as confirmed", () => {
    expect(
      needsDetailsConfirmation({
        client_password_initialized: true,
        details_confirmation_skipped_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });
});
