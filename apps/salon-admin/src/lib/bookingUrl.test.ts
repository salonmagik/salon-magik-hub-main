import { describe, expect, it } from "vitest";
import {
  buildPublicBookingUrl,
  inferBookingBaseDomainFromHost,
  normalizeBookingBaseDomain,
  resolveBookingBaseDomain,
} from "./bookingUrl";

describe("bookingUrl helpers", () => {
  it("normalizes domain from protocol and wildcard", () => {
    expect(normalizeBookingBaseDomain("https://*.staging.salonmagik.com/")).toBe(
      "staging.salonmagik.com"
    );
  });

  it("builds url using configured env domain", () => {
    expect(buildPublicBookingUrl("slug", { configuredDomain: "staging.salonmagik.com" })).toBe(
      "https://slug.staging.salonmagik.com"
    );
  });

  it("falls back to staging domain when host contains staging", () => {
    expect(
      resolveBookingBaseDomain({
        configuredDomain: "not a domain",
        hostname: "staging.app.salonmagik.com",
      })
    ).toBe("staging.salonmagik.com");
    expect(inferBookingBaseDomainFromHost("staging.bookings.salonmagik.com")).toBe(
      "staging.salonmagik.com"
    );
  });

  it("falls back to prod domain for non-staging hosts", () => {
    expect(
      resolveBookingBaseDomain({
        configuredDomain: "",
        hostname: "app.salonmagik.com",
      })
    ).toBe("salonmagik.com");
  });
});

