/**
 * Post-Launch Features - PRD Gaps (Phase 16)
 * 
 * These are placeholder components and hooks for features 
 * identified in the PRD that will be implemented post-launch.
 */

// ============================================
// Feature: OTP Verification for Service Start
// ============================================
// - Trigger OTP for Studio and Chain plans
// - Solo plan bypasses verification
// - Customer receives OTP when service starts
// - Staff enters OTP to confirm start

export interface OTPVerificationConfig {
  enabled: boolean;
  requiredForPlans: ("studio" | "chain")[];
  expiryMinutes: number;
}

export interface OTPVerificationRequest {
  appointmentId: string;
  customerId: string;
  phone: string;
}

// Placeholder hook - to be implemented
export function useServiceOTPVerification() {
  return {
    sendOTP: async (_request: OTPVerificationRequest) => {
      console.log("OTP verification not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    verifyOTP: async (_appointmentId: string, _code: string) => {
      console.log("OTP verification not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    isLoading: false,
  };
}

// ============================================
// Feature: Tips System
// ============================================
// - Database schema for tip storage
// - Tip entry UI after service completion
// - 48-hour eligibility window
// - Client portal tip submission

export interface Tip {
  id: string;
  appointmentId: string;
  customerId: string;
  staffId: string;
  amount: number;
  currency: string;
  submittedAt: string;
  expiresAt: string;
}

export interface TipSubmission {
  appointmentId: string;
  staffId: string;
  amount: number;
}

// Placeholder hook - to be implemented
export function useTips() {
  return {
    submitTip: async (_tip: TipSubmission) => {
      console.log("Tips system not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    getEligibleAppointments: async () => {
      return [];
    },
    isLoading: false,
  };
}

// ============================================
// Feature: Customer Reviews
// ============================================
// - Review submission in client portal
// - Display format: first name + last initial
// - Review moderation in salon admin

export interface Review {
  id: string;
  appointmentId: string;
  customerId: string;
  rating: number; // 1-5
  comment: string | null;
  displayName: string; // "John D."
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  moderatedAt: string | null;
}

// Placeholder hook - to be implemented
export function useReviews() {
  return {
    submitReview: async (_appointmentId: string, _rating: number, _comment?: string) => {
      console.log("Reviews system not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    moderateReview: async (_reviewId: string, _action: "approve" | "reject") => {
      console.log("Review moderation not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    reviews: [],
    isLoading: false,
  };
}

// ============================================
// Feature: Buffer Time Flow
// ============================================
// - "On My Way" button in client portal
// - "Running Late" delay selector (up to 30 mins)
// - Buffer proposal modal in appointments
// - Email notifications for buffer requests
// - Accept/decline CTAs in customer emails

export interface BufferRequest {
  id: string;
  appointmentId: string;
  type: "on_my_way" | "running_late";
  delayMinutes: number | null;
  status: "pending" | "accepted" | "declined";
  requestedAt: string;
}

// Placeholder hook - to be implemented
export function useBufferTime() {
  return {
    sendOnMyWay: async (_appointmentId: string) => {
      console.log("Buffer time not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    requestDelay: async (_appointmentId: string, _minutes: number) => {
      console.log("Buffer time not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    respondToBuffer: async (_requestId: string, _action: "accept" | "decline") => {
      console.log("Buffer time not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    isLoading: false,
  };
}

// ============================================
// Feature: Invoice Generation
// ============================================
// - PDF/HTML invoice generation
// - Invoice email sending
// - Invoice history in client portal
// - Invoice download in salon admin

export interface Invoice {
  id: string;
  invoiceNumber: string;
  appointmentId: string;
  customerId: string;
  tenantId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "void";
  pdfUrl: string | null;
  createdAt: string;
  sentAt: string | null;
}

// IMPLEMENTED: See src/hooks/useInvoices.tsx
export { useInvoices } from "./useInvoices";

// ============================================
// Feature: Service Change During Appointment
// ============================================
// - Service change proposal UI
// - Customer approval email with CTAs
// - Price difference handling (charge, credit, refund)

export interface ServiceChangeRequest {
  id: string;
  appointmentId: string;
  originalServices: string[];
  proposedServices: string[];
  priceDifference: number;
  status: "pending" | "approved" | "declined";
  requestedAt: string;
}

// Placeholder hook - to be implemented
export function useServiceChange() {
  return {
    proposeChange: async (_appointmentId: string, _newServices: string[]) => {
      console.log("Service change not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    respondToChange: async (_requestId: string, _action: "approve" | "decline") => {
      console.log("Service change not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    isLoading: false,
  };
}

// ============================================
// Feature: Communication Credits Purchase
// ============================================
// IMPLEMENTED: See src/hooks/useCreditPurchase.tsx
export { useCreditPurchase, CREDIT_PACKAGES } from "./useCreditPurchase";
export type { CreditPackage } from "./useCreditPurchase";

// ============================================
// Feature: Trial Enforcement
// ============================================
// IMPLEMENTED: See src/hooks/useTrialEnforcement.tsx
export { useTrialEnforcement } from "./useTrialEnforcement";
export type { TrialStatus } from "./useTrialEnforcement";
