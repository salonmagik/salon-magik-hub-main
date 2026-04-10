import { useState, useEffect, useMemo } from "react";
import { Calendar, User, CreditCard, CheckCircle, Gift, ChevronLeft, ChevronRight, ShoppingCart, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Separator } from "@ui/separator";
import {
  useBookingCart,
  useDepositCalculation,
  type PublicTenant,
  type PublicLocation,
  type GiftRecipient,
  type CartItem,
  type PublicService,
  type PublicPackage,
  type PublicProduct,
} from "@/hooks";
import { CartStep } from "./CartStep";
import { SchedulingStep } from "./SchedulingStep";
import { BookerInfoStep, type BookerInfo } from "./BookerInfoStep";
import { GiftRecipientsStep } from "./GiftRecipientsStep";
import { ReviewStep, type PaymentOption } from "./ReviewStep";
import { PaymentStep, type PaymentGateway, type PaymentMode } from "./PaymentStep";
import { type AppliedVoucher } from "@/components/VoucherInput";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { formatCurrency } from "@shared/currency";

interface BookingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salon: PublicTenant;
  locations: PublicLocation[];
  selectedCountryCode?: string | null;
  services?: PublicService[];
  packages?: PublicPackage[];
  products?: PublicProduct[];
}

type WizardStep = "cart" | "scheduling" | "booker" | "gifts" | "review" | "payment" | "confirmation";
type BookerEmailStage = "email" | "otp" | "password" | "details";
type BookerResolution = {
  exists: boolean;
  identifier: string;
  identifierType: "email" | "phone";
  hasPassword: boolean;
  requiresOtp: boolean;
};

const emptyDeliveryAddress = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  deliveryNotes: "",
};

function isDeliveryAddressComplete(address: BookerInfo["deliveryAddress"] | GiftRecipient["address"] | undefined) {
  return Boolean(address?.line1?.trim() && address?.city?.trim() && address?.country?.trim());
}

function formatErrorMessage(message: string, statusCode?: number): string {
  // Common error patterns and their user-friendly replacements
  const patterns = [
    {
      // Pattern: "Mama amks already uses this customer phone number."
      regex: /(.+?)\s+already uses this customer phone number/i,
      replacement: "This phone number is already registered with another customer. Please use a different phone number or contact the salon."
    },
    {
      // Pattern: "Customer with email X already exists"
      regex: /customer with email (.+?) already exists/i,
      replacement: "An account with this email address already exists. Please sign in or use a different email."
    },
    {
      // Pattern: "Phone number already in use"
      regex: /phone number already in use/i,
      replacement: "This phone number is already registered. Please use a different phone number or contact the salon."
    },
    {
      // Pattern: "Email already in use"
      regex: /email already in use/i,
      replacement: "This email address is already registered. Please sign in or use a different email."
    },
  ];

  // Try to match and replace known patterns first, regardless of status code
  for (const pattern of patterns) {
    if (pattern.regex.test(message)) {
      return message.replace(pattern.regex, pattern.replacement);
    }
  }

  // For 5xx errors (server errors) without a known pattern, show a generic message
  if (statusCode && statusCode >= 500) {
    return "We're experiencing technical difficulties. Please try again in a few moments or contact the salon directly.";
  }

  // For 4xx errors or errors without status codes, return cleaned up message
  const cleaned = message.trim();
  if (!cleaned) {
    return statusCode && statusCode >= 400 && statusCode < 500
      ? "Invalid request. Please check your information and try again."
      : "Something went wrong. Please try again.";
  }
  
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return capitalized.endsWith('.') ? capitalized : `${capitalized}.`;
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const response = error.context as Response | undefined;
      const statusCode = response?.status;
      const payload = response ? await response.json() : null;
      if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
        return formatErrorMessage(payload.error, statusCode);
      }
      
      // If no error message in payload, use status code to generate message
      if (statusCode) {
        return formatErrorMessage("", statusCode);
      }
    } catch {
      // Fall through to generic handling
    }
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return formatErrorMessage(error.message);
  }

  return "Something went wrong. Please try again.";
}

export function BookingWizard({
  open,
  onOpenChange,
  salon,
  locations,
  selectedCountryCode,
  services = [],
  packages = [],
  products = [],
}: BookingWizardProps) {
  const {
    items,
    meta,
    updateMeta,
    updateItem,
    getTotal,
    clearCart,
    getGiftItems,
  } = useBookingCart();
  const [step, setStep] = useState<WizardStep>("cart");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingReference, setBookingReference] = useState<string | null>(null);

  const [bookerInfo, setBookerInfo] = useState<BookerInfo>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
    deliveryAddress: emptyDeliveryAddress,
  });
  const [giftRecipients, setGiftRecipients] = useState<Record<string, GiftRecipient>>({});
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("pay_at_salon");
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway>("paystack"); // default is paystack
  const [purseAmount, setPurseAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("card");
  const [purseBalance, setPurseBalance] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [splitPurseAmount, setSplitPurseAmount] = useState(0);
  const [splitCardAmount, setSplitCardAmount] = useState(0);
  const [bookerEmailStage, setBookerEmailStage] = useState<BookerEmailStage>("email");
  const [bookerResolution, setBookerResolution] = useState<BookerResolution | null>(null);
  const [bookerPassword, setBookerPassword] = useState("");
  const [bookerOtp, setBookerOtp] = useState("");
  const [bookerError, setBookerError] = useState("");
  const [isBookerProcessing, setIsBookerProcessing] = useState(false);
  const [bookerHasExistingAccount, setBookerHasExistingAccount] = useState(false);
  const [bookerResendAvailableAt, setBookerResendAvailableAt] = useState<string | null>(null);
  const [bookerOtpCountdown, setBookerOtpCountdown] = useState(0);

  useEffect(() => {
    if (!bookerResendAvailableAt) {
      setBookerOtpCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((new Date(bookerResendAvailableAt).getTime() - Date.now()) / 1000),
      );
      setBookerOtpCountdown(remainingSeconds);
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [bookerResendAvailableAt]);

  useEffect(() => {
    const fetchPurseBalance = async () => {
      if (!bookerInfo.email || !salon.id) return;

      try {
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", salon.id)
          .eq("email", bookerInfo.email)
          .maybeSingle();

        if (customerError || !customer) {
          setPurseBalance(0);
          setCustomerId(null);
          return;
        }

        setCustomerId(customer.id);

        const { data: purse } = await supabase
          .from("customer_purses")
          .select("balance")
          .eq("tenant_id", salon.id)
          .eq("customer_id", customer.id)
          .maybeSingle();

        setPurseBalance(purse?.balance || 0);
      } catch (err) {
        console.error("Error fetching purse balance:", err);
        setPurseBalance(0);
        setCustomerId(null);
      }
    };

    fetchPurseBalance();
  }, [bookerInfo.email, salon.id]);
  const giftItems = getGiftItems();
  const schedulableItems = useMemo(
    () => items.filter((item) => item.type === "service" || item.type === "package"),
    [items],
  );
  const scheduleNowItems = schedulableItems.filter((item) => item.scheduleMode !== "leave_unscheduled");
  const deliveredNonGiftProducts = items.filter(
    (item) => item.type === "product" && item.fulfillmentType === "delivery" && !item.isGift,
  );

  const depositCalc = useDepositCalculation(
    items,
    salon.deposits_enabled ? (salon.default_deposit_percentage || 0) : 0,
  );

  const subtotal = getTotal();
  const voucherDiscount = appliedVoucher?.discountAmount || 0;
  const afterVoucher = Math.max(0, subtotal - voucherDiscount);
  const afterPurse = Math.max(0, afterVoucher - purseAmount);
  const depositAmount = Math.min(depositCalc.depositAmount, afterPurse);

  const amountDueNow =
    afterPurse === 0
      ? 0
      : paymentOption === "pay_now"
        ? afterPurse
        : paymentOption === "pay_deposit"
          ? depositAmount
          : 0;

  const amountDueAtSalon = afterPurse - amountDueNow;
  const deliveryCountryCode = useMemo(() => {
    const deliveryItem = deliveredNonGiftProducts[0];
    if (!deliveryItem) return null;
    return (
      deliveryItem.eligibleBranches?.find((branch) => branch.id === deliveryItem.branchId)?.country_code ||
      (deliveryItem.eligibleBranches?.length === 1 ? deliveryItem.eligibleBranches[0].country_code : null) ||
      null
    );
  }, [deliveredNonGiftProducts]);

  const catalogLookup = useMemo(() => {
    const serviceMap = new Map(services.map((service) => [service.id, service]));
    const packageMap = new Map(packages.map((pkg) => [pkg.id, pkg]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    return { serviceMap, packageMap, productMap };
  }, [packages, products, services]);

  useEffect(() => {
    items.forEach((item) => {
      const source =
        item.type === "service"
          ? catalogLookup.serviceMap.get(item.itemId)
          : item.type === "package"
            ? catalogLookup.packageMap.get(item.itemId)
            : catalogLookup.productMap.get(item.itemId);

      if (!source) return;

      const nextBranches = source.branches ?? [];
      const nextDuration =
        item.type === "service" || item.type === "package"
          ? source.duration_minutes ?? item.durationMinutes
          : item.durationMinutes;
      const nextServiceIds = item.type === "package" ? source.service_ids ?? item.serviceIds : item.serviceIds;
      const branchName =
        item.branchId && nextBranches.length > 0
          ? nextBranches.find((branch) => branch.id === item.branchId)?.name || item.branchName
          : item.branchName;

      const branchesChanged =
        JSON.stringify(item.eligibleBranches || []) !== JSON.stringify(nextBranches);
      const durationChanged = nextDuration !== item.durationMinutes;
      const serviceIdsChanged =
        item.type === "package" &&
        JSON.stringify(item.serviceIds || []) !== JSON.stringify(nextServiceIds || []);
      const branchNameChanged = branchName !== item.branchName;

      if (branchesChanged || durationChanged || serviceIdsChanged || branchNameChanged) {
        updateItem(item.id, {
          eligibleBranches: nextBranches,
          durationMinutes: nextDuration,
          serviceIds: nextServiceIds,
          branchName,
        });
      }
    });
  }, [catalogLookup, items, updateItem]);

  const stepConfig = useMemo(() => {
    const steps: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
      { key: "cart", label: "Your Cart", icon: <ShoppingCart className="h-4 w-4" /> },
    ];

    if (scheduleNowItems.length > 0) {
      steps.push({ key: "scheduling", label: "Schedule", icon: <Calendar className="h-4 w-4" /> });
    }

    steps.push({ key: "booker", label: "Your Info", icon: <User className="h-4 w-4" /> });

    if (giftItems.length > 0) {
      steps.push({ key: "gifts", label: "Recipients", icon: <Gift className="h-4 w-4" /> });
    }

    steps.push({ key: "review", label: "Review", icon: <CreditCard className="h-4 w-4" /> });

    if (amountDueNow > 0) {
      steps.push({ key: "payment", label: "Payment", icon: <Wallet className="h-4 w-4" /> });
    }

    steps.push({ key: "confirmation", label: "Done", icon: <CheckCircle className="h-4 w-4" /> });
    return steps;
  }, [amountDueNow, giftItems.length, scheduleNowItems.length]);

  const currentStepIndex = stepConfig.findIndex((entry) => entry.key === step);

  const getItemLocationName = (item: CartItem) =>
    item.branchName ||
    item.eligibleBranches?.find((branch) => branch.id === item.branchId)?.name ||
    "";

  const isCartComplete = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((item) => {
      const needsBranch = (item.eligibleBranches?.length || 0) > 0;
      if (needsBranch && !item.branchId) return false;
      if (item.type === "product" && !item.fulfillmentType) return false;
      if ((item.type === "service" || item.type === "package") && !item.scheduleMode) return false;
      return true;
    });
  }, [items]);

  const isSchedulingComplete = useMemo(() => {
    return scheduleNowItems.every((item) => {
      if (!item.branchId || !item.scheduledDate || !item.scheduledTime) return false;
      if (salon.require_staff_selection && !item.selectedStaffId) return false;
      return true;
    });
  }, [salon.require_staff_selection, scheduleNowItems]);

  const isBookerInfoComplete = useMemo(() => {
    if (bookerEmailStage !== "details") return false;
    const baseValid =
      Boolean(bookerInfo.firstName.trim()) &&
      Boolean(bookerInfo.lastName.trim()) &&
      Boolean(bookerInfo.email.trim()) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookerInfo.email);

    if (!baseValid) return false;
    if (deliveredNonGiftProducts.length === 0) return true;
    return isDeliveryAddressComplete(bookerInfo.deliveryAddress);
  }, [bookerEmailStage, bookerInfo, deliveredNonGiftProducts.length]);

  const isGiftStepComplete = useMemo(() => {
    return giftItems.every((item) => {
      const recipient = giftRecipients[item.id];
      if (!recipient?.firstName?.trim() || !recipient?.lastName?.trim() || !recipient?.email?.trim() || !recipient?.phone?.trim()) {
        return false;
      }
      if (item.type === "product" && item.fulfillmentType === "delivery") {
        return isDeliveryAddressComplete(recipient.address);
      }
      return true;
    });
  }, [giftItems, giftRecipients]);

  const isCurrentStepComplete = (() => {
    switch (step) {
      case "cart":
        return isCartComplete;
      case "scheduling":
        return isSchedulingComplete;
      case "booker":
        return isBookerInfoComplete;
      case "gifts":
        return isGiftStepComplete;
      case "review":
        return true;
      default:
        return false;
    }
  })();

  const handleNext = () => {
    if (step === "cart") {
      setStep(scheduleNowItems.length > 0 ? "scheduling" : "booker");
      return;
    }
    if (step === "scheduling") {
      setStep("booker");
      return;
    }
    if (step === "booker") {
      setStep(giftItems.length > 0 ? "gifts" : "review");
      return;
    }
    if (step === "gifts") {
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "cart") {
      onOpenChange(false);
    } else if (step === "scheduling") {
      setStep("cart");
    } else if (step === "booker") {
      setBookerError("");
      setBookerEmailStage("email");
      setBookerResolution(null);
      setBookerPassword("");
      setBookerOtp("");
      setStep(scheduleNowItems.length > 0 ? "scheduling" : "cart");
    } else if (step === "gifts") {
      setStep("booker");
    } else if (step === "review") {
      setStep(giftItems.length > 0 ? "gifts" : "booker");
    } else if (step === "payment") {
      setStep("review");
    }
  };

  const buildSubmissionItems = () =>
    items.map((item) => ({
      ...item,
      locationId: item.branchId,
      locationName: getItemLocationName(item),
      giftRecipient: item.isGift ? giftRecipients[item.id] : undefined,
    }));

  const fetchBookingPrefill = async (accessToken?: string) => {
    const { data, error } = await supabase.functions.invoke("public-booking-prefill", {
      body: { tenantId: salon.id },
      headers: accessToken
        ? {
          Authorization: `Bearer ${accessToken}`,
        }
        : undefined,
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || "Failed to load saved details");
    }

    if (data?.found && data.profile) {
      setBookerInfo((prev) => ({
        ...prev,
        firstName: data.profile.firstName || prev.firstName,
        lastName: data.profile.lastName || prev.lastName,
        email: data.profile.email || prev.email,
        phone: data.profile.phone || prev.phone,
        notes: data.profile.notes || prev.notes,
        deliveryAddress: data.profile.deliveryAddress || prev.deliveryAddress,
      }));
    }
  };

  const sendBookerOtp = async (email: string) => {
    const { data, error } = await supabase.functions.invoke("send-client-login-otp", {
      body: { email },
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || "Failed to send verification email");
    }

    setBookerResendAvailableAt(new Date(Date.now() + 60_000).toISOString());
  };

  const handleBookerEmailContinue = async () => {
    const normalizedEmail = bookerInfo.email.trim().toLowerCase();
    setBookerError("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setBookerError("Please enter a valid email address.");
      return;
    }

    setIsBookerProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-resolve-identifier", {
        body: { identifier: normalizedEmail },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to verify email");
      }

      setBookerInfo((prev) => ({ ...prev, email: normalizedEmail }));
      const resolution: BookerResolution = {
        exists: Boolean(data?.exists),
        identifier: data?.identifier || normalizedEmail,
        identifierType: data?.identifierType || "email",
        hasPassword: Boolean(data?.hasPassword),
        requiresOtp: Boolean(data?.requiresOtp),
      };

      setBookerResolution(resolution);
      setBookerHasExistingAccount(resolution.exists);

      if (!resolution.exists) {
        setBookerEmailStage("details");
        return;
      }

      if (resolution.hasPassword) {
        setBookerPassword("");
        setBookerEmailStage("password");
        return;
      }

      if (resolution.requiresOtp) {
        await sendBookerOtp(resolution.identifier);
        setBookerEmailStage("otp");
        return;
      }

      setBookerEmailStage("details");
    } catch (error) {
      setBookerError(error instanceof Error ? error.message : "Failed to verify email");
    } finally {
      setIsBookerProcessing(false);
    }
  };

  const handleBookerOtpSubmit = async () => {
    setBookerError("");
    if (bookerOtp.length !== 8) {
      setBookerError("Please enter the 8-digit code.");
      return;
    }

    setIsBookerProcessing(true);
    try {
      const email = bookerResolution?.identifier || bookerInfo.email.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: bookerOtp,
        type: "email",
      });

      if (error) {
        throw new Error("Invalid or expired code. Please try again.");
      }

      if (!data.session) {
        throw new Error("Verification failed. Please try again.");
      }

      await supabase.auth.setSession(data.session);
      await fetchBookingPrefill(data.session.access_token);
      setBookerEmailStage("details");
      setBookerOtp("");
    } catch (error) {
      setBookerError(error instanceof Error ? error.message : "Failed to verify email");
    } finally {
      setIsBookerProcessing(false);
    }
  };

  const handleBookerOtpResend = async () => {
    if (bookerOtpCountdown > 0 || !bookerResolution?.identifier) return;
    setBookerError("");
    setIsBookerProcessing(true);
    try {
      await sendBookerOtp(bookerResolution.identifier);
    } catch (error) {
      setBookerError(error instanceof Error ? error.message : "Failed to resend code");
    } finally {
      setIsBookerProcessing(false);
    }
  };

  const handleBookerPasswordSubmit = async () => {
    if (!bookerResolution || !bookerPassword.trim()) {
      setBookerError("Enter your password to continue.");
      return;
    }

    setBookerError("");
    setIsBookerProcessing(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: bookerResolution.identifier,
        password: bookerPassword,
      });

      if (error) {
        throw new Error("Incorrect password. Please try again.");
      }

      if (!data.session) {
        throw new Error("Sign-in failed. Please try again.");
      }

      await fetchBookingPrefill(data.session.access_token);
      setBookerEmailStage("details");
      setBookerPassword("");
    } catch (error) {
      setBookerError(error instanceof Error ? error.message : "Failed to sign in");
    } finally {
      setIsBookerProcessing(false);
    }
  };

  const resetBookerIdentity = () => {
    setBookerEmailStage("email");
    setBookerResolution(null);
    setBookerHasExistingAccount(false);
    setBookerPassword("");
    setBookerOtp("");
    setBookerError("");
  };

  const handleCreateBooking = async (includePaymentSession = false, customPaymentAmount?: number) => {
    try {
      // For split payment mode, purse is handled in webhook after payment success
      // so we don't send purseAmount to backend to avoid double deduction
      const purseAmountForBackend = paymentMode === "split" || paymentMode === "purse" ? 0 : purseAmount;
      
      const requestBody: any = {
        tenantId: salon.id,
        customer: bookerInfo,
        items: buildSubmissionItems(),
        payAtSalon: paymentOption === "pay_at_salon",
        voucherCode: appliedVoucher?.code || null,
        voucherDiscount,
        purseAmount: purseAmountForBackend,
        depositAmount: paymentOption === "pay_deposit" ? depositAmount : 0,
        giftsBelongToSamePerson: meta.giftsBelongToSamePerson,
      };

      // Add payment session creation parameters if needed
      if (includePaymentSession) {
        const paymentAmountToUse = customPaymentAmount ?? amountDueNow;
        requestBody.createPaymentSession = true;
        requestBody.paymentAmount = paymentAmountToUse;
        requestBody.paymentCurrency = salon.currency;
        requestBody.paymentDescription = paymentOption === "pay_deposit"
          ? "Booking Deposit"
          : paymentMode === "split"
            ? `Booking Payment (${formatCurrency(splitPurseAmount, salon.currency)} from purse)`
            : "Booking Payment";
        requestBody.paymentIsDeposit = paymentOption === "pay_deposit";
        requestBody.paymentSuccessUrl = window.location.href;
        requestBody.paymentCancelUrl = window.location.href;
        requestBody.preferredPaymentGateway = selectedGateway;
        
        // For split payment, pass purse info to be handled in webhook
        if (paymentMode === "split" && splitPurseAmount > 0 && customerId) {
          requestBody.splitPurseAmount = splitPurseAmount;
          requestBody.splitCustomerId = customerId;
        }
      }

      // For purse-only payment, trigger backend processing (mimics webhook for security)
      // This handles both cases:
      // 1. User explicitly selects purse mode in Payment step (paymentMode === "purse")
      // 2. User applies purse in Review step that covers full amount (purseAmount > 0 && afterPurse === 0)
      const isPurseOnlyPayment = (paymentMode === "purse" && amountDueNow > 0) || 
                                  (purseAmount > 0 && afterPurse === 0 && !includePaymentSession);
      
      if (isPurseOnlyPayment && customerId) {
        requestBody.processPursePayment = true;
        requestBody.pursePaymentCustomerId = customerId;
        requestBody.paymentAmount = purseAmount; // Use purseAmount, not amountDueNow which is 0
      }

      const { data, error } = await supabase.functions.invoke("create-public-booking", {
        body: requestBody,
      });

      if (error) {
        console.error("Supabase function error:", error);
        throw error;
      }

      if (data?.error) {
        console.error("Function returned error:", data.error, data.details);
        throw new Error(data.error);
      }

      return data as {
        reference?: string;
        appointmentId?: string;
        appointmentIds?: string[];
        checkoutUrl?: string;
        paymentGateway?: string;
      };
    } catch (err) {
      console.error("handleCreateBooking failed:", err);
      throw err;
    }
  };

  const handleProceedToPayment = () => {
    if (amountDueNow > 0) {
      setStep("payment");
      return;
    }
    void handleSubmitBooking();
  };

  const handlePaymentModeChange = (mode: PaymentMode, purseAmt: number, cardAmt: number) => {
    setPaymentMode(mode);
    setSplitPurseAmount(purseAmt);
    setSplitCardAmount(cardAmt);
  };

  const handlePaymentSubmit = async () => {
    setIsSubmitting(true);
    try {
      // For purse-only payment, backend handles everything (debit, credit salon, transactions, notifications)
      if (paymentMode === "purse") {
        const booking = await handleCreateBooking(false);
        setBookingReference(booking.reference || "CONFIRMED");
        setStep("confirmation");
        clearCart();
        return;
      }

      // For split payment, create booking with payment session for card amount
      // Purse will be debited in webhook after payment success
      if (paymentMode === "split") {
        const booking = await handleCreateBooking(true, splitCardAmount);

        // Redirect to payment gateway for card portion
        if (booking.checkoutUrl) {
          window.location.href = booking.checkoutUrl;
          return;
        }

        throw new Error("Failed to create payment session");
      }

      // For card payment, create booking with integrated payment session
      if (paymentMode === "card") {
        const booking = await handleCreateBooking(true);

        if (booking.checkoutUrl) {
          window.location.href = booking.checkoutUrl;
          return;
        }

        throw new Error("Failed to create payment session");
      }
    } catch (err: unknown) {
      console.error("Payment error:", err);
      const message = await extractFunctionErrorMessage(err);
      toast({
        title: "Payment failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitBooking = async () => {
    setIsSubmitting(true);
    try {
      // Check if purse is being used to pay the full amount
      const isPursePayment = purseAmount > 0 && afterPurse === 0 && customerId;
      
      const booking = await handleCreateBooking(false);
      
      // If paying with purse, the backend handles everything
      // Otherwise, it's a pay-at-salon booking
      setBookingReference(booking.reference || "CONFIRMED");
      setStep("confirmation");
      clearCart();
    } catch (err: unknown) {
      console.error("Booking error:", err);
      const message = await extractFunctionErrorMessage(err);
      toast({
        title: "Booking failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step === "confirmation") {
      setStep("cart");
      setBookerInfo({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        notes: "",
        deliveryAddress: emptyDeliveryAddress,
      });
      setGiftRecipients({});
      setBookingReference(null);
      setAppliedVoucher(null);
      setPurseAmount(0);
      setPaymentOption("pay_at_salon");
      updateMeta({ giftsBelongToSamePerson: true });
    }
    onOpenChange(false);
  };

  useEffect(() => {
    if (open) setStep("cart");
  }, [open]);

  const brandColor = salon.brand_color || "#2563EB";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 gap-0"
        style={{ "--brand-color": brandColor } as React.CSSProperties}
      >
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogDescription className="sr-only">
            Complete your booking by reviewing your cart, schedule, and payment details.
          </DialogDescription>
          <DialogTitle>Complete Checkout</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 min-w-max">
            {stepConfig.map((entry, index) => (
              <div key={entry.key} className="flex items-center gap-2 shrink-0">
                <div
                  className={`flex items-center gap-1.5 ${step === entry.key
                    ? "text-primary"
                    : currentStepIndex > index
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                    }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center border-2 shrink-0 ${step === entry.key
                      ? "text-white border-transparent"
                      : currentStepIndex > index
                        ? "border-muted-foreground bg-muted"
                        : "border-muted"
                      }`}
                    style={step === entry.key ? { backgroundColor: "var(--brand-color)" } : undefined}
                  >
                    {entry.icon}
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap">{entry.label}</span>
                </div>
                {index < stepConfig.length - 1 && <div className="w-6 h-px bg-muted shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-4">
            {step === "cart" && (
              <CartStep
                currency={salon.currency}
                onBrowse={handleClose}
              />
            )}

            {step === "scheduling" && (
              <SchedulingStep
                salon={salon}
                locations={locations}
                items={scheduleNowItems}
                onItemChange={updateItem}
              />
            )}

            {step === "booker" && (
              <BookerInfoStep
                info={bookerInfo}
                onChange={setBookerInfo}
                requiresDeliveryAddress={deliveredNonGiftProducts.length > 0}
                deliveryCountryCode={deliveryCountryCode}
                emailStage={bookerEmailStage}
                password={bookerPassword}
                otpCode={bookerOtp}
                otpCountdown={bookerOtpCountdown}
                isProcessingEmail={isBookerProcessing}
                hasExistingAccount={bookerHasExistingAccount}
                verificationError={bookerError}
                onEmailContinue={handleBookerEmailContinue}
                onPasswordChange={setBookerPassword}
                onPasswordSubmit={handleBookerPasswordSubmit}
                onResetIdentity={resetBookerIdentity}
                onOtpChange={setBookerOtp}
                onOtpSubmit={handleBookerOtpSubmit}
                onOtpResend={handleBookerOtpResend}
              />
            )}

            {step === "gifts" && (
              <GiftRecipientsStep
                giftItems={giftItems}
                recipients={giftRecipients}
                onRecipientsChange={setGiftRecipients}
                sameRecipient={meta.giftsBelongToSamePerson}
                onSameRecipientChange={(value) => updateMeta({ giftsBelongToSamePerson: value })}
              />
            )}

            {step === "review" && (
              <ReviewStep
                items={items}
                bookerInfo={bookerInfo}
                giftRecipients={giftRecipients}
                salon={{
                  id: salon.id,
                  currency: salon.currency,
                  pay_at_salon_enabled: salon.pay_at_salon_enabled,
                  deposits_enabled: salon.deposits_enabled,
                  default_deposit_percentage: salon.default_deposit_percentage,
                }}
                paymentOption={paymentOption}
                onPaymentOptionChange={setPaymentOption}
                appliedVoucher={appliedVoucher}
                onVoucherApplied={setAppliedVoucher}
                purseAmount={purseAmount}
                onPurseApplied={setPurseAmount}
                selectedCountryCode={selectedCountryCode}
                subtotal={subtotal}
                voucherDiscount={voucherDiscount}
                afterVoucher={afterVoucher}
                afterPurse={afterPurse}
                depositAmount={depositAmount}
                amountDueNow={amountDueNow}
                amountDueAtSalon={amountDueAtSalon}
              />
            )}

            {step === "payment" && (
              <PaymentStep
                amountDue={amountDueNow}
                totalBeforePurse={afterVoucher}
                currency={salon.currency}
                country={selectedCountryCode || salon.country || "US"}
                onGatewaySelect={setSelectedGateway}
                onSubmit={handlePaymentSubmit}
                isSubmitting={isSubmitting}
                brandColor={brandColor}
                purseBalance={purseBalance}
                customerId={customerId || undefined}
                customerEmail={bookerInfo.email}
                tenantId={salon.id}
                onPaymentModeChange={handlePaymentModeChange}
              />
            )}

            {step === "confirmation" && (
              <div className="text-center py-8 space-y-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
                <p className="text-muted-foreground">Your booking has been successfully submitted.</p>
                {bookingReference && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Reference Number</p>
                    <p className="text-xl font-mono font-bold">{bookingReference}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  A confirmation email has been sent to {bookerInfo.email}
                </p>
              </div>
            )}
          </div>
        </div>

        {step !== "confirmation" && step !== "payment" && (
          <div className="border-t bg-background shrink-0">
            <div className="p-4 flex items-center justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {step === "cart" ? "Close" : "Back"}
              </Button>

              {step === "review" ? (
                <Button
                  onClick={handleProceedToPayment}
                  disabled={isSubmitting}
                  className="border-0"
                  style={{
                    backgroundColor: "var(--brand-color)",
                    color: "var(--brand-foreground, white)",
                  }}
                >
                  {isSubmitting ? "Submitting..." : amountDueNow > 0 ? "Continue to Payment" : "Confirm Booking"}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={!isCurrentStepComplete}
                  className="border-0"
                  style={{
                    backgroundColor: "var(--brand-color)",
                    color: "var(--brand-foreground, white)",
                  }}
                >
                  Continue
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "confirmation" && (
          <div className="border-t bg-background p-4 shrink-0">
            <Button
              className="w-full text-white border-0"
              onClick={handleClose}
              style={{ backgroundColor: "var(--brand-color)" }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
