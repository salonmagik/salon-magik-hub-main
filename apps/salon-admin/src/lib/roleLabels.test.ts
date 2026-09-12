import { describe, expect, it } from "vitest";
import { ROLE_LABELS, roleLabel } from "./roleLabels";

// TenantSwitcher and SalonSidebar's UserProfileSection both import
// ROLE_LABELS/roleLabel from this module (AD-8) rather than keeping their
// own copies, so this is the single source of truth both consumers agree
// with (FR-22 — labels consistent wherever a role is displayed).
describe("roleLabels", () => {
  it("labels every known role", () => {
    expect(ROLE_LABELS.owner).toBe("Owner");
    expect(ROLE_LABELS.manager).toBe("Manager");
    expect(ROLE_LABELS.supervisor).toBe("Supervisor");
    expect(ROLE_LABELS.receptionist).toBe("Receptionist");
    expect(ROLE_LABELS.staff).toBe("Front desk staff");
  });

  it("roleLabel matches ROLE_LABELS for every known role", () => {
    for (const [role, label] of Object.entries(ROLE_LABELS)) {
      expect(roleLabel(role)).toBe(label);
    }
  });

  it("falls back to the raw value for an unknown role", () => {
    expect(roleLabel("mystery")).toBe("mystery");
  });

  it("returns an empty string for a null/undefined role", () => {
    expect(roleLabel(null)).toBe("");
    expect(roleLabel(undefined)).toBe("");
  });
});
