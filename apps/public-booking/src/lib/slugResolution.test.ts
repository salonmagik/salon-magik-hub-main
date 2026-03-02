import { describe, expect, it } from "vitest";
import { resolvePublicBookingSlug, resolveSlugFromHostname, resolveSlugFromQuery } from "./slugResolution";

describe("slug resolution", () => {
  it("resolves slug from subdomain for prod base domain", () => {
    expect(resolveSlugFromHostname("amberluxe.salonmagik.com", "salonmagik.com")).toBe("amberluxe");
  });

  it("resolves slug from subdomain for staging base domain", () => {
    expect(resolveSlugFromHostname("amberluxe.staging.salonmagik.com", "staging.salonmagik.com")).toBe(
      "amberluxe"
    );
  });

  it("resolves slug from query param", () => {
    expect(resolveSlugFromQuery("?slug=abc")).toBe("abc");
  });

  it("uses dev query fallback only in dev", () => {
    expect(
      resolvePublicBookingSlug({
        hostname: "localhost",
        search: "?slug=that-star-girl",
        isDev: true,
      })
    ).toBe("that-star-girl");

    expect(
      resolvePublicBookingSlug({
        hostname: "localhost",
        search: "?slug=that-star-girl",
        isDev: false,
      })
    ).toBeUndefined();
  });
});

