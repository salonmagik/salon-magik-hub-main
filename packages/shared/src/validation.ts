import { getCountryByCode } from "./countries";

export type PasswordRuleKey =
  | "minLength"
  | "uppercase"
  | "lowercase"
  | "number"
  | "special";

export interface PasswordRuleState {
  key: PasswordRuleKey;
  label: string;
  passed: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  rules: PasswordRuleState[];
}

const passwordRules: Array<{ key: PasswordRuleKey; label: string; test: RegExp | ((value: string) => boolean) }> = [
  { key: "minLength", label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { key: "uppercase", label: "One uppercase letter", test: /[A-Z]/ },
  { key: "lowercase", label: "One lowercase letter", test: /[a-z]/ },
  { key: "number", label: "One number", test: /\d/ },
  { key: "special", label: "One special character", test: /[^A-Za-z0-9]/ },
];

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const rules = passwordRules.map((rule) => {
    const passed = typeof rule.test === "function" ? rule.test(password) : rule.test.test(password);
    return {
      key: rule.key,
      label: rule.label,
      passed,
    };
  });

  return {
    isValid: rules.every((rule) => rule.passed),
    rules,
  };
}

export function validatePhoneByCountry(countryCode: string, localDigits: string): {
  isValid: boolean;
  expectedLength: number | null;
  error?: string;
} {
  const normalizedCountryCode = countryCode.toUpperCase();
  const digits = localDigits.replace(/\D/g, "");
  const strictLengths: Record<string, number> = {
    NG: 11,
    GH: 10,
  };
  const expectedLength = strictLengths[normalizedCountryCode] ?? null;

  if (expectedLength === null) {
    return {
      isValid: digits.length >= 6,
      expectedLength: null,
      error: digits.length >= 6 ? undefined : "Enter a valid phone number",
    };
  }

  const isValid = digits.length === expectedLength;
  return {
    isValid,
    expectedLength,
    error: isValid ? undefined : `Phone number must be ${expectedLength} digits`,
  };
}

export function toE164(countryCode: string, localDigits: string): string | null {
  const country = getCountryByCode(countryCode.toUpperCase());
  if (!country) return null;

  const digits = localDigits.replace(/\D/g, "");
  if (!digits) return null;

  // For GH/NG local format, remove the leading zero before converting.
  const normalizedDigits =
    (country.code === "GH" || country.code === "NG") && digits.startsWith("0")
      ? digits.slice(1)
      : digits;

  if (!normalizedDigits) return null;
  return `${country.dialCode}${normalizedDigits}`;
}

export function sanitizeNumericInput(
  value: string,
  options?: {
    allowDecimal?: boolean;
    maxDecimalPlaces?: number;
    maxLength?: number;
  }
): string {
  const allowDecimal = options?.allowDecimal ?? false;
  const maxDecimalPlaces = options?.maxDecimalPlaces ?? 2;
  const maxLength = options?.maxLength;

  let sanitized = value.replace(allowDecimal ? /[^\d.]/g : /\D/g, "");

  if (allowDecimal) {
    const [whole, ...rest] = sanitized.split(".");
    const decimal = rest.join("").slice(0, maxDecimalPlaces);
    sanitized = rest.length > 0 ? `${whole}.${decimal}` : whole;
  }

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

export function sanitizeMoneyInput(value: string): string {
  return sanitizeNumericInput(value, { allowDecimal: true, maxDecimalPlaces: 2 });
}

export function formatMoneyOnBlur(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const amount = Number(trimmed);
  if (Number.isNaN(amount)) return "";
  return amount.toFixed(2);
}

export function normalizeFormattedNumber(raw: string): string {
  return raw.replace(/,/g, "").trim();
}

export function formatNumberWithGrouping(raw: string): string {
  const normalized = normalizeFormattedNumber(raw).replace(/[^\d]/g, "");
  if (!normalized) return "";
  return Number(normalized).toLocaleString();
}

export function formatCurrencyWhileTyping(raw: string): string {
  const normalized = normalizeFormattedNumber(raw).replace(/[^\d.]/g, "");
  if (!normalized) return "";

  const [whole = "", ...fractionParts] = normalized.split(".");
  const fraction = fractionParts.join("").slice(0, 2);
  const groupedWhole = whole ? Number(whole).toLocaleString() : "0";

  if (normalized.endsWith(".") && fraction.length === 0) {
    return `${groupedWhole}.`;
  }

  return fraction.length > 0 ? `${groupedWhole}.${fraction}` : groupedWhole;
}

export function formatDisplayNumber(value: number): string {
  return Number(value).toLocaleString();
}
