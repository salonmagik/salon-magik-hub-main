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

// Placeholder hook - to be implemented
export function useInvoices() {
  return {
    generateInvoice: async (_appointmentId: string) => {
      console.log("Invoice generation not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    sendInvoice: async (_invoiceId: string) => {
      console.log("Invoice sending not yet implemented");
      return { success: false, message: "Coming soon" };
    },
    downloadInvoice: async (_invoiceId: string) => {
      console.log("Invoice download not yet implemented");
      return null;
    },
    invoices: [],
    isLoading: false,
  };
}

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
// - Credit pricing per region
// - Payment flow for credit purchase
// - Credit balance top-up logic

export interface CreditPackage {
  id: string;
  credits: number;
  priceUSD: number;
  priceNGN: number;
  priceGHS: number;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "pack_50", credits: 50, priceUSD: 5, priceNGN: 3500, priceGHS: 60 },
  { id: "pack_100", credits: 100, priceUSD: 9, priceNGN: 6500, priceGHS: 108 },
  { id: "pack_250", credits: 250, priceUSD: 20, priceNGN: 15000, priceGHS: 240 },
  { id: "pack_500", credits: 500, priceUSD: 35, priceNGN: 27000, priceGHS: 420 },
];

// Placeholder hook - to be implemented
export function useCreditPurchase() {
  return {
    purchaseCredits: async (_packageId: string) => {
      console.log("Credit purchase not yet implemented");
      return { success: false, checkoutUrl: null };
    },
    packages: CREDIT_PACKAGES,
    isLoading: false,
  };
}

// ============================================
// Feature: Trial Enforcement
// ============================================
// - Trial countdown banner
// - Card collection modal before trial expires
// - Access restriction on trial expiry

export interface TrialStatus {
  isTrialing: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  cardOnFile: boolean;
  isExpired: boolean;
}

// Placeholder hook - to be implemented
export function useTrialEnforcement() {
  return {
    getTrialStatus: (): TrialStatus => ({
      isTrialing: false,
      daysRemaining: 0,
      expiresAt: null,
      cardOnFile: false,
      isExpired: false,
    }),
    collectCard: async () => {
      console.log("Card collection not yet implemented");
      return { success: false, checkoutUrl: null };
    },
    isLoading: false,
  };
}
