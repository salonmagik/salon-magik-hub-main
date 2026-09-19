/** Cryptographically secure helpers for one-time codes and generated secrets. */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive safe integer");
  }

  const range = 0x1_0000_0000;
  const limit = range - (range % maxExclusive);
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % maxExclusive;
}

export function secureRandomDigits(length: number): string {
  if (!Number.isSafeInteger(length) || length <= 0) throw new Error("length must be positive");
  const minimum = 10 ** (length - 1);
  const maximum = 10 ** length;
  return String(minimum + secureRandomInt(maximum - minimum));
}

export function secureRandomFromAlphabet(alphabet: string, length: number): string {
  if (!alphabet || !Number.isSafeInteger(length) || length <= 0) throw new Error("Invalid random string arguments");
  return Array.from({ length }, () => alphabet[secureRandomInt(alphabet.length)]).join("");
}
