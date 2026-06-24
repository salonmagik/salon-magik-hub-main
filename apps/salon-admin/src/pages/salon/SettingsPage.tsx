import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Skeleton } from "@ui/skeleton";
import { Badge } from "@ui/badge";
import { Textarea } from "@ui/textarea";
import { Progress } from "@ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { TimePicker } from "@ui/time-picker";
import {
  Building2,
  Clock,
  User,
  CreditCard,
  Bell,
  Shield,
  Zap,
  Upload,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Save,
  Copy,
  Check,
  CheckCircle,
  X,
  Image as ImageIcon,
  Link2,
  Gift,
  Share2,
  Ticket,
  Wallet,
  Banknote,
  ArrowDownUp,
  CalendarX2,
  Globe,
  Eye,
  ExternalLink,
  Palette,
  Sparkles,
} from "lucide-react";
import { cn } from "@shared/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useMyReferralCodes, useMyReferralDiscounts, useGenerateReferralCode } from "@/hooks/useReferrals";
import { supabase } from "@/lib/supabase";
import { buildPublicBookingUrl } from "@/lib/bookingUrl";
import { toast } from "@ui/ui/use-toast";
import { differenceInDays, format } from "date-fns";
import { SalonWalletCard } from "@/components/billing/SalonWalletCard";
import { WalletLedger } from "@/components/billing/WalletLedger";
import { PayoutDestinationsManager } from "@/components/billing/PayoutDestinationsManager";
import { WithdrawalHistory } from "@/components/billing/WithdrawalHistory";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useClaimTenantSalesPromo, useTenantSalesPromo } from "@/hooks/useSalesPromo";
import { usePlans } from "@/hooks/usePlans";
import { CustomDomainManager } from "./CustomDomainManager";
import { useTenantEntitlements } from "@/hooks/useTenantEntitlements";
import { BookingThemePreview } from "@/components/settings/BookingThemePreview";
import { formatCurrency } from "@shared/currency";


type SettingsScope = "auto" | "legacy" | "business" | "branch";

interface BranchUnavailabilityWindow {
  id: string;
  location_id: string;
  starts_at: string;
  ends_at: string | null;
  is_indefinite: boolean;
  reason: string | null;
  ended_at: string | null;
}

const BASE_SETTINGS_TABS = [
  { id: "profile", label: "Salon Profile", icon: Building2 },
  { id: "hours", label: "Business Hours", icon: Clock },
  { id: "booking", label: "Booking Settings", icon: User },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "payout-destinations", label: "Payout Destinations", icon: Banknote },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowDownUp },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "subscription", label: "Subscription", icon: Zap },
  { id: "custom-domain", label: "Custom Domain", icon: Globe },
] as const;

const weekDays = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const PLAN_CONFIG_ERROR_MESSAGES: Record<string, string> = {
  BRANCHES_BELOW_ACTIVE_LOCATIONS: "You can't go below the number of branches you currently have open. Close a branch first if you want to reduce this.",
  SEATS_BELOW_ACTIVE_STAFF: "You can't go below the number of team members currently on your team. Remove a team member first if you want to reduce this.",
  CHAIN_TIER_CUSTOM_REQUIRED: "That many branches needs a custom plan. Contact support to set this up.",
  PLAN_PRICE_NOT_FOUND: "Pricing isn't set up for your plan and currency yet. Contact support.",
  TENANT_ACCESS_DENIED: "You don't have access to manage billing for this business.",
  PLAN_CONFIGURATION_FORBIDDEN: "Only the business owner can change billing configuration.",
  PLAN_CONFIGURATION_INPUT_INVALID: "Enter a valid number of branches and seats.",
};

function describePlanConfigError(message: string | undefined, fallback = "Could not price this configuration."): string {
  if (!message) return fallback;
  return PLAN_CONFIG_ERROR_MESSAGES[message] || message;
}

interface SettingsPageProps {
  scope?: SettingsScope;
}

type BookingThemeKey = "default" | "ecommerce";
type BookingSettingsSubTab = "booking_config" | "themes_and_style";

export default function SettingsPage({ scope = "auto" }: SettingsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSaving, setIsSaving] = useState(false);
  const { currentTenant, profile, user, activeContextType, activeLocationId, refreshTenants } = useAuth();
  const { locations, defaultLocation, isLoading: locationsLoading, refetch: refetchLocations } = useLocations();
  const {
    settings: dbNotificationSettings,
    isLoading: notificationsLoading,
    isSaving: notificationsSaving,
    saveSettings: saveNotificationSettings
  } = useNotificationSettings();
  const [subscriptionPromoCode, setSubscriptionPromoCode] = useState("");
  const [isStartingSubscriptionCheckout, setIsStartingSubscriptionCheckout] = useState(false);
  const [isPurchasingTheme, setIsPurchasingTheme] = useState(false);
  const [branchesInput, setBranchesInput] = useState("1");
  const [seatsInput, setSeatsInput] = useState("1");
  const [planConfigQuote, setPlanConfigQuote] = useState<{
    current_plan_slug: string;
    current_allowed_locations: number;
    current_allowed_staff: number;
    current_monthly_price: number;
    required_plan_slug: string;
    total_monthly_price: number | null;
    price_delta: number | null;
    requires_custom_locations: boolean;
    currency: string;
  } | null>(null);
  const [isQuotingPlanConfig, setIsQuotingPlanConfig] = useState(false);
  const [planConfigQuoteError, setPlanConfigQuoteError] = useState<string | null>(null);
  const [isApplyingPlanConfig, setIsApplyingPlanConfig] = useState(false);
  const claimTenantPromo = useClaimTenantSalesPromo();
  const { data: subscriptionPromo } = useTenantSalesPromo("subscription");
  const { data: activeTenantPromo } = useTenantSalesPromo();
  const { data: plans } = usePlans();
  const { data: entitlements, refetch: refetchEntitlements } = useTenantEntitlements(currentTenant?.id);
  const currentPlan = plans?.find((plan) => plan.slug === currentTenant?.plan);

  const { data: ecommerceThemePricing } = useQuery({
    queryKey: ["theme-addon-pricing", currentTenant?.country, currentTenant?.currency],
    enabled: Boolean(currentTenant?.country && currentTenant?.currency),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_addon_pricing" as any)
        .select("unit_price")
        .eq("theme_key", "ecommerce")
        .eq("country_code", currentTenant?.country || "")
        .eq("currency", currentTenant?.currency || "USD")
        .eq("status", "active")
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? Number((data as any).unit_price || 0) : 0;
    },
    staleTime: 1000 * 60,
  });

  const isChain = currentTenant?.plan === "chain";
  const resolvedScope: Exclude<SettingsScope, "auto"> =
    scope === "auto"
      ? isChain
        ? activeContextType === "owner_hub"
          ? "business"
          : "branch"
        : "legacy"
      : scope;

  const settingsTabs = useMemo(() => {
    if (resolvedScope === "branch") {
      return [
        { id: "profile", label: "Branch Profile", icon: Building2 },
        { id: "hours", label: "Branch Hours", icon: Clock },
      ];
    }
    if (resolvedScope === "business") {
      return [
        { id: "profile", label: "Business Profile", icon: Building2 },
        { id: "branches", label: "Manage Branches", icon: CalendarX2 },
        { id: "booking", label: "Booking Settings", icon: User },
        { id: "payments", label: "Payments", icon: CreditCard },
        { id: "notifications", label: "Notifications", icon: Bell },
        { id: "subscription", label: "Subscription", icon: Zap },
        { id: "custom-domain", label: "Custom Domain", icon: Globe },
      ];
    }
    return BASE_SETTINGS_TABS;
  }, [resolvedScope]);

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && settingsTabs.some((t) => t.id === tab) ? tab : "profile";
  });

  const { wallet } = useSalonWallet(currentTenant?.id);

  // Seed the branches/seats inputs from entitlements, and re-seed whenever
  // entitlements change (e.g. right after a payment completes) as long as
  // the user hasn't started editing away from the last-seeded values —
  // otherwise a fresh payment's redirect would leave the inputs showing the
  // pre-payment numbers until a manual refresh.
  const lastSeededRef = useRef<{ branches: string; seats: string } | null>(null);
  useEffect(() => {
    if (!entitlements) return;
    const nextBranches = String(entitlements.allowed_locations || 1);
    const nextSeats = String(entitlements.allowed_staff || 1);
    const last = lastSeededRef.current;
    const userHasNotEditedSinceLastSeed =
      !last || (branchesInput === last.branches && seatsInput === last.seats);
    if (userHasNotEditedSinceLastSeed) {
      setBranchesInput(nextBranches);
      setSeatsInput(nextSeats);
      lastSeededRef.current = { branches: nextBranches, seats: nextSeats };
    }
  }, [entitlements]);

  // Debounced live quote for the branches/seats configuration inputs.
  // quoteRequestIdRef guards against an older, slower request resolving
  // after a newer one and clobbering its result/error.
  const quoteRequestIdRef = useRef(0);
  useEffect(() => {
    if (!currentTenant?.id) return;
    const branches = Number(branchesInput);
    const seats = Number(seatsInput);
    if (!Number.isFinite(branches) || !Number.isFinite(seats) || branches < 1 || seats < 0) {
      setPlanConfigQuote(null);
      setPlanConfigQuoteError(null);
      return;
    }

    setIsQuotingPlanConfig(true);
    setPlanConfigQuoteError(null);
    const requestId = ++quoteRequestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("compute_plan_configuration", {
          p_tenant_id: currentTenant.id,
          p_branches: branches,
          p_seats: seats,
        });
        if (error) throw error;
        if (quoteRequestIdRef.current !== requestId) return;
        setPlanConfigQuote(data?.[0] || null);
        setPlanConfigQuoteError(null);
      } catch (error) {
        if (quoteRequestIdRef.current !== requestId) return;
        setPlanConfigQuote(null);
        setPlanConfigQuoteError(describePlanConfigError(error instanceof Error ? error.message : undefined));
      } finally {
        if (quoteRequestIdRef.current === requestId) setIsQuotingPlanConfig(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [branchesInput, seatsInput, currentTenant?.id]);

  const applyPlanConfiguration = async () => {
    if (!currentTenant?.id || !planConfigQuote) return;
    const branches = Number(branchesInput);
    const seats = Number(seatsInput);

    setIsApplyingPlanConfig(true);
    try {
      const isIncrease = (planConfigQuote.price_delta || 0) > 0;

      if (isIncrease) {
        const { data, error } = await supabase.functions.invoke("create-plan-configuration-checkout-session", {
          body: {
            tenantId: currentTenant.id,
            branches,
            seats,
            successUrl: `${window.location.origin}/salon/settings?tab=subscription&planconfig=success`,
            cancelUrl: `${window.location.origin}/salon/settings?tab=subscription&planconfig=cancelled`,
          },
        });
        if (error) throw error;

        if (data?.url) {
          window.location.href = data.url;
          return;
        }

        // Charged immediately via stored card — no redirect needed.
        await Promise.all([refreshTenants(), refetchEntitlements()]);
        toast({
          title: "Billing updated",
          description: `You're now on the ${planConfigQuote.required_plan_slug} plan.`,
        });
      } else {
        const { error } = await (supabase.rpc as any)("apply_plan_configuration", {
          p_tenant_id: currentTenant.id,
          p_branches: branches,
          p_seats: seats,
          p_source: "settings_subscription",
          p_reason: "Tenant updated branches/seats from subscription settings.",
        });
        if (error) throw error;

        await Promise.all([refreshTenants(), refetchEntitlements()]);
        toast({
          title: "Billing updated",
          description: `You're now on the ${planConfigQuote.required_plan_slug} plan. No charge — this was a decrease.`,
        });
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: describePlanConfigError(error instanceof Error ? error.message : undefined, "Unable to update your plan configuration right now."),
        variant: "destructive",
      });
    } finally {
      setIsApplyingPlanConfig(false);
    }
  };

  // Sync tab with URL params
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && settingsTabs.some((t) => t.id === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab, settingsTabs]);

  useEffect(() => {
    if (!settingsTabs.some((tab) => tab.id === activeTab)) {
      const nextTab = settingsTabs[0]?.id ?? "profile";
      setActiveTab(nextTab);
      setSearchParams({ tab: nextTab });
    }
  }, [activeTab, setSearchParams, settingsTabs]);

  // Handle top-up success/cancel notifications
  useEffect(() => {
    const topupStatus = searchParams.get("topup");
    const subscriptionStatus = searchParams.get("subscription");
    
    if (topupStatus === "success") {
      toast({
        title: "Top-Up Successful",
        description: "Your wallet has been topped up successfully. Funds will appear in your balance shortly.",
      });
      
      // Clean up URL parameter
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("topup");
      setSearchParams(newParams, { replace: true });
    } else if (topupStatus === "cancelled") {
      toast({
        title: "Top-Up Cancelled",
        description: "Your top-up was cancelled. No charges were made.",
        variant: "destructive",
      });
      
      // Clean up URL parameter
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("topup");
      setSearchParams(newParams, { replace: true });
    }

    if (subscriptionStatus === "success") {
      // currentTenant loads asynchronously after a hard redirect back from
      // Paystack — wait for it instead of consuming the URL params before
      // we're able to actually verify the payment.
      if (!currentTenant?.id) {
        return;
      }

      // Paystack appends ?trxref=xxx&reference=xxx to the callback URL
      const reference = searchParams.get("reference") || searchParams.get("trxref");

      const cleanParams = new URLSearchParams(searchParams);
      cleanParams.delete("subscription");
      cleanParams.delete("reference");
      cleanParams.delete("trxref");
      setSearchParams(cleanParams, { replace: true });

      if (reference) {
        supabase.functions
          .invoke("verify-subscription-payment", {
            body: { reference, tenantId: currentTenant.id },
          })
          .then(async ({ error }) => {
            if (error) {
              console.error("Subscription verification error:", error);
            }
            await refreshTenants();
            toast({
              title: "Subscription activated",
              description: "Your plan is now active.",
            });
          });
      } else {
        refreshTenants().then(() => {
          toast({
            title: "Payment received",
            description: "Your subscription status will update shortly.",
          });
        });
      }
    } else if (subscriptionStatus === "cancelled") {
      toast({
        title: "Subscription checkout cancelled",
        description: "No subscription changes were made.",
        variant: "destructive",
      });

      const newParams = new URLSearchParams(searchParams);
      newParams.delete("subscription");
      setSearchParams(newParams, { replace: true });
    }

    const planConfigStatus = searchParams.get("planconfig");
    if (planConfigStatus === "success") {
      // Only the first-time-payer redirect fallback lands here — the stored-card
      // path applies the change synchronously and never sets this param.
      // currentTenant loads asynchronously after a hard redirect back from
      // Paystack — wait for it instead of consuming the URL params (and
      // silently skipping the verify+apply call) before it's ready.
      if (!currentTenant?.id) {
        return;
      }

      const reference = searchParams.get("reference") || searchParams.get("trxref");

      const cleanParams = new URLSearchParams(searchParams);
      cleanParams.delete("planconfig");
      cleanParams.delete("reference");
      cleanParams.delete("trxref");
      setSearchParams(cleanParams, { replace: true });

      if (reference) {
        supabase.functions
          .invoke("verify-plan-configuration-payment", {
            body: { reference, tenantId: currentTenant.id },
          })
          .then(async ({ error }) => {
            if (error) {
              console.error("Plan configuration verification error:", error);
              toast({
                title: "Could not confirm payment",
                description: "Contact support if the change doesn't apply shortly.",
                variant: "destructive",
              });
              return;
            }
            await Promise.all([refreshTenants(), refetchEntitlements()]);
            toast({
              title: "Billing updated",
              description: "Your branches and team seats have been updated.",
            });
          });
      }
    } else if (planConfigStatus === "cancelled") {
      toast({
        title: "Billing update cancelled",
        description: "No changes were made.",
        variant: "destructive",
      });

      const newParams = new URLSearchParams(searchParams);
      newParams.delete("planconfig");
      setSearchParams(newParams, { replace: true });
    }

    const themePurchaseStatus = searchParams.get("themepurchase");
    if (themePurchaseStatus === "success") {
      // Only the first-time-payer redirect fallback lands here — the stored-card
      // path applies the change synchronously and never sets this param.
      if (!currentTenant?.id) {
        return;
      }

      const reference = searchParams.get("reference") || searchParams.get("trxref");

      const cleanParams = new URLSearchParams(searchParams);
      cleanParams.delete("themepurchase");
      cleanParams.delete("reference");
      cleanParams.delete("trxref");
      setSearchParams(cleanParams, { replace: true });

      if (reference) {
        supabase.functions
          .invoke("verify-theme-purchase-payment", {
            body: { reference, tenantId: currentTenant.id },
          })
          .then(async ({ error }) => {
            if (error) {
              console.error("Theme purchase verification error:", error);
              toast({
                title: "Could not confirm payment",
                description: "Contact support if the theme doesn't activate shortly.",
                variant: "destructive",
              });
              return;
            }
            await refetchEntitlements();
            toast({
              title: "Theme activated",
              description: "The e-commerce storefront theme is now active for your public booking page.",
            });
          });
      }
    } else if (themePurchaseStatus === "cancelled") {
      toast({
        title: "Theme purchase cancelled",
        description: "No charges were made.",
        variant: "destructive",
      });

      const newParams = new URLSearchParams(searchParams);
      newParams.delete("themepurchase");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, currentTenant?.id]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  const [profileData, setProfileData] = useState({
    salonName: "",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    currency: "USD",
    website: "",
  });

  const [hoursData, setHoursData] = useState({
    openingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
    openingTime: "09:00",
    closingTime: "18:00",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailAppointmentReminders: true,
    smsAppointmentReminders: false,
    emailNewBookings: true,
    emailCancellations: true,
    emailTransactionAlerts: true,
    inAppTransactionAlerts: true,
    emailDailyDigest: false,
  });

  const [bookingSettings, setBookingSettings] = useState({
    onlineBookingEnabled: false,
    autoConfirmBookings: false,
    depositsEnabled: false,
    defaultBufferMinutes: 0,
    cancellationGraceHours: 24,
    defaultDepositPercentage: 0,
    bookingStatusMessage: "",
    bookingPageBio: "",
    slotCapacityDefault: 1,
    brandColor: "#2563EB",
    storefrontMode: "both" as "services" | "products" | "both",
    allowStaffSelection: true,
    requireStaffSelection: false,
    autoAssignStaff: true,
  });
  const [cancellationGraceHoursInput, setCancellationGraceHoursInput] = useState("24");
  const [defaultDepositPercentageInput, setDefaultDepositPercentageInput] = useState("0");
  const [slotCapacityDefaultInput, setSlotCapacityDefaultInput] = useState("1");
  const [bookingSubTab, setBookingSubTab] = useState<BookingSettingsSubTab>("booking_config");

  const startSubscriptionCheckout = async () => {
    if (!currentTenant?.id) {
      toast({
        title: "Subscription unavailable",
        description: "Your current tenant could not be resolved.",
        variant: "destructive",
      });
      return;
    }

    setIsStartingSubscriptionCheckout(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          tenantId: currentTenant.id,
          successUrl: `${window.location.origin}/salon/settings?tab=subscription&subscription=success`,
          cancelUrl: `${window.location.origin}/salon/settings?tab=subscription&subscription=cancelled`,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.url) {
        throw new Error("No checkout URL returned.");
      }

      window.location.href = data.url;
    } catch (error) {
      console.error("Failed to start subscription checkout:", error);
      toast({
        title: "Checkout unavailable",
        description: error instanceof Error ? error.message : "Unable to start subscription checkout right now.",
        variant: "destructive",
      });
    } finally {
      setIsStartingSubscriptionCheckout(false);
    }
  };

  const purchaseThemeAddon = async () => {
    if (!currentTenant?.id) return;

    setIsPurchasingTheme(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-theme-purchase-checkout-session", {
        body: {
          tenantId: currentTenant.id,
          themeKey: "ecommerce",
          successUrl: `${window.location.origin}/salon/settings?tab=subscription&themepurchase=success`,
          cancelUrl: `${window.location.origin}/salon/settings?tab=subscription&themepurchase=cancelled`,
        },
      });
      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      // Charged immediately via stored card — no redirect needed.
      await refetchEntitlements();
      toast({
        title: "Theme activated",
        description: "The e-commerce storefront theme is now active for your public booking page.",
      });
    } catch (error) {
      toast({
        title: "Theme activation failed",
        description: error instanceof Error ? error.message : "Unable to activate the theme right now.",
        variant: "destructive",
      });
    } finally {
      setIsPurchasingTheme(false);
    }
  };

  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);
  const activeLocation =
    locations.find((location) => location.id === activeLocationId) ?? defaultLocation ?? null;

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrls, setBannerUrls] = useState<string[]>([]);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [themePreviewOpen, setThemePreviewOpen] = useState(false);
  const [themePreviewKey, setThemePreviewKey] = useState<BookingThemeKey>("default");
  const [profileBaseline, setProfileBaseline] = useState({
    salonName: "",
    city: "",
    address: "",
    currency: "USD",
    ownerName: "",
    phone: "",
  });
  const [hoursBaseline, setHoursBaseline] = useState({
    openingDays: [] as string[],
    openingTime: "09:00",
    closingTime: "18:00",
  });
  const [bookingBaseline, setBookingBaseline] = useState({
    onlineBookingEnabled: false,
    autoConfirmBookings: false,
    depositsEnabled: false,
    defaultBufferMinutes: 0,
    cancellationGraceHours: 24,
    defaultDepositPercentage: 0,
    bookingStatusMessage: "",
    bookingPageBio: "",
    slotCapacityDefault: 1,
    brandColor: "#2563EB",
    storefrontMode: "both" as "services" | "products" | "both",
    allowStaffSelection: true,
    requireStaffSelection: false,
    autoAssignStaff: true,
  });
  const [branchWindows, setBranchWindows] = useState<BranchUnavailabilityWindow[]>([]);
  const [branchWindowsLoading, setBranchWindowsLoading] = useState(false);
  const [branchWindowDialogOpen, setBranchWindowDialogOpen] = useState(false);
  const [branchWindowSaving, setBranchWindowSaving] = useState(false);
  const [branchWindowTargetLocationId, setBranchWindowTargetLocationId] = useState<string | null>(null);
  const [branchWindowStartsAt, setBranchWindowStartsAt] = useState("");
  const [branchWindowEndsAt, setBranchWindowEndsAt] = useState("");
  const [branchWindowIndefinite, setBranchWindowIndefinite] = useState(false);
  const [branchWindowReason, setBranchWindowReason] = useState("");
  // Load data from tenant and location
  useEffect(() => {
    if (currentTenant) {
      const tenantName = currentTenant.name || "";
      const tenantCurrency = currentTenant.currency || "USD";
      setProfileData((prev) => ({
        ...prev,
        salonName: resolvedScope === "branch" ? prev.salonName : tenantName,
        country: currentTenant.country || "",
        currency: tenantCurrency,
      }));
      const nextBooking = {
        onlineBookingEnabled: currentTenant.online_booking_enabled || false,
        autoConfirmBookings: currentTenant.auto_confirm_bookings || false,
        depositsEnabled: currentTenant.deposits_enabled || false,
        defaultBufferMinutes: currentTenant.default_buffer_minutes || 0,
        cancellationGraceHours: currentTenant.cancellation_grace_hours || 24,
        defaultDepositPercentage: Number(currentTenant.default_deposit_percentage) || 0,
        bookingStatusMessage: currentTenant.booking_status_message || "",
        bookingPageBio: (currentTenant as { booking_page_bio?: string | null }).booking_page_bio || "",
        slotCapacityDefault: currentTenant.slot_capacity_default || 1,
        brandColor: (currentTenant as any).brand_color || "#2563EB",
        storefrontMode: ((currentTenant as any).storefront_mode || "both") as "services" | "products" | "both",
        allowStaffSelection: (currentTenant as any).allow_staff_selection ?? true,
        requireStaffSelection: (currentTenant as any).require_staff_selection ?? false,
        autoAssignStaff: (currentTenant as any).auto_assign_staff ?? true,
      };
      setBookingSettings(nextBooking);
      setCancellationGraceHoursInput(String(nextBooking.cancellationGraceHours));
      setDefaultDepositPercentageInput(String(nextBooking.defaultDepositPercentage));
      setSlotCapacityDefaultInput(String(nextBooking.slotCapacityDefault));
      setBookingBaseline(nextBooking);
      setLogoUrl(currentTenant.logo_url || null);
      setBannerUrls(currentTenant.banner_urls || []);
      setProfileBaseline((prev) => ({
        ...prev,
        salonName: resolvedScope === "branch" ? prev.salonName : tenantName,
        currency: tenantCurrency,
      }));
    }
    if (profile) {
      const ownerName = profile.full_name || "";
      const ownerPhone = profile.phone || "";
      setProfileData((prev) => ({
        ...prev,
        ownerName,
        email: user?.email || "",
        phone: ownerPhone,
      }));
      setProfileBaseline((prev) => ({ ...prev, ownerName, phone: ownerPhone }));
    }
    if (activeLocation) {
      const openingDays = activeLocation.opening_days || [];
      const openingTime = activeLocation.opening_time?.substring(0, 5) || "09:00";
      const closingTime = activeLocation.closing_time?.substring(0, 5) || "18:00";
      setProfileData((prev) => ({
        ...prev,
        salonName: resolvedScope === "branch" ? activeLocation.name || prev.salonName : prev.salonName,
        city: activeLocation.city || "",
        address: activeLocation.address || "",
      }));
      setHoursData({
        openingDays,
        openingTime,
        closingTime,
      });
      setHoursBaseline({ openingDays, openingTime, closingTime });
      setProfileBaseline((prev) => ({
        ...prev,
        salonName: resolvedScope === "branch" ? activeLocation.name || prev.salonName : prev.salonName,
        city: activeLocation.city || "",
        address: activeLocation.address || "",
      }));
    }
  }, [currentTenant, profile, user?.email, activeLocation, resolvedScope]);

  useEffect(() => {
    if (!currentTenant?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("list_tenant_staff_members", {
        p_tenant_id: currentTenant.id,
        p_context_type: "owner_hub",
        p_location_id: null,
      });
      if (cancelled || error || !Array.isArray(data)) return;

      const ownerRow =
        data.find((row: any) => row?.role === "owner" && row?.is_active !== false) ??
        data.find((row: any) => row?.role === "owner");
      if (!ownerRow) return;

      const ownerName = (ownerRow.full_name || "").trim();
      const ownerEmail = (ownerRow.email || "").trim();
      const ownerPhone = (ownerRow.phone || "").trim();
      setProfileData((prev) => ({
        ...prev,
        ownerName: ownerName || prev.ownerName,
        email: ownerEmail || prev.email,
        phone: ownerPhone || prev.phone,
      }));
      setProfileBaseline((prev) => ({
        ...prev,
        ownerName: ownerName || prev.ownerName,
        phone: ownerPhone || prev.phone,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTenant?.id]);

  const toLocalDateTimeInput = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    const hours = `${value.getHours()}`.padStart(2, "0");
    const minutes = `${value.getMinutes()}`.padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const formatWindowText = (window: BranchUnavailabilityWindow) => {
    const startsAt = new Date(window.starts_at);
    const startLabel = startsAt.toLocaleString();
    if (window.is_indefinite || !window.ends_at) {
      return `Unavailable from ${startLabel} until manually resumed`;
    }
    return `Unavailable from ${startLabel} to ${new Date(window.ends_at).toLocaleString()}`;
  };

  const fetchBranchWindows = async () => {
    if (!currentTenant?.id || resolvedScope !== "business") return;
    setBranchWindowsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("branch_unavailability_windows")
        .select("id, location_id, starts_at, ends_at, is_indefinite, reason, ended_at")
        .eq("tenant_id", currentTenant.id)
        .is("ended_at", null)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      setBranchWindows((data || []) as BranchUnavailabilityWindow[]);
    } catch (error) {
      console.error("Error loading branch windows:", error);
      toast({
        title: "Error",
        description: "Failed to load branch availability windows.",
        variant: "destructive",
      });
    } finally {
      setBranchWindowsLoading(false);
    }
  };

  useEffect(() => {
    if (resolvedScope !== "business") return;
    void fetchBranchWindows();
  }, [resolvedScope, currentTenant?.id]);

  // Sync notification settings from database
  useEffect(() => {
    if (dbNotificationSettings) {
      setNotificationSettings({
        emailAppointmentReminders: dbNotificationSettings.email_appointment_reminders,
        smsAppointmentReminders: dbNotificationSettings.sms_appointment_reminders,
        emailNewBookings: dbNotificationSettings.email_new_bookings,
        emailCancellations: dbNotificationSettings.email_cancellations,
        emailTransactionAlerts: dbNotificationSettings.email_transaction_alerts,
        inAppTransactionAlerts: dbNotificationSettings.in_app_transaction_alerts,
        emailDailyDigest: dbNotificationSettings.email_daily_digest,
      });
    }
  }, [dbNotificationSettings]);

  const handleNotificationsSave = async () => {
    await saveNotificationSettings({
      email_appointment_reminders: notificationSettings.emailAppointmentReminders,
      sms_appointment_reminders: notificationSettings.smsAppointmentReminders,
      email_new_bookings: notificationSettings.emailNewBookings,
      email_cancellations: notificationSettings.emailCancellations,
      email_transaction_alerts: notificationSettings.emailTransactionAlerts,
      in_app_transaction_alerts: notificationSettings.inAppTransactionAlerts,
      email_daily_digest: notificationSettings.emailDailyDigest,
    });
  };

  const bookingUrl = buildPublicBookingUrl(currentTenant?.slug, {
    configuredDomain: import.meta.env.VITE_PUBLIC_BOOKING_BASE_DOMAIN as string | undefined,
    hostname: typeof window !== "undefined" ? window.location.hostname : undefined,
  });
  const activeBookingTheme: BookingThemeKey = entitlements?.has_ecommerce_theme ? "ecommerce" : "default";

  const handleCopyUrl = () => {
    if (bookingUrl) {
      navigator.clipboard.writeText(bookingUrl);
      setCopiedUrl(true);
      toast({ title: "Copied!", description: "Booking URL copied to clipboard" });
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const getThemePreviewUrl = (themeKey: BookingThemeKey) => {
    if (!bookingUrl) return null;
    try {
      const url = new URL(bookingUrl);
      if (themeKey === "ecommerce") {
        url.searchParams.set("preview_theme", "ecommerce");
      } else {
        url.searchParams.delete("preview_theme");
      }
      return url.toString();
    } catch {
      return bookingUrl;
    }
  };

  const openThemePreview = (themeKey: BookingThemeKey) => {
    setThemePreviewKey(themeKey);
    setThemePreviewOpen(true);
  };

  const openThemePreviewInNewTab = (themeKey: BookingThemeKey) => {
    const previewUrl = getThemePreviewUrl(themeKey);
    if (!previewUrl) {
      toast({
        title: "Preview unavailable",
        description: "Generate your booking URL first to preview booking page themes.",
        variant: "destructive",
      });
      return;
    }
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  const handleLogoUpload = async (file: File) => {
    if (!currentTenant?.id) return;

    // Validate file type and size
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a JPG, PNG, or WebP image", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be under 2MB", variant: "destructive" });
      return;
    }

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${currentTenant.id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("salon-branding")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("salon-branding")
        .getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("tenants")
        .update({ logo_url: publicUrl })
        .eq("id", currentTenant.id);

      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      await refreshTenants();
      toast({ title: "Success", description: "Logo uploaded successfully" });
    } catch (err) {
      console.error("Error uploading logo:", err);
      toast({ title: "Error", description: "Failed to upload logo", variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!currentTenant?.id) return;
    if (bannerUrls.length >= 2) {
      toast({ title: "Error", description: "Maximum 2 banners allowed", variant: "destructive" });
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a JPG, PNG, or WebP image", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be under 5MB", variant: "destructive" });
      return;
    }

    setIsUploadingBanner(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${currentTenant.id}/banner-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("salon-branding")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("salon-branding")
        .getPublicUrl(filePath);

      const newBannerUrls = [...bannerUrls, urlData.publicUrl];

      const { error: updateError } = await supabase
        .from("tenants")
        .update({ banner_urls: newBannerUrls })
        .eq("id", currentTenant.id);

      if (updateError) throw updateError;

      setBannerUrls(newBannerUrls);
      await refreshTenants();
      toast({ title: "Success", description: "Banner uploaded successfully" });
    } catch (err) {
      console.error("Error uploading banner:", err);
      toast({ title: "Error", description: "Failed to upload banner", variant: "destructive" });
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleRemoveBanner = async (index: number) => {
    if (!currentTenant?.id) return;

    try {
      const newBannerUrls = bannerUrls.filter((_, i) => i !== index);

      const { error } = await supabase
        .from("tenants")
        .update({ banner_urls: newBannerUrls })
        .eq("id", currentTenant.id);

      if (error) throw error;

      setBannerUrls(newBannerUrls);
      await refreshTenants();
      toast({ title: "Success", description: "Banner removed" });
    } catch (err) {
      console.error("Error removing banner:", err);
      toast({ title: "Error", description: "Failed to remove banner", variant: "destructive" });
    }
  };

  const renderBookingThemePreview = (themeKey: BookingThemeKey, mode: "card" | "dialog" = "card") => {
    return (
      <BookingThemePreview
        themeKey={themeKey}
        mode={mode}
        salonName={profileData.salonName || currentTenant?.name || "Your Salon"}
        brandColor={bookingSettings.brandColor || "#2563EB"}
        bannerUrls={bannerUrls}
        bookingPageBio={bookingSettings.bookingPageBio || null}
        bookingStatusMessage={bookingSettings.bookingStatusMessage}
        contactPhone={profileData.contactPhone || currentTenant?.contact_phone || null}
        showContactOnBooking={profileData.showContactOnBooking}
        storefrontMode={bookingSettings.storefrontMode}
        locations={(locations || []).map((location) => ({
          id: location.id,
          name: location.name,
          city: location.city,
          address: location.address,
        }))}
      />
    );
  };

  const handleProfileSave = async () => {
    if (!currentTenant?.id) return;

    setIsSaving(true);
    try {
      if (resolvedScope !== "branch") {
        const { error: tenantError } = await supabase
          .from("tenants")
          .update({
            name: profileData.salonName,
          })
          .eq("id", currentTenant.id);
        if (tenantError) throw tenantError;
      }

      if (activeLocation?.id) {
        const locationUpdates =
          resolvedScope === "business"
            ? {
              city: profileData.city,
              address: profileData.address,
            }
            : {
              name: profileData.salonName,
              city: profileData.city,
              address: profileData.address,
            };
        const { error: locationError } = await supabase
          .from("locations")
          .update(locationUpdates)
          .eq("id", activeLocation.id);
        if (locationError) throw locationError;
      }

      if (profile?.user_id && resolvedScope !== "branch") {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: profileData.ownerName.trim() || null,
            phone: profileData.phone.trim() || null,
          })
          .eq("user_id", profile.user_id);
        if (profileError) throw profileError;
      }

      await Promise.all([refreshTenants(), refetchLocations()]);
      setProfileBaseline({
        salonName: profileData.salonName,
        city: profileData.city,
        address: profileData.address,
        currency: profileData.currency,
        ownerName: profileData.ownerName,
        phone: profileData.phone,
      });
      toast({ title: "Saved", description: "Profile settings updated" });
    } catch (err) {
      console.error("Error saving profile:", err);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleHoursSave = async () => {
    if (!activeLocation?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("locations")
        .update({
          opening_days: hoursData.openingDays,
          opening_time: hoursData.openingTime,
          closing_time: hoursData.closingTime,
        })
        .eq("id", activeLocation.id);

      if (error) throw error;

      toast({ title: "Saved", description: "Business hours updated" });
      setHoursBaseline({
        openingDays: [...hoursData.openingDays],
        openingTime: hoursData.openingTime,
        closingTime: hoursData.closingTime,
      });
      refetchLocations();
    } catch (err) {
      console.error("Error saving hours:", err);
      toast({ title: "Error", description: "Failed to save hours", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const notifyImpactedBookings = async (locationId: string, startsAtIso: string, endsAtIso: string | null, reason: string) => {
    if (!currentTenant?.id) return;
    const windowEndIso =
      endsAtIso || new Date(new Date(startsAtIso).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const targetLocation = locations.find((location) => location.id === locationId);
    const branchLabel = targetLocation?.name?.trim() || "This branch";
    const bookingUrl = currentTenant?.slug ? buildPublicBookingUrl(currentTenant.slug) : "";
    const contactPhone = (currentTenant as any)?.contact_phone || "";
    const contactLine = contactPhone ? ` You can also call ${contactPhone}.` : "";
    const bookingLine = bookingUrl ? ` Please rebook here: ${bookingUrl}.` : " Please rebook from the booking site.";
    const reasonText =
      reason?.trim() ||
      `${branchLabel} is temporarily unavailable during the selected period.${bookingLine}${contactLine}`;
    try {
      const { data: impactedAppointments, error } = await supabase
        .from("appointments")
        .select("id, scheduled_start")
        .eq("tenant_id", currentTenant.id)
        .eq("location_id", locationId)
        .gte("scheduled_start", startsAtIso)
        .lte("scheduled_start", windowEndIso)
        .in("status", ["scheduled", "rescheduled", "started", "paused"]);
      if (error) throw error;
      for (const appointment of impactedAppointments || []) {
        await supabase.from("notifications").insert({
          tenant_id: currentTenant.id,
          type: "appointment",
          title: "Branch availability changed",
          description:
            "This branch is unavailable for a period. Please reschedule impacted bookings.",
          entity_type: "appointment",
          entity_id: appointment.id,
          urgent: true,
        });
        await supabase.functions.invoke("send-appointment-notification", {
          body: {
            appointmentId: appointment.id,
            action: "branch_unavailable",
            reason: reasonText,
          },
        });
      }
    } catch (error) {
      console.error("Error notifying impacted bookings:", error);
    }
  };

  const handleOpenBranchWindowDialog = (locationId: string) => {
    const now = new Date();
    const plusTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setBranchWindowTargetLocationId(locationId);
    setBranchWindowStartsAt(toLocalDateTimeInput(now));
    setBranchWindowEndsAt(toLocalDateTimeInput(plusTwoHours));
    setBranchWindowIndefinite(false);
    setBranchWindowReason("");
    setBranchWindowDialogOpen(true);
  };

  const handleCreateBranchWindow = async () => {
    if (!currentTenant?.id || !branchWindowTargetLocationId || !branchWindowStartsAt) return;
    const startsAt = new Date(branchWindowStartsAt);
    if (Number.isNaN(startsAt.getTime())) {
      toast({ title: "Invalid start time", description: "Please choose a valid start date/time.", variant: "destructive" });
      return;
    }
    const endsAt = branchWindowIndefinite ? null : new Date(branchWindowEndsAt);
    if (!branchWindowIndefinite && (!branchWindowEndsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
      toast({
        title: "Invalid end time",
        description: "End date/time must be after the start.",
        variant: "destructive",
      });
      return;
    }

    setBranchWindowSaving(true);
    try {
      const payload = {
        tenant_id: currentTenant.id,
        location_id: branchWindowTargetLocationId,
        starts_at: startsAt.toISOString(),
        ends_at: branchWindowIndefinite ? null : endsAt.toISOString(),
        is_indefinite: branchWindowIndefinite,
        reason: branchWindowReason.trim() || null,
        created_by: user?.id || null,
      };
      const { error } = await (supabase as any).from("branch_unavailability_windows").insert(payload);
      if (error) throw error;

      await notifyImpactedBookings(
        branchWindowTargetLocationId,
        startsAt.toISOString(),
        branchWindowIndefinite ? null : endsAt.toISOString(),
        branchWindowReason.trim() || "Branch unavailable period",
      );
      await fetchBranchWindows();
      setBranchWindowDialogOpen(false);
      toast({ title: "Branch unavailable", description: "Unavailability window has been saved." });
    } catch (error) {
      console.error("Error creating branch window:", error);
      toast({ title: "Error", description: "Failed to save branch unavailability.", variant: "destructive" });
    } finally {
      setBranchWindowSaving(false);
    }
  };

  const handleEndBranchWindow = async (window: BranchUnavailabilityWindow) => {
    if (!currentTenant?.id) return;
    setBranchWindowSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("branch_unavailability_windows")
        .update({
          ended_at: new Date().toISOString(),
          ended_by: user?.id || null,
        })
        .eq("id", window.id)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      await fetchBranchWindows();
      toast({ title: "Branch resumed", description: "Branch is now available for bookings again." });
    } catch (error) {
      console.error("Error ending branch window:", error);
      toast({ title: "Error", description: "Failed to resume branch availability.", variant: "destructive" });
    } finally {
      setBranchWindowSaving(false);
    }
  };

  const handleBookingSave = async () => {
    if (!currentTenant?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          online_booking_enabled: bookingSettings.onlineBookingEnabled,
          auto_confirm_bookings: bookingSettings.autoConfirmBookings,
          deposits_enabled: bookingSettings.depositsEnabled,
          default_buffer_minutes: bookingSettings.defaultBufferMinutes,
          cancellation_grace_hours: bookingSettings.cancellationGraceHours,
          default_deposit_percentage: bookingSettings.defaultDepositPercentage,
          booking_status_message: bookingSettings.bookingStatusMessage || null,
          booking_page_bio: bookingSettings.bookingPageBio || null,
          slot_capacity_default: bookingSettings.slotCapacityDefault,
          brand_color: bookingSettings.brandColor,
          storefront_mode: bookingSettings.storefrontMode,
          allow_staff_selection: bookingSettings.allowStaffSelection,
          require_staff_selection: bookingSettings.requireStaffSelection,
          auto_assign_staff: bookingSettings.autoAssignStaff,
        })
        .eq("id", currentTenant.id);

      if (error) throw error;

      // Refresh tenant + location state so renamed salon/location labels propagate to switchers immediately.
      await Promise.all([refreshTenants(), refetchLocations()]);
      setBookingBaseline({ ...bookingSettings });

      toast({ title: "Saved", description: "Booking settings updated" });
    } catch (err) {
      console.error("Error saving booking settings:", err);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate a unique booking slug from salon name
  const handleGenerateSlug = async () => {
    if (!currentTenant?.id || !currentTenant.name) return;

    setIsGeneratingSlug(true);
    try {
      // Convert name to URL-friendly slug
      const baseSlug = currentTenant.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 40);

      // Check if slug exists
      let slug = baseSlug;
      let attempts = 0;
      while (attempts < 10) {
        const { data, error } = await supabase
          .from("tenants")
          .select("id")
          .eq("slug", slug)
          .neq("id", currentTenant.id)
          .maybeSingle();

        if (error) throw error;

        if (!data) break; // Slug is available

        // Add random suffix
        slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
        attempts++;
      }

      // Update tenant with new slug
      const { error: updateError } = await supabase
        .from("tenants")
        .update({ slug })
        .eq("id", currentTenant.id);

      if (updateError) throw updateError;

      // Sync the new slug with Dotlet if a custom domain is active
      if (currentTenant.custom_booking_domain && currentTenant.dotlet_origin_rule_id) {
        const { error: syncError } = await supabase.functions.invoke("dotlet-sync-slug", {
          body: { tenantId: currentTenant.id, newSlug: slug },
        });

        if (syncError) {
          console.error("Failed to sync new slug with custom domain:", syncError);
          // We don't throw here to avoid failing the slug generation, 
          // but we notify the user.
          toast({
            title: "Warning",
            description: "Slug updated, but failed to sync with custom domain. Please contact support.",
            variant: "destructive",
          });
        }
      }

      await refreshTenants();
      toast({ title: "Success", description: "Booking URL generated!" });
    } catch (err) {
      console.error("Error generating slug:", err);
      toast({ title: "Error", description: "Failed to generate booking URL", variant: "destructive" });
    } finally {
      setIsGeneratingSlug(false);
    }
  };

  const toggleDay = (day: string) => {
    setHoursData((prev) => ({
      ...prev,
      openingDays: prev.openingDays.includes(day)
        ? prev.openingDays.filter((d) => d !== day)
        : [...prev.openingDays, day],
    }));
  };

  const profileDirty = useMemo(() => {
    if (resolvedScope === "branch") {
      return (
        profileData.salonName !== profileBaseline.salonName ||
        profileData.city !== profileBaseline.city ||
        profileData.address !== profileBaseline.address
      );
    }
    return (
      profileData.salonName !== profileBaseline.salonName ||
      profileData.city !== profileBaseline.city ||
      profileData.address !== profileBaseline.address ||
      profileData.ownerName !== profileBaseline.ownerName ||
      profileData.phone !== profileBaseline.phone
    );
  }, [profileData, profileBaseline, resolvedScope]);

  const hoursDirty = useMemo(() => {
    const baselineDays = [...hoursBaseline.openingDays].sort().join(",");
    const currentDays = [...hoursData.openingDays].sort().join(",");
    return (
      currentDays !== baselineDays ||
      hoursData.openingTime !== hoursBaseline.openingTime ||
      hoursData.closingTime !== hoursBaseline.closingTime
    );
  }, [hoursData, hoursBaseline]);

  const bookingDirty = useMemo(() => {
    return JSON.stringify(bookingSettings) !== JSON.stringify(bookingBaseline);
  }, [bookingSettings, bookingBaseline]);

  const renderProfileTab = () => (
    <Card>
      <CardContent className="p-6 space-y-6">
        {resolvedScope !== "branch" && (
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Salon logo" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />
              <Button
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={isUploadingLogo}
              >
                {isUploadingLogo ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {logoUrl ? "Change Logo" : "Upload Logo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG or WebP up to 2MB
              </p>
            </div>
          </div>
        )}

        <div className={cn("grid grid-cols-1 gap-4", resolvedScope !== "branch" && "sm:grid-cols-2")}>
          <div className="space-y-2">
            <Label>{resolvedScope === "branch" ? "Branch Name" : "Salon Business Name"}</Label>
            <Input
              value={profileData.salonName}
              onChange={(e) => setProfileData((prev) => ({ ...prev, salonName: e.target.value }))}
            />
          </div>
          {resolvedScope !== "branch" && (
            <div className="space-y-2">
              <Label>Owner Name</Label>
              <Input
                value={profileData.ownerName}
                onChange={(e) => setProfileData((prev) => ({ ...prev, ownerName: e.target.value }))}
              />
            </div>
          )}
        </div>

        {resolvedScope !== "branch" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" value={profileData.email} disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={profileData.phone}
                  onChange={(e) => setProfileData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Address */}
        <div className="space-y-2">
          <Label>Address</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Enter street address"
              value={profileData.address}
              onChange={(e) => setProfileData((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
        </div>

        {/* City & Country */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>City</Label>
            <Input
              value={profileData.city}
              onChange={(e) => setProfileData((prev) => ({ ...prev, city: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input value={profileData.country} disabled />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Default currency</Label>
          <Input value={profileData.currency} disabled />
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleProfileSave} disabled={isSaving || !profileDirty}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderHoursTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Business Hours</CardTitle>
        <CardDescription>
          Set your salon's operating hours. These will be used for online booking availability.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {locationsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Opening Days */}
            <div className="space-y-3">
              <Label>Open Days</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {weekDays.map((day) => (
                  <button
                    key={day.key}
                    onClick={() => toggleDay(day.key)}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                      hoursData.openingDays.includes(day.key)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opening & Closing Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Opening Time</Label>
                <TimePicker
                  value={hoursData.openingTime}
                  onChange={(time) => setHoursData((prev) => ({ ...prev, openingTime: time }))}
                  step={30}
                />
              </div>
              <div className="space-y-2">
                <Label>Closing Time</Label>
                <TimePicker
                  value={hoursData.closingTime}
                  onChange={(time) => setHoursData((prev) => ({ ...prev, closingTime: time }))}
                  step={30}
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleHoursSave} disabled={isSaving || !hoursDirty}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save hours
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  const handleNotificationToggle = async (
    field: keyof typeof notificationSettings,
    checked: boolean
  ) => {
    setNotificationSettings((prev) => ({ ...prev, [field]: checked }));

    const fieldMap: Record<string, string> = {
      emailAppointmentReminders: "email_appointment_reminders",
      smsAppointmentReminders: "sms_appointment_reminders",
      emailNewBookings: "email_new_bookings",
      emailCancellations: "email_cancellations",
      emailTransactionAlerts: "email_transaction_alerts",
      inAppTransactionAlerts: "in_app_transaction_alerts",
      emailDailyDigest: "email_daily_digest",
    };

    const success = await saveNotificationSettings({
      [fieldMap[field]]: checked,
    });

    if (!success) {
      // Revert on failure
      setNotificationSettings((prev) => ({ ...prev, [field]: !checked }));
    }
  };

  const renderNotificationsTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Configure how you and your customers receive notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">Email appointment reminders</p>
            <p className="text-sm text-muted-foreground">
              Send customers email reminders before appointments
            </p>
          </div>
          <Switch
            checked={notificationSettings.emailAppointmentReminders}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("emailAppointmentReminders", checked)
            }
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">SMS appointment reminders</p>
            <p className="text-sm text-muted-foreground">
              Send customers SMS reminders (uses credits)
            </p>
          </div>
          <Switch
            checked={notificationSettings.smsAppointmentReminders}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("smsAppointmentReminders", checked)
            }
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">New booking notifications</p>
            <p className="text-sm text-muted-foreground">
              Get notified when a new booking is made
            </p>
          </div>
          <Switch
            checked={notificationSettings.emailNewBookings}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("emailNewBookings", checked)
            }
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">Cancellation alerts</p>
            <p className="text-sm text-muted-foreground">
              Get notified when an appointment is cancelled
            </p>
          </div>
          <Switch
            checked={notificationSettings.emailCancellations}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("emailCancellations", checked)
            }
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">Email transaction alerts</p>
            <p className="text-sm text-muted-foreground">
              Email owners and managers when a payment or wallet top-up completes
            </p>
          </div>
          <Switch
            checked={notificationSettings.emailTransactionAlerts}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("emailTransactionAlerts", checked)
            }
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">In-app transaction alerts</p>
            <p className="text-sm text-muted-foreground">
              Create dashboard notifications for payment and purse activity
            </p>
          </div>
          <Switch
            checked={notificationSettings.inAppTransactionAlerts}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("inAppTransactionAlerts", checked)
            }
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">Daily digest</p>
            <p className="text-sm text-muted-foreground">
              Receive a daily summary of upcoming appointments
            </p>
          </div>
          <Switch
            checked={notificationSettings.emailDailyDigest}
            disabled={notificationsSaving}
            onCheckedChange={(checked) =>
              handleNotificationToggle("emailDailyDigest", checked)
            }
          />
        </div>
      </CardContent>
    </Card>
  );

  const renderBranchesTab = () => {
    const activeWindowsByLocation = new Map<string, BranchUnavailabilityWindow[]>();
    for (const window of branchWindows) {
      const windows = activeWindowsByLocation.get(window.location_id) || [];
      windows.push(window);
      activeWindowsByLocation.set(window.location_id, windows);
    }

    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Manage Branches</CardTitle>
            <CardDescription>
              Pause bookings for a branch during breaks, closures, or downtime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {branchWindowsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {locations.map((location) => {
                  const locationWindows = activeWindowsByLocation.get(location.id) || [];
                  const isUnavailable = locationWindows.length > 0;
                  const latestWindow = locationWindows[0];
                  return (
                    <AccordionItem key={location.id} value={location.id}>
                      <AccordionTrigger>
                        <div className="flex w-full items-center justify-between pr-4">
                          <div className="text-left">
                            <p className="font-medium">{location.name}</p>
                            <p className="text-xs text-muted-foreground">{location.city || "No city"}</p>
                          </div>
                          <Badge variant={isUnavailable ? "destructive" : "secondary"}>
                            {isUnavailable ? "Unavailable" : "Active"}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 rounded-lg border p-3">
                          {latestWindow ? (
                            <div className="space-y-1">
                              <p className="text-sm font-medium">Current unavailability</p>
                              <p className="text-sm text-muted-foreground">{formatWindowText(latestWindow)}</p>
                              {latestWindow.reason ? (
                                <p className="text-xs text-muted-foreground">Reason: {latestWindow.reason}</p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              This branch is currently accepting bookings.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleOpenBranchWindowDialog(location.id)}
                              disabled={branchWindowSaving}
                            >
                              Set unavailable period
                            </Button>
                            {latestWindow ? (
                              <Button
                                variant="destructive"
                                onClick={() => handleEndBranchWindow(latestWindow)}
                                disabled={branchWindowSaving}
                              >
                                Resume bookings
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Dialog open={branchWindowDialogOpen} onOpenChange={setBranchWindowDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set branch unavailability</DialogTitle>
              <DialogDescription>
                Confirm the period when this branch should stop accepting new bookings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Start date & time</Label>
                <Input
                  type="datetime-local"
                  value={branchWindowStartsAt}
                  onChange={(event) => setBranchWindowStartsAt(event.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Indefinitely unavailable</p>
                  <p className="text-xs text-muted-foreground">
                    Keep this branch unavailable until you manually resume it.
                  </p>
                </div>
                <Switch
                  checked={branchWindowIndefinite}
                  onCheckedChange={setBranchWindowIndefinite}
                />
              </div>
              {!branchWindowIndefinite ? (
                <div className="space-y-2">
                  <Label>End date & time</Label>
                  <Input
                    type="datetime-local"
                    value={branchWindowEndsAt}
                    onChange={(event) => setBranchWindowEndsAt(event.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  rows={2}
                  value={branchWindowReason}
                  onChange={(event) => setBranchWindowReason(event.target.value)}
                  placeholder="e.g. Renovation, public holiday, staff retreat"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBranchWindowDialogOpen(false)} disabled={branchWindowSaving}>
                Cancel
              </Button>
              <Button onClick={handleCreateBranchWindow} disabled={branchWindowSaving}>
                {branchWindowSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm unavailability
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  };

  const renderBookingTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Booking Settings</CardTitle>
        <CardDescription>
          Manage booking behavior, payment rules, and the customer-facing styling of your booking page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={bookingSubTab} onValueChange={(value) => setBookingSubTab(value as BookingSettingsSubTab)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="booking_config">Booking Config</TabsTrigger>
            <TabsTrigger value="themes_and_style">Themes &amp; Style</TabsTrigger>
          </TabsList>
        </Tabs>

        {bookingSubTab === "booking_config" ? (
          <div className="space-y-6">
            {bookingUrl ? (
              <div className="space-y-2">
                <Label>Booking URL</Label>
                <div className="flex items-center gap-2">
                  <Input value={bookingUrl} readOnly className="flex-1 bg-muted" />
                  <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                    {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Share this link with customers to let them book online.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Booking URL</Label>
                <div className="rounded-lg border border-dashed bg-muted/50 p-4">
                  <p className="mb-3 text-sm text-muted-foreground">Generate a booking URL before publishing the booking page.</p>
                  <Button onClick={handleGenerateSlug} disabled={isGeneratingSlug} className="gap-2">
                    {isGeneratingSlug ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Generate Booking URL
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Enable Online Booking</p>
                  <p className="text-sm text-muted-foreground">Allow customers to book through the public booking page.</p>
                </div>
                <Switch
                  checked={bookingSettings.onlineBookingEnabled}
                  onCheckedChange={(checked) => setBookingSettings((prev) => ({ ...prev, onlineBookingEnabled: checked }))}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Auto-Confirm Bookings</p>
                  <p className="text-sm text-muted-foreground">When off, customers submit requests first and only pay after salon approval.</p>
                </div>
                <Switch
                  checked={bookingSettings.autoConfirmBookings}
                  onCheckedChange={(checked) => setBookingSettings((prev) => ({ ...prev, autoConfirmBookings: checked }))}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Accept Online Deposits</p>
                  <p className="text-sm text-muted-foreground">Tenant-level payment rule used across the whole public booking checkout.</p>
                </div>
                <Switch
                  checked={bookingSettings.depositsEnabled}
                  onCheckedChange={(checked) => setBookingSettings((prev) => ({ ...prev, depositsEnabled: checked }))}
                />
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Payment model</p>
                <p className="mt-1 text-muted-foreground">
                  Public booking now uses tenant-level payment rules only. Service-level payment settings no longer control checkout behavior, and pay-at-salon is no longer offered.
                </p>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Allow Staff Selection</p>
                  <p className="text-sm text-muted-foreground">Let customers choose a preferred staff member during booking.</p>
                </div>
                <Switch
                  checked={bookingSettings.allowStaffSelection}
                  onCheckedChange={(checked) =>
                    setBookingSettings((prev) => ({
                      ...prev,
                      allowStaffSelection: checked,
                      requireStaffSelection: checked ? prev.requireStaffSelection : false,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Require Staff Selection</p>
                  <p className="text-sm text-muted-foreground">Force customers to select a staff member before checkout.</p>
                </div>
                <Switch
                  checked={bookingSettings.requireStaffSelection}
                  disabled={!bookingSettings.allowStaffSelection}
                  onCheckedChange={(checked) =>
                    setBookingSettings((prev) => ({
                      ...prev,
                      requireStaffSelection: checked,
                      autoAssignStaff: checked ? false : prev.autoAssignStaff,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Auto-Assign Staff</p>
                  <p className="text-sm text-muted-foreground">Automatically assign an eligible staff member when the customer leaves staff unselected.</p>
                </div>
                <Switch
                  checked={bookingSettings.autoAssignStaff}
                  disabled={bookingSettings.requireStaffSelection}
                  onCheckedChange={(checked) => setBookingSettings((prev) => ({ ...prev, autoAssignStaff: checked }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Default Buffer Time</Label>
                <Select
                  value={bookingSettings.defaultBufferMinutes.toString()}
                  onValueChange={(v) => setBookingSettings((prev) => ({ ...prev, defaultBufferMinutes: parseInt(v, 10) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No buffer</SelectItem>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cancellation Grace Period</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={cancellationGraceHoursInput}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCancellationGraceHoursInput(nextValue);
                      if (nextValue === "") return;
                      const parsed = Number.parseInt(nextValue, 10);
                      if (!Number.isNaN(parsed) && parsed >= 0) {
                        setBookingSettings((prev) => ({ ...prev, cancellationGraceHours: parsed }));
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number.parseInt(cancellationGraceHoursInput, 10);
                      const normalized = !Number.isNaN(parsed) && parsed >= 0 ? parsed : bookingSettings.cancellationGraceHours;
                      setCancellationGraceHoursInput(String(normalized));
                      setBookingSettings((prev) => ({ ...prev, cancellationGraceHours: normalized }));
                    }}
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Default Deposit Percentage</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={defaultDepositPercentageInput}
                    disabled={!bookingSettings.depositsEnabled}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDefaultDepositPercentageInput(nextValue);
                      if (nextValue === "") return;
                      const parsed = Number.parseInt(nextValue, 10);
                      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                        setBookingSettings((prev) => ({ ...prev, defaultDepositPercentage: parsed }));
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number.parseInt(defaultDepositPercentageInput, 10);
                      const normalized = !Number.isNaN(parsed)
                        ? Math.min(100, Math.max(0, parsed))
                        : bookingSettings.defaultDepositPercentage;
                      setDefaultDepositPercentageInput(String(normalized));
                      setBookingSettings((prev) => ({ ...prev, defaultDepositPercentage: normalized }));
                    }}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bookings per Time Slot</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={slotCapacityDefaultInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setSlotCapacityDefaultInput(nextValue);
                    if (nextValue === "") return;
                    const parsed = Number.parseInt(nextValue, 10);
                    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 100) {
                      setBookingSettings((prev) => ({ ...prev, slotCapacityDefault: parsed }));
                    }
                  }}
                  onBlur={() => {
                    const parsed = Number.parseInt(slotCapacityDefaultInput, 10);
                    const normalized = !Number.isNaN(parsed)
                      ? Math.min(100, Math.max(1, parsed))
                      : bookingSettings.slotCapacityDefault;
                    setSlotCapacityDefaultInput(String(normalized));
                    setBookingSettings((prev) => ({ ...prev, slotCapacityDefault: normalized }));
                  }}
                  className="w-24"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Booking Status Message</Label>
              <Textarea
                placeholder="Optional message to display on your booking page..."
                value={bookingSettings.bookingStatusMessage}
                onChange={(e) => setBookingSettings((prev) => ({ ...prev, bookingStatusMessage: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_1.6fr]">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label>Booking Page Banners</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Add up to 2 images to personalize your booking page.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {bannerUrls.map((url, index) => (
                      <div key={index} className="relative group">
                        <div className="h-20 w-32 overflow-hidden rounded-lg border bg-muted">
                          <img src={url} alt={`Banner ${index + 1}`} className="h-full w-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveBanner(index)}
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {bannerUrls.length < 2 && (
                      <div>
                        <input
                          ref={bannerInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleBannerUpload(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => bannerInputRef.current?.click()}
                          disabled={isUploadingBanner}
                          className="flex h-20 w-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                        >
                          {isUploadingBanner ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ImageIcon className="h-5 w-5" /><span className="text-xs">Add banner</span></>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Storefront Bio</Label>
                  <Textarea
                    placeholder="A short description of your salon — shown on the booking page header…"
                    value={bookingSettings.bookingPageBio}
                    onChange={(e) => setBookingSettings((prev) => ({ ...prev, bookingPageBio: e.target.value }))}
                    rows={2}
                    maxLength={280}
                  />
                  <p className="text-xs text-muted-foreground">
                    {bookingSettings.bookingPageBio.length}/280 characters. Appears below your salon name on the public storefront.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Brand Highlight Color</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={bookingSettings.brandColor}
                      onChange={(e) => setBookingSettings((prev) => ({ ...prev, brandColor: e.target.value }))}
                      className="h-10 w-16 cursor-pointer p-1"
                    />
                    <Input
                      type="text"
                      value={bookingSettings.brandColor}
                      onChange={(e) => setBookingSettings((prev) => ({ ...prev, brandColor: e.target.value }))}
                      placeholder="#2563EB"
                      className="w-28 font-mono text-sm"
                    />
                    <div className="h-10 w-10 rounded-md border" style={{ backgroundColor: bookingSettings.brandColor }} />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for buttons and accents on your booking page.</p>
                </div>

                <div className="space-y-2">
                  <Label>Storefront Focus</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "both", label: "Both" },
                      { value: "services", label: "Services only" },
                      { value: "products", label: "Products only" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setBookingSettings((prev) => ({ ...prev, storefrontMode: opt.value }))}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          bookingSettings.storefrontMode === opt.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted/40"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Both keeps your full catalog. Services or Products only gives your booking page a more focused layout for that one type — packages are always included either way.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Label>Booking Page Themes</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Preview the real public booking page, then purchase and apply a paid theme when ready.</p>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    Current theme: {activeBookingTheme === "ecommerce" ? "E-commerce" : "Default"}
                  </Badge>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-3xl border bg-card p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium">Default</p>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">Clean appointment-first booking page with your salon branding.</p>
                      </div>
                      {activeBookingTheme === "default" && <Badge>Applied</Badge>}
                    </div>
                    {renderBookingThemePreview("default", "card")}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => openThemePreview("default")}><Eye className="mr-2 h-4 w-4" />Preview</Button>
                      <Button type="button" variant="ghost" onClick={() => openThemePreviewInNewTab("default")} disabled={!bookingUrl}><ExternalLink className="mr-2 h-4 w-4" />Open live preview</Button>
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-card p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <p className="font-medium">E-commerce</p>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">Shopify-inspired storefront styling adapted for bookable services, packages, vouchers, and products.</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {activeBookingTheme === "ecommerce" ? <Badge>Applied</Badge> : <Badge variant="secondary">Paid theme</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {ecommerceThemePricing ? `${formatCurrency(ecommerceThemePricing, currentTenant?.currency || "USD")} / year` : "Annual billing"}
                        </span>
                      </div>
                    </div>
                    {renderBookingThemePreview("ecommerce", "card")}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => openThemePreview("ecommerce")}><Eye className="mr-2 h-4 w-4" />Preview</Button>
                      <Button type="button" variant="ghost" onClick={() => openThemePreviewInNewTab("ecommerce")} disabled={!bookingUrl}><ExternalLink className="mr-2 h-4 w-4" />Open live preview</Button>
                      <Button type="button" onClick={purchaseThemeAddon} disabled={isPurchasingTheme || activeBookingTheme === "ecommerce"}>
                        {isPurchasingTheme ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        {activeBookingTheme === "ecommerce" ? "Applied to booking page" : "Purchase & apply"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Dialog open={themePreviewOpen} onOpenChange={setThemePreviewOpen}>
              <DialogContent className="z-[200] sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>
                    {themePreviewKey === "ecommerce" ? "E-commerce theme" : "Default theme"} — how it looks to your customers
                  </DialogTitle>
                  <DialogDescription>
                    This is a live simulation using your salon's name, brand color, banners, and content. Scroll down to see the full page including the service catalog.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {renderBookingThemePreview(themePreviewKey, "dialog")}
                  {themePreviewKey === "ecommerce" && activeBookingTheme !== "ecommerce" && (
                    <div className="flex justify-end">
                      <Button type="button" onClick={purchaseThemeAddon} disabled={isPurchasingTheme}>
                        {isPurchasingTheme ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Apply this theme to my booking page
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button onClick={handleBookingSave} disabled={isSaving || !bookingDirty}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderPaymentsTab = () => {
    const isPaystack = currentTenant?.country === "NG" || currentTenant?.country === "GH";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Payment processing is securely managed by Salon Magik.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="font-medium">Payments are processed securely</p>
                <p className="text-sm text-muted-foreground">
                  All online payments are processed through {isPaystack ? "Paystack" : "Stripe"} via Salon Magik.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Supported Payment Methods</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Card</Badge>
                {isPaystack && <Badge variant="secondary">Mobile Money</Badge>}
                <Badge variant="secondary">POS</Badge>
                <Badge variant="secondary">Transfer</Badge>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium">Booking payment configuration moved</p>
              <p className="mt-1 text-muted-foreground">
                Booking payment behavior now lives under Booking Settings → Booking Config and is enforced at the tenant level across the public booking flow.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button variant="outline" className="gap-2" asChild>
              <a href="/salon/payments">
                <CreditCard className="w-4 h-4" />
                View Transactions
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderRolesTab = () => {
    const roles = [
      { name: "Owner", permissions: ["Full access", "Manage staff", "Manage settings", "View reports", "Process refunds"] },
      { name: "Manager", permissions: ["Manage staff", "View reports", "Process refunds", "Manage appointments"] },
      { name: "Supervisor", permissions: ["Manage appointments", "View reports", "Manage customers"] },
      { name: "Receptionist", permissions: ["Manage appointments", "Manage customers", "Process payments"] },
      { name: "Staff", permissions: ["View own appointments", "Update appointment status"] },
    ];

    return (
      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
          <CardDescription>
            View the default permissions for each role. Custom roles are not yet supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {roles.map((role) => (
              <div key={role.name} className="p-4 rounded-lg bg-muted/50 border">
                <p className="font-medium mb-2">{role.name}</p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((perm) => (
                    <Badge key={perm} variant="secondary" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSubscriptionTab = () => {
    const trialEndsAt = currentTenant?.trial_ends_at ? new Date(currentTenant.trial_ends_at) : null;
    const daysRemaining = trialEndsAt ? Math.max(0, differenceInDays(trialEndsAt, new Date())) : 0;
    const isTrialing = currentTenant?.subscription_status === "trialing";

    const branchesValue = Number(branchesInput);
    const seatsValue = Number(seatsInput);
    const isPlanConfigUnchanged =
      planConfigQuote &&
      branchesValue === planConfigQuote.current_allowed_locations &&
      seatsValue === planConfigQuote.current_allowed_staff;
    const isPlanConfigIncrease = Boolean(planConfigQuote && (planConfigQuote.price_delta || 0) > 0);

    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            Your business is on the <span className="font-medium capitalize">{currentTenant?.plan || "Solo"}</span> plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold capitalize">{currentTenant?.plan || "Solo"} Plan</p>
              <Badge className={cn(
                currentTenant?.subscription_status === "active" ? "bg-success text-success-foreground" :
                  currentTenant?.subscription_status === "trialing" ? "bg-primary text-primary-foreground" :
                    "bg-destructive text-destructive-foreground"
              )}>
                {currentTenant?.subscription_status?.replace("_", " ") || "Unknown"}
              </Badge>
            </div>
            {isTrialing && trialEndsAt && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Trial period</span>
                  <span className="font-medium">{daysRemaining} days remaining</span>
                </div>
                <Progress value={Math.max(0, 100 - (daysRemaining / 14) * 100)} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Ends {format(trialEndsAt, "MMM d, yyyy")}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Locations</p>
              <p className="mt-1 text-2xl font-semibold">
                {entitlements?.used_locations ?? 0} / {entitlements?.allowed_locations ?? currentPlan?.limits?.max_locations ?? 1}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Seats</p>
              <p className="mt-1 text-2xl font-semibold">
                {entitlements?.used_staff ?? 0} / {entitlements?.allowed_staff ?? currentPlan?.limits?.max_staff ?? 1}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {Number(entitlements?.extra_staff_seats || 0) > 0
                  ? `${entitlements?.base_staff_limit ?? currentPlan?.limits?.max_staff ?? 1} included in your plan + ${entitlements?.extra_staff_seats} paid add-on`
                  : "All included in your plan"}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Storefront Theme</p>
              <p className="mt-1 text-lg font-semibold">
                {entitlements?.has_ecommerce_theme ? "E-commerce active" : "Default theme"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {entitlements?.ecommerce_theme_expires_at
                  ? `Renews until ${format(new Date(entitlements.ecommerce_theme_expires_at), "MMM d, yyyy")}`
                  : "No paid storefront theme active"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Manage branches & team size</p>
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Tell us how many branches and team seats you need. We'll automatically put you on the right plan for it.
              </p>
              <p className="text-xs text-muted-foreground">
                On the Chain plan, each branch you add here includes 12 team seats automatically — opening a new branch location elsewhere doesn't add seats on its own, only increasing the branch count here does.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="config-branches">Branches</Label>
                  <Input
                    id="config-branches"
                    type="number"
                    min={1}
                    value={branchesInput}
                    onChange={(event) => setBranchesInput(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="config-seats">Team seats</Label>
                  <Input
                    id="config-seats"
                    type="number"
                    min={0}
                    value={seatsInput}
                    onChange={(event) => setSeatsInput(event.target.value)}
                  />
                </div>
              </div>

              {isQuotingPlanConfig && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating...
                </p>
              )}

              {planConfigQuoteError && (
                <p className="text-sm text-destructive">{planConfigQuoteError}</p>
              )}

              {!isQuotingPlanConfig && planConfigQuote && !planConfigQuote.requires_custom_locations && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                  {isPlanConfigUnchanged ? (
                    <p>
                      You're currently on this configuration — <span className="font-medium capitalize">{planConfigQuote.required_plan_slug}</span> plan, {formatCurrency(planConfigQuote.total_monthly_price || 0, planConfigQuote.currency)} / month.
                    </p>
                  ) : (
                    <>
                      <p>
                        This puts you on the <span className="font-medium capitalize">{planConfigQuote.required_plan_slug}</span> plan.
                      </p>
                      <p>
                        New monthly total: <span className="font-medium">{formatCurrency(planConfigQuote.total_monthly_price || 0, planConfigQuote.currency)}</span>
                      </p>
                      <p className={isPlanConfigIncrease ? "text-amber-600" : "text-success"}>
                        {isPlanConfigIncrease
                          ? `+${formatCurrency(planConfigQuote.price_delta || 0, planConfigQuote.currency)} / month — payment required`
                          : `${formatCurrency(planConfigQuote.price_delta || 0, planConfigQuote.currency)} / month — applies immediately, no charge`}
                      </p>
                    </>
                  )}
                </div>
              )}

              {!isQuotingPlanConfig && planConfigQuote?.requires_custom_locations && (
                <p className="text-sm text-destructive">
                  That many branches needs a custom plan. Contact support to set this up.
                </p>
              )}

              <Button
                className="w-full sm:w-auto"
                onClick={applyPlanConfiguration}
                disabled={
                  !planConfigQuote ||
                  planConfigQuote.requires_custom_locations ||
                  isApplyingPlanConfig ||
                  isQuotingPlanConfig ||
                  Boolean(isPlanConfigUnchanged)
                }
              >
                {isApplyingPlanConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPlanConfigUnchanged ? "No changes" : isPlanConfigIncrease ? "Pay & Update" : "Update Billing"}
              </Button>
            </div>

            <div className="rounded-lg border p-4">
              <p className="font-medium">Booking page themes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Preview, purchase, and apply booking page themes from the Booking Settings tab where your banners and booking brand controls live.
              </p>
            </div>
          </div>
          {isTrialing && (
            <div className="pt-4 border-t">
              {subscriptionPromo ? (
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                  <p className="font-medium">Active subscription promo</p>
                  <p className="text-muted-foreground">
                    {subscriptionPromo.code} · {subscriptionPromo.campaign_name} · {subscriptionPromo.remaining_uses} use{subscriptionPromo.remaining_uses === 1 ? "" : "s"} remaining
                  </p>
                </div>
              ) : (
                <div className="mb-4 space-y-2">
                  <Label>Apply Sales Promo Code</Label>
                  <div className="flex gap-2">
                    <Input
                      value={subscriptionPromoCode}
                      onChange={(event) => setSubscriptionPromoCode(event.target.value.toUpperCase())}
                      placeholder="Enter promo code"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await claimTenantPromo.mutateAsync({ code: subscriptionPromoCode, surface: "subscription" });
                          setSubscriptionPromoCode("");
                          toast({ title: "Promo claimed", description: "The promo is now attached to this tenant for subscription billing." });
                        } catch (error) {
                          toast({
                            title: "Promo unavailable",
                            description: error instanceof Error ? error.message : "Failed to claim promo code.",
                            variant: "destructive",
                          });
                        }
                      }}
                      disabled={!subscriptionPromoCode.trim() || claimTenantPromo.isPending}
                    >
                      {claimTenantPromo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                </div>
              )}
              <Button className="w-full gap-2" onClick={startSubscriptionCheckout} disabled={isStartingSubscriptionCheckout}>
                {isStartingSubscriptionCheckout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isStartingSubscriptionCheckout ? "Redirecting..." : "Upgrade Now"}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Continue using all features after your trial ends
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const { data: referralCodes, isLoading: codesLoading } = useMyReferralCodes();
  const { data: referralDiscounts, isLoading: discountsLoading } = useMyReferralDiscounts();
  const generateCodeMutation = useGenerateReferralCode();

  const renderPromotionsTab = () => {
    const bookingUrl = buildPublicBookingUrl(currentTenant?.slug, {
      configuredDomain: import.meta.env.VITE_PUBLIC_BOOKING_BASE_DOMAIN as string | undefined,
      hostname: typeof window !== "undefined" ? window.location.hostname : undefined,
    });

    return (
      <div className="space-y-6">
        {activeTenantPromo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="w-5 h-5" />
                Active Sales Promo
              </CardTitle>
              <CardDescription>
                This promo stays available to your tenant until it is consumed, expires, or is invalidated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Code:</span> <span className="font-medium">{activeTenantPromo.code}</span></div>
              <div><span className="text-muted-foreground">Campaign:</span> <span className="font-medium">{activeTenantPromo.campaign_name}</span></div>
              <div><span className="text-muted-foreground">Targets:</span> <span className="font-medium">{activeTenantPromo.billing_targets.join(", ")}</span></div>
              <div><span className="text-muted-foreground">Remaining uses:</span> <span className="font-medium">{activeTenantPromo.remaining_uses}</span></div>
              <div><span className="text-muted-foreground">Campaign ends:</span> <span className="font-medium">{format(new Date(activeTenantPromo.campaign_ends_at), "MMM d, yyyy")}</span></div>
            </CardContent>
          </Card>
        )}

        {/* Referral Program */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Referral Program
            </CardTitle>
            <CardDescription>
              Share your referral link and earn discounts when other salons sign up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Referral Link */}
            {bookingUrl && (
              <div className="space-y-2">
                <Label>Your Referral Link</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={`${window.location.origin}/signup?ref=${currentTenant?.slug || ""}`}
                    readOnly
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/signup?ref=${currentTenant?.slug || ""}`
                      );
                      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  When someone signs up using this link, you both get a discount!
                </p>
              </div>
            )}

            {/* Referral Codes */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium">Your Referral Codes</p>
                  <p className="text-sm text-muted-foreground">
                    Generate codes to share with other salon owners
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateCodeMutation.mutate()}
                  disabled={generateCodeMutation.isPending}
                >
                  {generateCodeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Ticket className="w-4 h-4 mr-2" />
                      Generate Code
                    </>
                  )}
                </Button>
              </div>

              {codesLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : referralCodes && referralCodes.length > 0 ? (
                <div className="space-y-2">
                  {referralCodes.map((code) => (
                    <div
                      key={code.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                    >
                      <div className="flex items-center gap-3">
                        <code className="font-mono font-semibold">{code.code}</code>
                        <Badge variant={code.consumed ? "secondary" : "default"}>
                          {code.consumed ? "Used" : "Available"}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(code.code);
                          toast({ title: "Copied!", description: "Referral code copied" });
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No referral codes yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Available Discounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Your Discounts
            </CardTitle>
            <CardDescription>
              Active discounts earned from referrals and promotions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {discountsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : referralDiscounts && referralDiscounts.length > 0 ? (
              <div className="space-y-3">
                {referralDiscounts.map((discount) => (
                  <div
                    key={discount.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20"
                  >
                    <div>
                      <p className="font-semibold">{discount.percentage}% Off</p>
                      <p className="text-sm text-muted-foreground">
                        {discount.source === "referrer" ? "Referral reward" : "New user discount"}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">
                        Expires {format(new Date(discount.expires_at), "MMM d, yyyy")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Gift className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No active discounts</p>
                <p className="text-sm mt-1">
                  Refer other salons to earn discounts on your subscription
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderWalletTab = () => (
    <div className="space-y-6">
      <SalonWalletCard />
      {wallet && (
        <WalletLedger
          walletType="salon"
          walletId={wallet.id}
          currency={wallet.currency}
        />
      )}
    </div>
  );

  const renderPayoutDestinationsTab = () => (
    <PayoutDestinationsManager />
  );

  const renderWithdrawalsTab = () => (
    <WithdrawalHistory />
  );

  const renderPlaceholderTab = () => (
    <Card>
      <CardContent className="p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          {(() => {
            const tab = settingsTabs.find((t) => t.id === activeTab);
            if (tab) {
              const Icon = tab.icon;
              return <Icon className="w-8 h-8 text-muted-foreground" />;
            }
            return null;
          })()}
        </div>
        <h3 className="font-semibold text-lg">
          {settingsTabs.find((t) => t.id === activeTab)?.label}
        </h3>
        <p className="text-muted-foreground mt-2">
          This section is coming soon.
        </p>
      </CardContent>
    </Card>
  );

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold">
            {resolvedScope === "business"
              ? "Business Settings"
              : resolvedScope === "branch"
                ? "Branch Settings"
                : "Settings"}
          </h1>
          <p className="text-muted-foreground">
            {resolvedScope === "business"
              ? "Manage business-level configuration and owner details"
              : resolvedScope === "branch"
                ? "Manage this branch profile and operating hours"
                : "Manage your salon's configuration and preferences"}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Settings Navigation - Mobile Dropdown */}
          <div className="lg:hidden">
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  {(() => {
                    const tab = settingsTabs.find((t) => t.id === activeTab);
                    if (tab) {
                      const Icon = tab.icon;
                      return (
                        <>
                          <Icon className="w-4 h-4" />
                          {tab.label}
                        </>
                      );
                    }
                    return <SelectValue />;
                  })()}
                </div>
              </SelectTrigger>
              <SelectContent>
                {settingsTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <SelectItem key={tab.id} value={tab.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Settings Navigation - Desktop Sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <nav className="space-y-1">
              {settingsTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition-all",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Settings Content */}
          <div className="flex-1">
            {activeTab === "profile" && renderProfileTab()}
            {activeTab === "hours" && renderHoursTab()}
            {activeTab === "branches" && renderBranchesTab()}
            {activeTab === "booking" && renderBookingTab()}
            {activeTab === "payments" && renderPaymentsTab()}
            {activeTab === "wallet" && renderWalletTab()}
            {activeTab === "payout-destinations" && renderPayoutDestinationsTab()}
            {activeTab === "withdrawals" && renderWithdrawalsTab()}
            {activeTab === "promotions" && renderPromotionsTab()}
            {activeTab === "notifications" && renderNotificationsTab()}
            {activeTab === "roles" && renderRolesTab()}
            {activeTab === "subscription" && renderSubscriptionTab()}
            {activeTab === "custom-domain" && <CustomDomainManager />}
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}
