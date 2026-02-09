/**
 * Launch Preparation - Phase 17
 * 
 * Configuration and utilities for launch readiness.
 */

// ============================================
// Custom Domain Configuration
// ============================================
export const DOMAIN_CONFIG = {
  primary: "www.salonmagik.com",
  apex: "salonmagik.com",
  dns: {
    aRecord: "185.158.133.1",
    txtVerification: "",
  },
  status: "pending" as "pending" | "verified" | "active",
};

// ============================================
// Security Audit Checklist
// ============================================
export interface SecurityChecklistItem {
  id: string;
  category: string;
  item: string;
  status: "pass" | "fail" | "pending" | "not_applicable";
  notes?: string;
}

export const SECURITY_CHECKLIST: SecurityChecklistItem[] = [
  // RLS Policies
  { id: "rls_1", category: "RLS Policies", item: "All tables have RLS enabled", status: "pending" },
  { id: "rls_2", category: "RLS Policies", item: "Tenant isolation enforced on all multi-tenant tables", status: "pending" },
  { id: "rls_3", category: "RLS Policies", item: "Customer data protected by user_id checks", status: "pending" },
  { id: "rls_4", category: "RLS Policies", item: "Audit logs read-only for non-admin users", status: "pending" },
  { id: "rls_5", category: "RLS Policies", item: "BackOffice tables restricted to backoffice users", status: "pending" },
  
  // Edge Function Security
  { id: "ef_1", category: "Edge Functions", item: "All inputs validated and sanitized", status: "pending" },
  { id: "ef_2", category: "Edge Functions", item: "Stripe webhook signature verified", status: "pending" },
  { id: "ef_3", category: "Edge Functions", item: "Paystack webhook signature verified (SHA-512)", status: "pending" },
  { id: "ef_4", category: "Edge Functions", item: "CORS properly configured", status: "pending" },
  { id: "ef_5", category: "Edge Functions", item: "Rate limiting implemented", status: "pending" },
  
  // Authentication
  { id: "auth_1", category: "Authentication", item: "Password requirements meet minimum standards", status: "pending" },
  { id: "auth_2", category: "Authentication", item: "Email verification required before login", status: "pending" },
  { id: "auth_3", category: "Authentication", item: "Session expiry configured", status: "pending" },
  { id: "auth_4", category: "Authentication", item: "TOTP enabled for BackOffice users", status: "pending" },
  { id: "auth_5", category: "Authentication", item: "Staff invitation tokens expire after 7 days", status: "pending" },
  
  // Data Protection
  { id: "data_1", category: "Data Protection", item: "Sensitive data not logged to console", status: "pending" },
  { id: "data_2", category: "Data Protection", item: "API keys stored in secrets, not code", status: "pending" },
  { id: "data_3", category: "Data Protection", item: "Customer PII access logged", status: "pending" },
  { id: "data_4", category: "Data Protection", item: "Financial transactions audited", status: "pending" },
];

// ============================================
// End-to-End Testing Checklist
// ============================================
export interface E2ETestCase {
  id: string;
  journey: string;
  step: string;
  expectedResult: string;
  status: "pass" | "fail" | "pending" | "blocked";
  notes?: string;
}

export const E2E_TEST_CASES: E2ETestCase[] = [
  // Salon Owner Journey
  { id: "so_1", journey: "Salon Owner", step: "Sign up with email/password", expectedResult: "Account created, verification email sent", status: "pending" },
  { id: "so_2", journey: "Salon Owner", step: "Complete onboarding (profile → business → location → plan)", expectedResult: "Tenant and location created", status: "pending" },
  { id: "so_3", journey: "Salon Owner", step: "Add first service", expectedResult: "Service visible in catalog", status: "pending" },
  { id: "so_4", journey: "Salon Owner", step: "Invite staff member", expectedResult: "Invitation email sent, appears in pending", status: "pending" },
  { id: "so_5", journey: "Salon Owner", step: "Enable online booking", expectedResult: "Booking URL generated and accessible", status: "pending" },
  { id: "so_6", journey: "Salon Owner", step: "Receive first appointment", expectedResult: "Appointment visible in dashboard", status: "pending" },
  
  // Customer Journey
  { id: "cust_1", journey: "Customer", step: "Browse public booking page", expectedResult: "Services and packages displayed", status: "pending" },
  { id: "cust_2", journey: "Customer", step: "Select services → checkout", expectedResult: "Cart totals correct, proceed to payment", status: "pending" },
  { id: "cust_3", journey: "Customer", step: "Complete Paystack/Stripe payment", expectedResult: "Payment confirmed, booking created", status: "pending" },
  { id: "cust_4", journey: "Customer", step: "Access client portal via OTP", expectedResult: "Dashboard shows booking", status: "pending" },
  { id: "cust_5", journey: "Customer", step: "View booking details", expectedResult: "All services, times, and amounts visible", status: "pending" },
  { id: "cust_6", journey: "Customer", step: "Request refund", expectedResult: "Refund request submitted, visible in salon", status: "pending" },
  
  // Staff Journey
  { id: "staff_1", journey: "Staff", step: "Accept invitation via email", expectedResult: "Redirect to password reset", status: "pending" },
  { id: "staff_2", journey: "Staff", step: "Reset password on first login", expectedResult: "Password set, redirected to dashboard", status: "pending" },
  { id: "staff_3", journey: "Staff", step: "View assigned appointments", expectedResult: "Only assigned appointments visible", status: "pending" },
  { id: "staff_4", journey: "Staff", step: "Start/complete service", expectedResult: "Service status updated, time recorded", status: "pending" },
  
  // BackOffice Journey
  { id: "bo_1", journey: "BackOffice", step: "Login with @salonmagik.com email", expectedResult: "Redirect to 2FA setup/verify", status: "pending" },
  { id: "bo_2", journey: "BackOffice", step: "Set up 2FA", expectedResult: "TOTP enrolled, verified", status: "pending" },
  { id: "bo_3", journey: "BackOffice", step: "View waitlist", expectedResult: "All leads visible with status", status: "pending" },
  { id: "bo_4", journey: "BackOffice", step: "Manage feature flags", expectedResult: "Flags toggled, take effect", status: "pending" },
  { id: "bo_5", journey: "BackOffice", step: "Start impersonation session", expectedResult: "Session logged, salon accessible", status: "pending" },
];

// ============================================
// Launch Readiness Summary
// ============================================
export interface LaunchReadiness {
  securityScore: number;
  e2ePassRate: number;
  blockers: string[];
  warnings: string[];
  readyForLaunch: boolean;
}

export function calculateLaunchReadiness(
  securityChecklist: SecurityChecklistItem[],
  e2eTests: E2ETestCase[]
): LaunchReadiness {
  const securityPassed = securityChecklist.filter(c => c.status === "pass").length;
  const securityTotal = securityChecklist.filter(c => c.status !== "not_applicable").length;
  const securityScore = securityTotal > 0 ? Math.round((securityPassed / securityTotal) * 100) : 0;
  
  const e2ePassed = e2eTests.filter(t => t.status === "pass").length;
  const e2eTotal = e2eTests.filter(t => t.status !== "blocked").length;
  const e2ePassRate = e2eTotal > 0 ? Math.round((e2ePassed / e2eTotal) * 100) : 0;
  
  const blockers = [
    ...securityChecklist.filter(c => c.status === "fail").map(c => `Security: ${c.item}`),
    ...e2eTests.filter(t => t.status === "fail").map(t => `E2E: ${t.journey} - ${t.step}`),
  ];
  
  const warnings = [
    ...securityChecklist.filter(c => c.status === "pending").map(c => `Security pending: ${c.item}`),
    ...e2eTests.filter(t => t.status === "pending").slice(0, 5).map(t => `E2E pending: ${t.journey} - ${t.step}`),
  ];
  
  return {
    securityScore,
    e2ePassRate,
    blockers,
    warnings: warnings.slice(0, 10), // Limit to 10 warnings
    readyForLaunch: securityScore >= 100 && e2ePassRate >= 90 && blockers.length === 0,
  };
}

// ============================================
// Launch Configuration
// ============================================
export const LAUNCH_CONFIG = {
  targetDate: "2026-02-10",
  minSecurityScore: 100,
  minE2EPassRate: 90,
  requiredSecrets: [
    "STRIPE_SECRET_KEY",
    "PAYSTACK_SECRET_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
  ],
  featureFlagsToEnable: [
    "online_booking",
    "payment_processing",
    "email_notifications",
  ],
  featureFlagsToDisable: [
    "maintenance_mode",
    "dev_mode",
  ],
};
