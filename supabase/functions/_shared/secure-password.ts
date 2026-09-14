const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // 55, no I/O/0/1/l
const SPECIALS = "!@#$%&*"; // 7

/**
 * Unbiased index into `charset`, via rejection sampling over random bytes.
 * `byte % charset.length` is biased whenever 256 isn't a multiple of the
 * charset length — rejecting bytes in the leftover partial block removes it.
 */
function randomIndex(charset: string): number {
  const threshold = 256 - (256 % charset.length);
  let buffer = new Uint8Array(0);
  let offset = 0;

  while (true) {
    if (offset >= buffer.length) {
      buffer = new Uint8Array(16);
      crypto.getRandomValues(buffer);
      offset = 0;
    }
    const byte = buffer[offset++];
    if (byte < threshold) {
      return byte % charset.length;
    }
  }
}

/**
 * Cryptographically secure temporary password: 8 ambiguity-free alphanumerics
 * followed by 2 specials (~51.9 bits). Shape is the pre-existing contract —
 * onboarding emails and Supabase Auth complexity rules depend on it.
 */
export function generateSecurePassword(): string {
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += ALPHANUMERIC.charAt(randomIndex(ALPHANUMERIC));
  }
  for (let i = 0; i < 2; i++) {
    password += SPECIALS.charAt(randomIndex(SPECIALS));
  }
  return password;
}
