import { describe, expect, it } from "vitest";
import {
  formatCurrencyWhileTyping,
  formatMoneyOnBlur,
  formatNumberWithGrouping,
  toE164,
  validatePasswordStrength,
  validatePhoneByCountry,
} from "../validation";

describe("validation helpers", () => {
  it("validates password rule set", () => {
    expect(validatePasswordStrength("weak").isValid).toBe(false);
    expect(validatePasswordStrength("StrongPass1!").isValid).toBe(true);
  });

  it("validates NG and GH phone lengths", () => {
    expect(validatePhoneByCountry("NG", "08012345678").isValid).toBe(true);
    expect(validatePhoneByCountry("GH", "0241234567").isValid).toBe(true);
    expect(validatePhoneByCountry("GH", "0241234").isValid).toBe(false);
  });

  it("converts local phone to E.164", () => {
    expect(toE164("GH", "0241234567")).toBe("+233241234567");
  });

  it("formats numbers and money input values", () => {
    expect(formatNumberWithGrouping("20000")).toBe("20,000");
    expect(formatCurrencyWhileTyping("12000.5")).toBe("12,000.5");
    expect(formatMoneyOnBlur("12")).toBe("12.00");
  });
});
