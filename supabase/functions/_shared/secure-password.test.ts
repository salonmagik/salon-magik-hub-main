import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateSecurePassword } from "./secure-password.ts";

const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const SPECIALS = "!@#$%&*";
const AMBIGUOUS = "IOl01";

Deno.test("generateSecurePassword: shape is 8 alphanumeric + 2 special", () => {
  const password = generateSecurePassword();
  assertEquals(password.length, 10);
  for (const ch of password.slice(0, 8)) {
    assert(ALPHANUMERIC.includes(ch), `expected alphanumeric char, got ${ch}`);
  }
  for (const ch of password.slice(8, 10)) {
    assert(SPECIALS.includes(ch), `expected special char, got ${ch}`);
  }
});

Deno.test("generateSecurePassword: never contains ambiguous characters", () => {
  for (let i = 0; i < 1000; i++) {
    const password = generateSecurePassword();
    for (const ch of AMBIGUOUS) {
      assert(!password.slice(0, 8).includes(ch), `ambiguous char ${ch} found in ${password}`);
    }
  }
});

Deno.test("generateSecurePassword: 1000 generations are all distinct", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    seen.add(generateSecurePassword());
  }
  assertEquals(seen.size, 1000);
});

Deno.test("generateSecurePassword: uses crypto.getRandomValues, not Math.random", () => {
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error("Math.random() must not be called by generateSecurePassword");
  };
  let getRandomValuesCalled = false;
  const originalGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  // deno-lint-ignore no-explicit-any
  (globalThis.crypto as any).getRandomValues = (array: Uint8Array) => {
    getRandomValuesCalled = true;
    return originalGetRandomValues(array);
  };

  try {
    const password = generateSecurePassword();
    assertEquals(password.length, 10);
    assert(getRandomValuesCalled, "expected crypto.getRandomValues to be called");
  } finally {
    Math.random = originalRandom;
    // deno-lint-ignore no-explicit-any
    (globalThis.crypto as any).getRandomValues = originalGetRandomValues;
  }
});

Deno.test("generateSecurePassword: rejection sampling skips biased bytes instead of folding them", () => {
  // 55-char alphanumeric charset: threshold = 256 - (256 % 55) = 220.
  // Feed an ascending byte sequence so bytes >= 220 are provably skipped
  // rather than folded via modulo (which would instead select index
  // byte % 55, biasing the low end of the charset).
  const bytes = [219, 220, 221, 254, 255, 0, 1, 2, 3, 4, 5, 6];
  let cursor = 0;
  const originalGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  // deno-lint-ignore no-explicit-any
  (globalThis.crypto as any).getRandomValues = (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = bytes[cursor % bytes.length];
      cursor++;
    }
    return array;
  };

  try {
    const password = generateSecurePassword();
    const firstAlphanumericChar = password[0];
    // Byte 219 is the first accepted byte (< 220): index 219 % 55 = 54 -> last char.
    // Bytes 220, 221, 254, 255 must all be rejected, never folded to
    // 220 % 55 = 0, 221 % 55 = 1, etc. — those would incorrectly land on
    // the front of the charset if modulo folding were used instead.
    assertEquals(firstAlphanumericChar, ALPHANUMERIC.charAt(219 % 55));
  } finally {
    // deno-lint-ignore no-explicit-any
    (globalThis.crypto as any).getRandomValues = originalGetRandomValues;
  }
});
