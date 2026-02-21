import { describe, expect, it } from "vitest";
import {
  EXPANSION_COUNTRIES,
  PRODUCT_LIVE_COUNTRIES,
  getExpansionCountries,
  getLiveCountries,
  isLiveCountry,
} from "../countries";

describe("country helpers", () => {
  it("marks GH and NG as live", () => {
    expect(isLiveCountry("GH")).toBe(true);
    expect(isLiveCountry("NG")).toBe(true);
  });

  it("returns live and expansion lists", () => {
    expect(getLiveCountries()).toEqual(PRODUCT_LIVE_COUNTRIES);
    expect(getExpansionCountries()).toEqual(EXPANSION_COUNTRIES);
    expect(EXPANSION_COUNTRIES.some((country) => country.code === "GH")).toBe(false);
  });
});
