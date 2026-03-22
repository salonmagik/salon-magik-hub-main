import { describe, expect, it } from "vitest";
import { fallbackFirstRoute, isModuleAllowedInContext } from "./contextAccess";

describe("contextAccess", () => {
  it("allows only hub module in owner hub context", () => {
    expect(isModuleAllowedInContext("salons_overview", "owner_hub")).toBe(true);
    expect(isModuleAllowedInContext("appointments", "owner_hub")).toBe(false);
    expect(isModuleAllowedInContext("dashboard", "owner_hub")).toBe(false);
  });

  it("allows location modules and hides hub module in location context", () => {
    expect(isModuleAllowedInContext("appointments", "location")).toBe(true);
    expect(isModuleAllowedInContext("salons_overview", "location")).toBe(false);
  });

  it("returns context-aware fallback routes", () => {
    expect(fallbackFirstRoute("owner_hub")).toBe("/salon/overview");
    expect(fallbackFirstRoute("location")).toBe("/salon");
  });
});
