import { isValidEmail, isValidPassword } from "@/lib/form-utils";

export type SignupFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export type SignupField = keyof SignupFormData | "terms";

export type SignupValidationResult = {
  isValid: boolean;
  errors: Partial<Record<SignupField, string>>;
  /** First unmet requirement, useful for a single inline hint */
  blockingReason?: string;
};

export function validateSignup(
  formData: SignupFormData,
  acceptTerms: boolean,
): SignupValidationResult {
  const errors: Partial<Record<SignupField, string>> = {};

  if (!formData.firstName.trim()) errors.firstName = "First name is required";
  if (!formData.lastName.trim()) errors.lastName = "Last name is required";

  if (!formData.email.trim()) {
    errors.email = "Email is required";
  } else if (!isValidEmail(formData.email)) {
    errors.email = "Please enter a valid email";
  }

  if (!formData.phone.trim()) errors.phone = "Phone number is required";

  if (!formData.password) {
    errors.password = "Password is required";
  } else {
    const passwordValidation = isValidPassword(formData.password);
    if (!passwordValidation.valid) {
      errors.password = passwordValidation.error || "Invalid password";
    }
  }

  if (!formData.confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (formData.password !== formData.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  if (!acceptTerms) errors.terms = "You must accept the terms and conditions";

  const priority: SignupField[] = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "password",
    "confirmPassword",
    "terms",
  ];

  const blockingReason = priority.map((k) => errors[k]).find(Boolean);

  return {
    isValid: !blockingReason,
    errors,
    blockingReason,
  };
}
