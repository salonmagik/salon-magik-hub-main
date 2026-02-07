/**
 * Compute form validity based on required fields and optional terms acceptance
 */
export function isFormValid(
  requiredFields: Record<string, string | boolean | number | undefined | null>,
  termsRequired: boolean = false,
  termsAccepted: boolean = false
): boolean {
  const allFieldsValid = Object.values(requiredFields).every((v) => {
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "boolean") return v === true;
    if (typeof v === "number") return !isNaN(v);
    return v !== undefined && v !== null;
  });

  if (termsRequired) {
    return allFieldsValid && termsAccepted;
  }

  return allFieldsValid;
}

/**
 * Check if an email address is valid
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if a password meets minimum requirements
 */
export function isValidPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number" };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return { valid: false, error: "Password must contain at least one special character (!@#$%^&*...)" };
  }
  
  const simplePatterns = ["12345678", "abcdefgh", "qwertyui", "password", "11111111", "00000000"];
  if (simplePatterns.some(pattern => password.toLowerCase().includes(pattern))) {
    return { valid: false, error: "Password is too simple" };
  }
  
  return { valid: true };
}
