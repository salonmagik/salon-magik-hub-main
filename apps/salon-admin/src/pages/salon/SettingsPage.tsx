import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
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
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
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
	Minus,
	Plus,
} from "lucide-react";
import { cn } from "@shared/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLocations } from "@/hooks/useLocations";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import {
	useMyReferralCodes,
	useMyReferralDiscounts,
	useGenerateReferralCode,
} from "@/hooks/useReferrals";
import { supabase } from "@/lib/supabase";
import { buildPublicBookingUrl } from "@/lib/bookingUrl";
import { toast } from "@ui/ui/use-toast";
import { format } from "date-fns";
import { SalonWalletCard } from "@/components/billing/SalonWalletCard";
import { WalletLedger } from "@/components/billing/WalletLedger";
import { PayoutDestinationsManager } from "@/components/billing/PayoutDestinationsManager";
import { WithdrawalHistory } from "@/components/billing/WithdrawalHistory";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import {
	useClaimTenantSalesPromo,
	useTenantSalesPromo,
} from "@/hooks/useSalesPromo";
import { usePlans } from "@/hooks/usePlans";
import { CustomDomainManager } from "./CustomDomainManager";
import { useTenantEntitlements } from "@/hooks/useTenantEntitlements";
import { useTenantRecurringTotal } from "@/hooks/useTenantRecurringTotal";
import { useStaffOperationsAddon } from "@/hooks/useStaffOperationsAddon";
import { BookingThemePreview } from "@/components/settings/BookingThemePreview";
import { ActiveSessionsTab } from "@/components/session/ActiveSessionsTab";
import { formatCurrency } from "@shared/currency";
import { PaymentSuccessModal } from "@/components/PaymentSuccessModal";

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
	BRANCHES_BELOW_ACTIVE_LOCATIONS:
		"You can't go below the number of branches you currently have open. Close a branch first if you want to reduce this.",
	SEATS_BELOW_ACTIVE_STAFF:
		"You can't go below the number of team members currently on your team. Remove a team member first if you want to reduce this.",
	CHAIN_TIER_CUSTOM_REQUIRED:
		"That many branches needs a custom plan. Contact support to set this up.",
	PLAN_PRICE_NOT_FOUND:
		"Pricing isn't set up for your plan and currency yet. Contact support.",
	TENANT_ACCESS_DENIED:
		"You don't have access to manage billing for this business.",
	PLAN_CONFIGURATION_FORBIDDEN:
		"Only the business owner can change billing configuration.",
	PLAN_CONFIGURATION_INPUT_INVALID:
		"Enter a valid number of branches and seats.",
};

function describePlanConfigError(
	message: string | undefined,
	fallback = "Could not price this configuration.",
): string {
	if (!message) return fallback;
	return PLAN_CONFIG_ERROR_MESSAGES[message] || message;
}

interface SettingsPageProps {
	scope?: SettingsScope;
}

type BookingThemeKey = "default" | "ecommerce";
type BookingSettingsSubTab = "booking_config";

export default function SettingsPage({ scope = "auto" }: SettingsPageProps) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const [isSaving, setIsSaving] = useState(false);
	const [paymentSuccessModal, setPaymentSuccessModal] = useState<{
		title: string;
		description: string;
		detail?: string;
	} | null>(null);
	const {
		currentTenant,
		profile,
		user,
		activeContextType,
		activeLocationId,
		refreshTenants,
	} = useAuth();

	// /salon/settings is a legacy unscoped URL — always redirect to the correct scoped page.
	useEffect(() => {
		if (scope !== "auto") return;
		const dest = activeContextType === "owner_hub" ? "/salon/business-settings" : "/salon/branch-settings";
		navigate(dest + (searchParams.toString() ? `?${searchParams.toString()}` : ""), { replace: true });
	}, [scope, activeContextType, navigate, searchParams]);

	const {
		locations,
		defaultLocation,
		isLoading: locationsLoading,
		refetch: refetchLocations,
	} = useLocations();
	const {
		settings: dbNotificationSettings,
		isLoading: notificationsLoading,
		isSaving: notificationsSaving,
		saveSettings: saveNotificationSettings,
	} = useNotificationSettings();
	const [subscriptionPromoCode, setSubscriptionPromoCode] = useState("");
	const [isStartingSubscriptionCheckout, setIsStartingSubscriptionCheckout] =
		useState(false);
	const [isPurchasingTheme, setIsPurchasingTheme] = useState(false);
	const [branchesInput, setBranchesInput] = useState("1");
	const [seatsInput, setSeatsInput] = useState("1");
	const planConfigSectionRef = useRef<HTMLDivElement>(null);
	const [planConfigQuote, setPlanConfigQuote] = useState<{
		current_plan_slug: string;
		current_allowed_locations: number;
		current_allowed_staff: number;
		current_monthly_price: number;
		required_plan_slug: string;
		total_monthly_price: number | null;
		price_delta: number | null;
		discount_amount: number | null;
		requires_custom_locations: boolean;
		currency: string;
	} | null>(null);
	const [isQuotingPlanConfig, setIsQuotingPlanConfig] = useState(false);
	const [planConfigQuoteError, setPlanConfigQuoteError] = useState<
		string | null
	>(null);
	const [isApplyingPlanConfig, setIsApplyingPlanConfig] = useState(false);
	const [upgradeConfirmOpen, setUpgradeConfirmOpen] = useState(false);
	const claimTenantPromo = useClaimTenantSalesPromo();
	const { data: subscriptionPromo } = useTenantSalesPromo("subscription");
	const { data: activeTenantPromo } = useTenantSalesPromo();
	const { data: plans } = usePlans();
	const { data: entitlements, refetch: refetchEntitlements } =
		useTenantEntitlements(currentTenant?.id);
	const currentPlan = plans?.find((plan) => plan.slug === currentTenant?.plan);
	const { data: recurringTotal } = useTenantRecurringTotal();
	const staffOperationsAddon = useStaffOperationsAddon();

	const { data: ecommerceThemePricing } = useQuery({
		queryKey: [
			"theme-addon-pricing",
			currentTenant?.country,
			currentTenant?.currency,
		],
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
				{ id: "payout-destinations", label: "Payout Destinations", icon: Banknote },
				{ id: "notifications", label: "Notifications", icon: Bell },
				{ id: "subscription", label: "Subscription", icon: Zap },
				{ id: "custom-domain", label: "Custom Domain", icon: Globe },
				{ id: "sessions", label: "Active Sessions", icon: Shield },
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
	const lastSeededRef = useRef<{ branches: string; seats: string } | null>(
		null,
	);
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
		if (
			!Number.isFinite(branches) ||
			!Number.isFinite(seats) ||
			branches < 1 ||
			seats < 0
		) {
			setPlanConfigQuote(null);
			setPlanConfigQuoteError(null);
			return;
		}

		setIsQuotingPlanConfig(true);
		setPlanConfigQuoteError(null);
		const requestId = ++quoteRequestIdRef.current;
		const timer = setTimeout(async () => {
			try {
				const { data, error } = await (supabase.rpc as any)(
					"compute_plan_configuration",
					{
						p_tenant_id: currentTenant.id,
						p_branches: branches,
						p_seats: seats,
					},
				);
				if (error) throw error;
				if (quoteRequestIdRef.current !== requestId) return;
				setPlanConfigQuote(data?.[0] || null);
				setPlanConfigQuoteError(null);
			} catch (error) {
				if (quoteRequestIdRef.current !== requestId) return;
				setPlanConfigQuote(null);
				setPlanConfigQuoteError(
					describePlanConfigError(
						error instanceof Error ? error.message : undefined,
					),
				);
			} finally {
				if (quoteRequestIdRef.current === requestId)
					setIsQuotingPlanConfig(false);
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
				const { data, error } = await supabase.functions.invoke(
					"create-plan-configuration-checkout-session",
					{
						body: {
							tenantId: currentTenant.id,
							branches,
							seats,
							successUrl: `${window.location.origin}/salon/settings?tab=subscription&planconfig=success`,
							cancelUrl: `${window.location.origin}/salon/settings?tab=subscription&planconfig=cancelled`,
						},
					},
				);
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
				const { error } = await (supabase.rpc as any)(
					"apply_plan_configuration",
					{
						p_tenant_id: currentTenant.id,
						p_branches: branches,
						p_seats: seats,
						p_source: "settings_subscription",
						p_reason:
							"Tenant updated branches/seats from subscription settings.",
					},
				);
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
				description: describePlanConfigError(
					error instanceof Error ? error.message : undefined,
					"Unable to update your plan configuration right now.",
				),
				variant: "destructive",
			});
		} finally {
			setIsApplyingPlanConfig(false);
		}
	};

	// Sync tab with URL params
	useEffect(() => {
		const tabFromUrl = searchParams.get("tab");
		if (
			tabFromUrl &&
			settingsTabs.some((t) => t.id === tabFromUrl) &&
			tabFromUrl !== activeTab
		) {
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
		// scope="auto" is the legacy /salon/settings redirector — it's about to
		// unmount as soon as the scope-redirect effect above fires. Running the
		// payment-verification calls here races that navigate(): this effect's
		// own setSearchParams and the redirect's navigate() both fire in the same
		// commit, and whichever the async verify call's .then() resolves against
		// is often the already-unmounted instance, so refreshTenants() and
		// setPaymentSuccessModal() silently no-op — the modal never appears and
		// the subscription tab shows stale data until a manual reload. Skip here
		// and let the effect re-run on the stable business/branch-settings
		// instance once the redirect lands, where state updates actually stick.
		if (scope === "auto") return;

		const topupStatus = searchParams.get("topup");
		const subscriptionStatus = searchParams.get("subscription");

		if (topupStatus === "success") {
			setPaymentSuccessModal({
				title: "Wallet topped up!",
				description: "Funds will appear in your balance shortly.",
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
			const reference =
				searchParams.get("reference") || searchParams.get("trxref");

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
							toast({
								title: "Could not confirm payment",
								description: "Contact support if your plan doesn't activate shortly.",
								variant: "destructive",
							});
							return;
						}
						await refreshTenants();
						setPaymentSuccessModal({
							title: "Subscription activated!",
							description: "Your plan is now active.",
						});
					});
			} else {
				refreshTenants().then(() => {
					setPaymentSuccessModal({
						title: "Payment received!",
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

			const reference =
				searchParams.get("reference") || searchParams.get("trxref");

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
								description:
									"Contact support if the change doesn't apply shortly.",
								variant: "destructive",
							});
							return;
						}
						await Promise.all([refreshTenants(), refetchEntitlements()]);
						setPaymentSuccessModal({
							title: "Billing updated!",
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

			const reference =
				searchParams.get("reference") || searchParams.get("trxref");

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
								description:
									"Contact support if the theme doesn't activate shortly.",
								variant: "destructive",
							});
							return;
						}
						await refetchEntitlements();
						setPaymentSuccessModal({
							title: "Theme activated!",
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
	}, [searchParams, setSearchParams, currentTenant?.id, scope]);

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
		contactPhone: "",
		showContactOnBooking: false,
	});

	const [hoursData, setHoursData] = useState({
		openingDays: [
			"monday",
			"tuesday",
			"wednesday",
			"thursday",
			"friday",
			"saturday",
		],
		openingTime: "09:00",
		closingTime: "18:00",
	});

	const [notificationSettings, setNotificationSettings] = useState({
		emailAppointmentReminders: true,
		smsAppointmentReminders: false,
		reminderHoursBefore: 24,
		emailNewBookings: true,
		emailCancellations: true,
		emailTransactionAlerts: true,
		inAppTransactionAlerts: true,
		emailDailyDigest: false,
		emailBirthdayMessages: true,
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
		heroHeading: "",
		heroTagline: "",
		heroCTAPrimary: "Book Now",
		heroCTASecondary: "Our Services",
		aboutText: "",
	});
	const [cancellationGraceHoursInput, setCancellationGraceHoursInput] =
		useState("24");
	const [defaultDepositPercentageInput, setDefaultDepositPercentageInput] =
		useState("0");
	const [slotCapacityDefaultInput, setSlotCapacityDefaultInput] = useState("1");
	const [bookingSubTab, setBookingSubTab] =
		useState<BookingSettingsSubTab>("booking_config");

	type ToggleKey =
		| "onlineBookingEnabled"
		| "autoConfirmBookings"
		| "depositsEnabled"
		| "allowStaffSelection"
		| "requireStaffSelection"
		| "autoAssignStaff";
	const [pendingToggle, setPendingToggle] = useState<{
		key: ToggleKey;
		value: boolean;
		label: string;
		stateUpdate: Partial<typeof bookingSettings>;
		dbUpdate: Record<string, unknown>;
	} | null>(null);
	const [isToggleSaving, setIsToggleSaving] = useState(false);

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
			const { data, error } = await supabase.functions.invoke(
				"create-checkout-session",
				{
					body: {
						tenantId: currentTenant.id,
						successUrl: `${window.location.origin}/salon/settings?tab=subscription&subscription=success`,
						cancelUrl: `${window.location.origin}/salon/settings?tab=subscription&subscription=cancelled`,
					},
				},
			);

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
				description:
					error instanceof Error
						? error.message
						: "Unable to start subscription checkout right now.",
				variant: "destructive",
			});
		} finally {
			setIsStartingSubscriptionCheckout(false);
		}
	};

	const purchaseThemeAddon = async () => {
		if (!currentTenant?.id) return;
		if (currentTenant.subscription_status !== "active") {
			toast({
				title: "Upgrade required",
				description:
					"Finish upgrading from your trial before purchasing a paid storefront theme.",
				variant: "destructive",
			});
			return;
		}

		setIsPurchasingTheme(true);
		try {
			const { data, error } = await supabase.functions.invoke(
				"create-theme-purchase-checkout-session",
				{
					body: {
						tenantId: currentTenant.id,
						themeKey: "ecommerce",
						successUrl: `${window.location.origin}/salon/settings?tab=subscription&themepurchase=success`,
						cancelUrl: `${window.location.origin}/salon/settings?tab=subscription&themepurchase=cancelled`,
					},
				},
			);
			if (error) throw error;

			if (data?.url) {
				window.location.href = data.url;
				return;
			}

			// Charged immediately via stored card — no redirect needed.
			await refetchEntitlements();
			toast({
				title: "Theme activated",
				description:
					"The e-commerce storefront theme is now active for your public booking page.",
			});
		} catch (error) {
			toast({
				title: "Theme activation failed",
				description:
					error instanceof Error
						? error.message
						: "Unable to activate the theme right now.",
				variant: "destructive",
			});
		} finally {
			setIsPurchasingTheme(false);
		}
	};

	const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);
	const activeLocation =
		locations.find((location) => location.id === activeLocationId) ??
		defaultLocation ??
		null;

	const [copiedUrl, setCopiedUrl] = useState(false);
	const [logoUrl, setLogoUrl] = useState<string | null>(null);
	const [bannerUrls, setBannerUrls] = useState<string[]>([]);
	const [isUploadingLogo, setIsUploadingLogo] = useState(false);
	const [isUploadingBanner, setIsUploadingBanner] = useState(false);
	const logoInputRef = useRef<HTMLInputElement>(null);
	const bannerInputRef = useRef<HTMLInputElement>(null);
	const [themePreviewOpen, setThemePreviewOpen] = useState(false);
	const [themePreviewKey, setThemePreviewKey] =
		useState<BookingThemeKey>("default");
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
		heroHeading: "",
		heroTagline: "",
		heroCTAPrimary: "Book Now",
		heroCTASecondary: "Our Services",
		aboutText: "",
	});
	const [branchWindows, setBranchWindows] = useState<
		BranchUnavailabilityWindow[]
	>([]);
	const [branchWindowsLoading, setBranchWindowsLoading] = useState(false);
	const [branchWindowDialogOpen, setBranchWindowDialogOpen] = useState(false);
	const [branchWindowSaving, setBranchWindowSaving] = useState(false);
	const [branchWindowTargetLocationId, setBranchWindowTargetLocationId] =
		useState<string | null>(null);
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
				defaultDepositPercentage:
					Number(currentTenant.default_deposit_percentage) || 0,
				bookingStatusMessage: currentTenant.booking_status_message || "",
				bookingPageBio:
					(currentTenant as { booking_page_bio?: string | null })
						.booking_page_bio || "",
				slotCapacityDefault: currentTenant.slot_capacity_default || 1,
				brandColor: (currentTenant as any).brand_color || "#2563EB",
				storefrontMode: ((currentTenant as any).storefront_mode || "both") as
					| "services"
					| "products"
					| "both",
				allowStaffSelection:
					(currentTenant as any).allow_staff_selection ?? true,
				requireStaffSelection:
					(currentTenant as any).require_staff_selection ?? false,
				autoAssignStaff: (currentTenant as any).auto_assign_staff ?? true,
				heroHeading: (currentTenant as any).hero_heading || "",
				heroTagline: (currentTenant as any).hero_tagline || "",
				heroCTAPrimary: (currentTenant as any).hero_cta_primary || "Book Now",
				heroCTASecondary: (currentTenant as any).hero_cta_secondary || "Our Services",
				aboutText: (currentTenant as any).about_text || "",
			};
			setBookingSettings(nextBooking);
			setCancellationGraceHoursInput(
				String(nextBooking.cancellationGraceHours),
			);
			setDefaultDepositPercentageInput(
				String(nextBooking.defaultDepositPercentage),
			);
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
			const openingTime =
				activeLocation.opening_time?.substring(0, 5) || "09:00";
			const closingTime =
				activeLocation.closing_time?.substring(0, 5) || "18:00";
			setProfileData((prev) => ({
				...prev,
				salonName:
					resolvedScope === "branch"
						? activeLocation.name || prev.salonName
						: prev.salonName,
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
				salonName:
					resolvedScope === "branch"
						? activeLocation.name || prev.salonName
						: prev.salonName,
				city: activeLocation.city || "",
				address: activeLocation.address || "",
			}));
		}
	}, [currentTenant, profile, user?.email, activeLocation, resolvedScope]);

	useEffect(() => {
		if (!currentTenant?.id) return;
		let cancelled = false;
		(async () => {
			const { data, error } = await (supabase.rpc as any)(
				"list_tenant_staff_members",
				{
					p_tenant_id: currentTenant.id,
					p_context_type: "owner_hub",
					p_location_id: null,
				},
			);
			if (cancelled || error || !Array.isArray(data)) return;

			const ownerRow =
				data.find(
					(row: any) => row?.role === "owner" && row?.is_active !== false,
				) ?? data.find((row: any) => row?.role === "owner");
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
				.select(
					"id, location_id, starts_at, ends_at, is_indefinite, reason, ended_at",
				)
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
				emailAppointmentReminders:
					dbNotificationSettings.email_appointment_reminders,
				smsAppointmentReminders:
					dbNotificationSettings.sms_appointment_reminders,
				reminderHoursBefore: dbNotificationSettings.reminder_hours_before ?? 24,
				emailNewBookings: dbNotificationSettings.email_new_bookings,
				emailCancellations: dbNotificationSettings.email_cancellations,
				emailTransactionAlerts: dbNotificationSettings.email_transaction_alerts,
				inAppTransactionAlerts:
					dbNotificationSettings.in_app_transaction_alerts,
				emailDailyDigest: dbNotificationSettings.email_daily_digest,
				emailBirthdayMessages: dbNotificationSettings.email_birthday_messages ?? true,
			});
		}
	}, [dbNotificationSettings]);

	const handleNotificationsSave = async () => {
		await saveNotificationSettings({
			email_appointment_reminders:
				notificationSettings.emailAppointmentReminders,
			sms_appointment_reminders: notificationSettings.smsAppointmentReminders,
			reminder_hours_before: notificationSettings.reminderHoursBefore,
			email_new_bookings: notificationSettings.emailNewBookings,
			email_cancellations: notificationSettings.emailCancellations,
			email_transaction_alerts: notificationSettings.emailTransactionAlerts,
			in_app_transaction_alerts: notificationSettings.inAppTransactionAlerts,
			email_daily_digest: notificationSettings.emailDailyDigest,
		email_birthday_messages: notificationSettings.emailBirthdayMessages,
		});
	};

	const bookingUrl = buildPublicBookingUrl(currentTenant?.slug, {
		configuredDomain: import.meta.env.VITE_PUBLIC_BOOKING_BASE_DOMAIN as
			| string
			| undefined,
		hostname:
			typeof window !== "undefined" ? window.location.hostname : undefined,
	});
	const activeBookingTheme: BookingThemeKey = currentTenant?.active_theme_key === "ecommerce"
		? "ecommerce"
		: "default";
	// Paid themes are an ongoing annual charge — a trialing tenant hasn't
	// committed to paying for anything yet, so don't let them start a second
	// bill before the base plan itself is active.
	const canPurchasePaidTheme = currentTenant?.subscription_status === "active";

	const handleCopyUrl = () => {
		if (bookingUrl) {
			navigator.clipboard.writeText(bookingUrl);
			setCopiedUrl(true);
			toast({
				title: "Copied!",
				description: "Booking URL copied to clipboard",
			});
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
				description:
					"Generate your booking URL first to preview booking page themes.",
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
			toast({
				title: "Error",
				description: "Please upload a JPG, PNG, or WebP image",
				variant: "destructive",
			});
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			toast({
				title: "Error",
				description: "File size must be under 2MB",
				variant: "destructive",
			});
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
			toast({
				title: "Error",
				description: "Failed to upload logo",
				variant: "destructive",
			});
		} finally {
			setIsUploadingLogo(false);
		}
	};

	const handleBannerUpload = async (file: File) => {
		if (!currentTenant?.id) return;
		if (bannerUrls.length >= 2) {
			toast({
				title: "Error",
				description: "Maximum 2 banners allowed",
				variant: "destructive",
			});
			return;
		}

		const validTypes = ["image/jpeg", "image/png", "image/webp"];
		if (!validTypes.includes(file.type)) {
			toast({
				title: "Error",
				description: "Please upload a JPG, PNG, or WebP image",
				variant: "destructive",
			});
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast({
				title: "Error",
				description: "File size must be under 5MB",
				variant: "destructive",
			});
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
			toast({
				title: "Error",
				description: "Failed to upload banner",
				variant: "destructive",
			});
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
			toast({
				title: "Error",
				description: "Failed to remove banner",
				variant: "destructive",
			});
		}
	};

	const renderBookingThemePreview = (
		themeKey: BookingThemeKey,
		mode: "card" | "dialog" = "card",
	) => {
		return (
			<BookingThemePreview
				themeKey={themeKey}
				mode={mode}
				salonName={profileData.salonName || currentTenant?.name || "Your Salon"}
				brandColor={bookingSettings.brandColor || "#2563EB"}
				bannerUrls={bannerUrls}
				bookingPageBio={bookingSettings.bookingPageBio || null}
				bookingStatusMessage={bookingSettings.bookingStatusMessage}
				contactPhone={
					profileData.contactPhone || currentTenant?.contact_phone || null
				}
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
			toast({
				title: "Error",
				description: "Failed to save settings",
				variant: "destructive",
			});
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
			toast({
				title: "Error",
				description: "Failed to save hours",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const notifyImpactedBookings = async (
		locationId: string,
		startsAtIso: string,
		endsAtIso: string | null,
		reason: string,
	) => {
		if (!currentTenant?.id) return;
		const windowEndIso =
			endsAtIso ||
			new Date(
				new Date(startsAtIso).getTime() + 30 * 24 * 60 * 60 * 1000,
			).toISOString();
		const targetLocation = locations.find(
			(location) => location.id === locationId,
		);
		const branchLabel = targetLocation?.name?.trim() || "This branch";
		const bookingUrl = currentTenant?.slug
			? buildPublicBookingUrl(currentTenant.slug)
			: "";
		const contactPhone = (currentTenant as any)?.contact_phone || "";
		const contactLine = contactPhone
			? ` You can also call ${contactPhone}.`
			: "";
		const bookingLine = bookingUrl
			? ` Please rebook here: ${bookingUrl}.`
			: " Please rebook from the booking site.";
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
		if (
			!currentTenant?.id ||
			!branchWindowTargetLocationId ||
			!branchWindowStartsAt
		)
			return;
		const startsAt = new Date(branchWindowStartsAt);
		if (Number.isNaN(startsAt.getTime())) {
			toast({
				title: "Invalid start time",
				description: "Please choose a valid start date/time.",
				variant: "destructive",
			});
			return;
		}
		const endsAt = branchWindowIndefinite ? null : new Date(branchWindowEndsAt);
		if (
			!branchWindowIndefinite &&
			(!branchWindowEndsAt ||
				Number.isNaN(endsAt.getTime()) ||
				endsAt <= startsAt)
		) {
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
			const { error } = await (supabase as any)
				.from("branch_unavailability_windows")
				.insert(payload);
			if (error) throw error;

			await notifyImpactedBookings(
				branchWindowTargetLocationId,
				startsAt.toISOString(),
				branchWindowIndefinite ? null : endsAt.toISOString(),
				branchWindowReason.trim() || "Branch unavailable period",
			);
			await fetchBranchWindows();
			setBranchWindowDialogOpen(false);
			toast({
				title: "Branch unavailable",
				description: "Unavailability window has been saved.",
			});
		} catch (error) {
			console.error("Error creating branch window:", error);
			toast({
				title: "Error",
				description: "Failed to save branch unavailability.",
				variant: "destructive",
			});
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
			toast({
				title: "Branch resumed",
				description: "Branch is now available for bookings again.",
			});
		} catch (error) {
			console.error("Error ending branch window:", error);
			toast({
				title: "Error",
				description: "Failed to resume branch availability.",
				variant: "destructive",
			});
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
					hero_heading: bookingSettings.heroHeading || null,
					hero_tagline: bookingSettings.heroTagline || null,
					hero_cta_primary: bookingSettings.heroCTAPrimary || "Book Now",
					hero_cta_secondary: bookingSettings.heroCTASecondary || "Our Services",
					about_text: bookingSettings.aboutText || null,
				})
				.eq("id", currentTenant.id);

			if (error) throw error;

			// Refresh tenant + location state so renamed salon/location labels propagate to switchers immediately.
			await Promise.all([refreshTenants(), refetchLocations()]);
			setBookingBaseline({ ...bookingSettings });

			toast({ title: "Saved", description: "Booking settings updated" });
		} catch (err) {
			console.error("Error saving booking settings:", err);
			toast({
				title: "Error",
				description: "Failed to save settings",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const confirmPendingToggle = async () => {
		if (!pendingToggle || !currentTenant?.id) return;
		setIsToggleSaving(true);
		try {
			const { error } = await supabase
				.from("tenants")
				.update(pendingToggle.dbUpdate)
				.eq("id", currentTenant.id);
			if (error) throw error;
			setBookingSettings((prev) => ({ ...prev, ...pendingToggle.stateUpdate }));
			setBookingBaseline((prev) => ({ ...prev, ...pendingToggle.stateUpdate }));
			toast({
				title: "Saved",
				description: `${pendingToggle.label} ${pendingToggle.value ? "enabled" : "disabled"}.`,
			});
			setPendingToggle(null);
		} catch (err) {
			console.error("Error saving toggle:", err);
			toast({
				title: "Error",
				description: "Failed to save setting",
				variant: "destructive",
			});
		} finally {
			setIsToggleSaving(false);
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
			if (
				currentTenant.custom_booking_domain &&
				currentTenant.dotlet_origin_rule_id
			) {
				const { error: syncError } = await supabase.functions.invoke(
					"dotlet-sync-slug",
					{
						body: { tenantId: currentTenant.id, newSlug: slug },
					},
				);

				if (syncError) {
					console.error(
						"Failed to sync new slug with custom domain:",
						syncError,
					);
					// We don't throw here to avoid failing the slug generation,
					// but we notify the user.
					toast({
						title: "Warning",
						description:
							"Slug updated, but failed to sync with custom domain. Please contact support.",
						variant: "destructive",
					});
				}
			}

			await refreshTenants();
			toast({ title: "Success", description: "Booking URL generated!" });
		} catch (err) {
			console.error("Error generating slug:", err);
			toast({
				title: "Error",
				description: "Failed to generate booking URL",
				variant: "destructive",
			});
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
								<img
									src={logoUrl}
									alt="Salon logo"
									className="w-full h-full object-cover"
								/>
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

				<div
					className={cn(
						"grid grid-cols-1 gap-4",
						resolvedScope !== "branch" && "sm:grid-cols-2",
					)}
				>
					<div className="space-y-2">
						<Label>
							{resolvedScope === "branch"
								? "Branch Name"
								: "Salon Business Name"}
						</Label>
						<Input
							value={profileData.salonName}
							onChange={(e) =>
								setProfileData((prev) => ({
									...prev,
									salonName: e.target.value,
								}))
							}
						/>
					</div>
					{resolvedScope !== "branch" && (
						<div className="space-y-2">
							<Label>Owner Name</Label>
							<Input
								value={profileData.ownerName}
								onChange={(e) =>
									setProfileData((prev) => ({
										...prev,
										ownerName: e.target.value,
									}))
								}
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
									onChange={(e) =>
										setProfileData((prev) => ({
											...prev,
											phone: e.target.value,
										}))
									}
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
							onChange={(e) =>
								setProfileData((prev) => ({ ...prev, address: e.target.value }))
							}
						/>
					</div>
				</div>

				{/* City & Country */}
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label>City</Label>
						<Input
							value={profileData.city}
							onChange={(e) =>
								setProfileData((prev) => ({ ...prev, city: e.target.value }))
							}
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
					<Button
						onClick={handleProfileSave}
						disabled={isSaving || !profileDirty}
					>
						{isSaving ? (
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
						) : (
							<Save className="w-4 h-4 mr-2" />
						)}
						Save changes
					</Button>
				</div>
			</CardContent>
		</Card>
	);

	const renderHoursTab = () => (
		<Card>
			{!isChainScope && (
				<CardHeader>
					<CardTitle>Business Hours</CardTitle>
					<CardDescription>
						Set your salon's operating hours. These will be used for online
						booking availability.
					</CardDescription>
				</CardHeader>
			)}
			<CardContent className={cn(isChainScope && "pt-6", "space-y-6")}>
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
												: "bg-background text-muted-foreground border-border hover:bg-muted",
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
									onChange={(time) =>
										setHoursData((prev) => ({ ...prev, openingTime: time }))
									}
									step={30}
								/>
							</div>
							<div className="space-y-2">
								<Label>Closing Time</Label>
								<TimePicker
									value={hoursData.closingTime}
									onChange={(time) =>
										setHoursData((prev) => ({ ...prev, closingTime: time }))
									}
									step={30}
								/>
							</div>
						</div>

						{/* Save Button */}
						<div className="flex justify-end pt-4 border-t">
							<Button
								onClick={handleHoursSave}
								disabled={isSaving || !hoursDirty}
							>
								{isSaving ? (
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								) : (
									<Save className="w-4 h-4 mr-2" />
								)}
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
		checked: boolean,
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
			emailBirthdayMessages: "email_birthday_messages",
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
			{!isChainScope && (
				<CardHeader>
					<CardTitle>Notifications</CardTitle>
					<CardDescription>
						Configure how you and your customers receive notifications.
					</CardDescription>
				</CardHeader>
			)}
			<CardContent className={cn(isChainScope && "pt-6", "space-y-4")}>
				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

				{(notificationSettings.emailAppointmentReminders ||
					notificationSettings.smsAppointmentReminders) && (
					<div className="flex flex-col items-start gap-3 border-l-2 border-primary/20 py-2 pl-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="font-medium text-sm">Reminder timing</p>
							<p className="text-sm text-muted-foreground">
								How far in advance to notify customers
							</p>
						</div>
						<Select
							value={String(notificationSettings.reminderHoursBefore)}
							onValueChange={(val) => {
								const hours = Number(val);
								setNotificationSettings((prev) => ({
									...prev,
									reminderHoursBefore: hours,
								}));
								saveNotificationSettings({ reminder_hours_before: hours });
							}}
							disabled={notificationsSaving}
						>
							<SelectTrigger className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1">1 hour before</SelectItem>
								<SelectItem value="2">2 hours before</SelectItem>
								<SelectItem value="4">4 hours before</SelectItem>
								<SelectItem value="12">12 hours before</SelectItem>
								<SelectItem value="24">24 hours before</SelectItem>
								<SelectItem value="48">2 days before</SelectItem>
								<SelectItem value="72">3 days before</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-medium">Email transaction alerts</p>
						<p className="text-sm text-muted-foreground">
							Email owners and managers when a payment or wallet top-up
							completes
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

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

				<div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-medium">Birthday messages</p>
						<p className="text-sm text-muted-foreground">
							Automatically email clients on their birthday (requires birthday on their profile)
						</p>
					</div>
					<Switch
						checked={notificationSettings.emailBirthdayMessages}
						disabled={notificationsSaving}
						onCheckedChange={(checked) =>
							handleNotificationToggle("emailBirthdayMessages", checked)
						}
					/>
				</div>
			</CardContent>
		</Card>
	);

	const renderBranchesTab = () => {
		const activeWindowsByLocation = new Map<
			string,
			BranchUnavailabilityWindow[]
		>();
		for (const window of branchWindows) {
			const windows = activeWindowsByLocation.get(window.location_id) || [];
			windows.push(window);
			activeWindowsByLocation.set(window.location_id, windows);
		}

		return (
			<>
				<Card>
					{!isChainScope && (
						<CardHeader>
							<CardTitle>Manage Branches</CardTitle>
							<CardDescription>
								Pause bookings for a branch during breaks, closures, or downtime.
							</CardDescription>
						</CardHeader>
					)}
					<CardContent>
						{branchWindowsLoading ? (
							<div className="space-y-2">
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
							</div>
						) : (
							<Accordion type="single" collapsible className="w-full">
								{locations.map((location) => {
									const locationWindows =
										activeWindowsByLocation.get(location.id) || [];
									const isUnavailable = locationWindows.length > 0;
									const latestWindow = locationWindows[0];
									return (
										<AccordionItem key={location.id} value={location.id}>
											<AccordionTrigger>
												<div className="flex w-full items-center justify-between pr-4">
													<div className="text-left">
														<p className="font-medium">{location.name}</p>
														<p className="text-xs text-muted-foreground">
															{location.city || "No city"}
														</p>
													</div>
													<Badge
														variant={
															isUnavailable ? "destructive" : "secondary"
														}
													>
														{isUnavailable ? "Unavailable" : "Active"}
													</Badge>
												</div>
											</AccordionTrigger>
											<AccordionContent>
												<div className="space-y-3 rounded-lg border p-3">
													{latestWindow ? (
														<div className="space-y-1">
															<p className="text-sm font-medium">
																Current unavailability
															</p>
															<p className="text-sm text-muted-foreground">
																{formatWindowText(latestWindow)}
															</p>
															{latestWindow.reason ? (
																<p className="text-xs text-muted-foreground">
																	Reason: {latestWindow.reason}
																</p>
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
															onClick={() =>
																handleOpenBranchWindowDialog(location.id)
															}
															disabled={branchWindowSaving}
														>
															Set unavailable period
														</Button>
														{latestWindow ? (
															<Button
																variant="destructive"
																onClick={() =>
																	handleEndBranchWindow(latestWindow)
																}
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

				<Dialog
					open={branchWindowDialogOpen}
					onOpenChange={setBranchWindowDialogOpen}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Set branch unavailability</DialogTitle>
							<DialogDescription>
								Confirm the period when this branch should stop accepting new
								bookings.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<div className="space-y-2">
								<Label>Start date & time</Label>
								<Input
									type="datetime-local"
									value={branchWindowStartsAt}
									onChange={(event) =>
										setBranchWindowStartsAt(event.target.value)
									}
								/>
							</div>
							<div className="flex items-center justify-between rounded-md border p-3">
								<div>
									<p className="text-sm font-medium">
										Indefinitely unavailable
									</p>
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
										onChange={(event) =>
											setBranchWindowEndsAt(event.target.value)
										}
									/>
								</div>
							) : null}
							<div className="space-y-2">
								<Label>Reason (optional)</Label>
								<Textarea
									rows={2}
									value={branchWindowReason}
									onChange={(event) =>
										setBranchWindowReason(event.target.value)
									}
									placeholder="e.g. Renovation, public holiday, staff retreat"
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setBranchWindowDialogOpen(false)}
								disabled={branchWindowSaving}
							>
								Cancel
							</Button>
							<Button
								onClick={handleCreateBranchWindow}
								disabled={branchWindowSaving}
							>
								{branchWindowSaving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
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
			{!isChainScope && (
				<CardHeader>
					<CardTitle>Booking Settings</CardTitle>
					<CardDescription>
						Manage booking behavior, payment rules, and the customer-facing
						styling of your booking page.
					</CardDescription>
				</CardHeader>
			)}
			<CardContent className={cn(isChainScope && "pt-6", "space-y-6")}>
					<div className="space-y-6">
						{bookingUrl ? (
							<div className="space-y-2">
								<Label>Booking URL</Label>
								<div className="flex items-center gap-2">
									<Input
										value={bookingUrl}
										readOnly
										className="flex-1 bg-muted"
									/>
									<Button variant="outline" size="icon" onClick={handleCopyUrl}>
										{copiedUrl ? (
											<Check className="w-4 h-4" />
										) : (
											<Copy className="w-4 h-4" />
										)}
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Share this link with customers to let them book online.
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<Label>Booking URL</Label>
								<div className="rounded-lg border border-dashed bg-muted/50 p-4">
									<p className="mb-3 text-sm text-muted-foreground">
										Generate a booking URL before publishing the booking page.
									</p>
									<Button
										onClick={handleGenerateSlug}
										disabled={isGeneratingSlug}
										className="gap-2"
									>
										{isGeneratingSlug ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Link2 className="h-4 w-4" />
										)}
										Generate Booking URL
									</Button>
								</div>
							</div>
						)}

						{/* ── Booking toggles — each saves immediately via a confirm popover ── */}
						<div className="space-y-1">
							{(
								[
									{
										key: "onlineBookingEnabled" as const,
										label: "Enable Online Booking",
										description:
											"Allow customers to book through the public booking page.",
										checked: bookingSettings.onlineBookingEnabled,
										disabled: false,
										stateUpdate: (v: boolean) => ({ onlineBookingEnabled: v }),
										dbUpdate: (v: boolean) => ({ online_booking_enabled: v }),
									},
									{
										key: "autoConfirmBookings" as const,
										label: "Auto-Confirm Bookings",
										description:
											"When off, customers submit requests first and only pay after salon approval.",
										checked: bookingSettings.autoConfirmBookings,
										disabled: false,
										stateUpdate: (v: boolean) => ({ autoConfirmBookings: v }),
										dbUpdate: (v: boolean) => ({ auto_confirm_bookings: v }),
									},
									{
										key: "depositsEnabled" as const,
										label: "Accept Online Deposits",
										description:
											"Company-level payment rule applied across your entire public booking checkout.",
										checked: bookingSettings.depositsEnabled,
										disabled: false,
										stateUpdate: (v: boolean) => ({ depositsEnabled: v }),
										dbUpdate: (v: boolean) => ({ deposits_enabled: v }),
									},
									{
										key: "allowStaffSelection" as const,
										label: "Allow Staff Selection",
										description:
											"Let customers choose a preferred staff member during booking.",
										checked: bookingSettings.allowStaffSelection,
										disabled: false,
										stateUpdate: (v: boolean) => ({
											allowStaffSelection: v,
											...(v ? {} : { requireStaffSelection: false }),
										}),
										dbUpdate: (v: boolean) => ({
											allow_staff_selection: v,
											...(v ? {} : { require_staff_selection: false }),
										}),
									},
									{
										key: "requireStaffSelection" as const,
										label: "Require Staff Selection",
										description:
											"Force customers to select a staff member before checkout.",
										checked: bookingSettings.requireStaffSelection,
										disabled: !bookingSettings.allowStaffSelection,
										stateUpdate: (v: boolean) => ({
											requireStaffSelection: v,
											...(v ? { autoAssignStaff: false } : {}),
										}),
										dbUpdate: (v: boolean) => ({
											require_staff_selection: v,
											...(v ? { auto_assign_staff: false } : {}),
										}),
									},
									{
										key: "autoAssignStaff" as const,
										label: "Auto-Assign Staff",
										description:
											"Automatically assign an eligible staff member when the customer leaves staff unselected.",
										checked: bookingSettings.autoAssignStaff,
										disabled: bookingSettings.requireStaffSelection,
										stateUpdate: (v: boolean) => ({ autoAssignStaff: v }),
										dbUpdate: (v: boolean) => ({ auto_assign_staff: v }),
									},
								] as const
							).map((item) => (
								<div
									key={item.key}
									className="flex items-center justify-between py-3 border-b last:border-0"
								>
									<div>
										<p className="font-medium">{item.label}</p>
										<p className="text-sm text-muted-foreground">
											{item.description}
										</p>
									</div>
									<Popover
										open={pendingToggle?.key === item.key}
										onOpenChange={(open) => {
											if (!open) setPendingToggle(null);
										}}
									>
										<PopoverTrigger asChild>
											<Switch
												checked={item.checked}
												disabled={item.disabled || isToggleSaving}
												onCheckedChange={(v) =>
													setPendingToggle({
														key: item.key,
														value: v,
														label: item.label,
														stateUpdate: item.stateUpdate(v),
														dbUpdate: item.dbUpdate(v),
													})
												}
											/>
										</PopoverTrigger>
										<PopoverContent align="end" className="w-64 p-4">
											<p className="text-sm font-medium">
												{pendingToggle?.value ? "Turn on" : "Turn off"}{" "}
												{item.label}?
											</p>
											<p className="mt-1 text-xs text-muted-foreground">
												{item.description}
											</p>
											<div className="mt-4 flex justify-end gap-2">
												<Button
													size="sm"
													variant="outline"
													onClick={() => setPendingToggle(null)}
												>
													Cancel
												</Button>
												<Button
													size="sm"
													disabled={isToggleSaving}
													onClick={confirmPendingToggle}
												>
													{isToggleSaving ? (
														<Loader2 className="h-3 w-3 animate-spin" />
													) : (
														"Confirm"
													)}
												</Button>
											</div>
										</PopoverContent>
									</Popover>
								</div>
							))}
						</div>

						{/* <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Payment model</p>
                <p className="mt-1 text-muted-foreground">
                  Your public booking page now uses one payment rule for the whole company. Per-service payment overrides no longer apply, and customers cannot pay at the salon via online booking.
                </p>
              </div> */}

						{/* ── Scheduling & capacity — these fields need explicit save ── */}
						<div className="rounded-xl border bg-muted/30 p-4 ">
							<div className="pt-2">
								<p className="text-sm font-semibold text-foreground">
									Scheduling &amp; Capacity
								</p>
								<p className="text-xs text-muted-foreground my-0.5">
									Edit the values below and click "Save Settings" to apply changes.
								</p>
							</div>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-2">
								<div className="space-y-2">
									<Label>Default Buffer Time</Label>
									<Select
										value={bookingSettings.defaultBufferMinutes.toString()}
										onValueChange={(v) =>
											setBookingSettings((prev) => ({
												...prev,
												defaultBufferMinutes: parseInt(v, 10),
											}))
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
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
													setBookingSettings((prev) => ({
														...prev,
														cancellationGraceHours: parsed,
													}));
												}
											}}
											onBlur={() => {
												const parsed = Number.parseInt(
													cancellationGraceHoursInput,
													10,
												);
												const normalized =
													!Number.isNaN(parsed) && parsed >= 0
														? parsed
														: bookingSettings.cancellationGraceHours;
												setCancellationGraceHoursInput(String(normalized));
												setBookingSettings((prev) => ({
													...prev,
													cancellationGraceHours: normalized,
												}));
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
												if (
													!Number.isNaN(parsed) &&
													parsed >= 0 &&
													parsed <= 100
												) {
													setBookingSettings((prev) => ({
														...prev,
														defaultDepositPercentage: parsed,
													}));
												}
											}}
											onBlur={() => {
												const parsed = Number.parseInt(
													defaultDepositPercentageInput,
													10,
												);
												const normalized = !Number.isNaN(parsed)
													? Math.min(100, Math.max(0, parsed))
													: bookingSettings.defaultDepositPercentage;
												setDefaultDepositPercentageInput(String(normalized));
												setBookingSettings((prev) => ({
													...prev,
													defaultDepositPercentage: normalized,
												}));
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
											if (
												!Number.isNaN(parsed) &&
												parsed >= 1 &&
												parsed <= 100
											) {
												setBookingSettings((prev) => ({
													...prev,
													slotCapacityDefault: parsed,
												}));
											}
										}}
										onBlur={() => {
											const parsed = Number.parseInt(
												slotCapacityDefaultInput,
												10,
											);
											const normalized = !Number.isNaN(parsed)
												? Math.min(100, Math.max(1, parsed))
												: bookingSettings.slotCapacityDefault;
											setSlotCapacityDefaultInput(String(normalized));
											setBookingSettings((prev) => ({
												...prev,
												slotCapacityDefault: normalized,
											}));
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
									onChange={(e) =>
										setBookingSettings((prev) => ({
											...prev,
											bookingStatusMessage: e.target.value,
										}))
									}
									rows={2}
								/>
							</div>
							<div className="flex justify-end pt-4">
								<Button
									onClick={handleBookingSave}
									disabled={isSaving || !bookingDirty}
								>
									{isSaving ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<Save className="mr-2 h-4 w-4" />
									)}
									Save settings
								</Button>
							</div>
						</div>
					</div>
				<div className="rounded-lg border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-sm font-medium">Themes &amp; Style</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Manage themes, banners, brand color, and hero copy on the{" "}
							<strong>Themes Settings</strong> page.
						</p>
					</div>
					<a
						href="/salon/themes-settings"
						className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted no-underline"
					>
						Open Themes Settings
					</a>
				</div>
			</CardContent>
		</Card>
	);

	const renderPaymentsTab = () => {
		const isPaystack =
			currentTenant?.country === "NG" || currentTenant?.country === "GH";
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Payments</CardTitle>
						<CardDescription>
							How customers pay you, and where those funds are sent.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
							<div className="flex items-center gap-3">
								<CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
								<div>
									<p className="font-medium">Payments are processed securely</p>
									<p className="text-sm text-muted-foreground">
										All online payments are processed through{" "}
										{isPaystack ? "Paystack" : "Stripe"} via Salon Magik.
									</p>
								</div>
							</div>
						</div>

						<div>
							<p className="text-sm font-medium mb-2">
								Supported Payment Methods
							</p>
							<div className="flex flex-wrap gap-2">
								<Badge variant="secondary">Card</Badge>
								{isPaystack && <Badge variant="secondary">Mobile Money</Badge>}
								<Badge variant="secondary">Bank Transfer</Badge>
							</div>
						</div>

						<div className="pt-2 border-t">
							<Button variant="outline" className="gap-2" asChild>
								<a href="/salon/transactions">
									<CreditCard className="w-4 h-4" />
									View Transactions
								</a>
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Receiving Account</CardTitle>
						<CardDescription>
							Add your bank account or Mobile Money number so Salon Magik can
							send your earnings directly to you.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PayoutDestinationsManager />
					</CardContent>
				</Card>
			</div>
		);
	};

	const renderRolesTab = () => {
		const roles = [
			{
				name: "Owner",
				permissions: [
					"Full access",
					"Manage staff",
					"Manage settings",
					"View reports",
					"Process refunds",
				],
			},
			{
				name: "Manager",
				permissions: [
					"Manage staff",
					"View reports",
					"Process refunds",
					"Manage appointments",
				],
			},
			{
				name: "Supervisor",
				permissions: [
					"Manage appointments",
					"Manage customers",
					"View services catalog",
				],
			},
			{
				name: "Receptionist",
				permissions: [
					"Manage appointments",
					"Manage customers",
					"Send messages",
				],
			},
			{
				name: "Staff",
				permissions: ["View own appointments", "Update appointment status"],
			},
		];

		return (
			<Card>
				<CardHeader>
					<CardTitle>Roles & Permissions</CardTitle>
					<CardDescription>
						View the default permissions for each role. Custom roles are not yet
						supported.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{roles.map((role) => (
							<div
								key={role.name}
								className="p-4 rounded-lg bg-muted/50 border"
							>
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
		const trialEndsAt = currentTenant?.trial_ends_at
			? new Date(currentTenant.trial_ends_at)
			: null;
		// Math.ceil (not date-fns differenceInDays, which floors) to match the
		// sidebar badge and trial-ending banner — otherwise the same trial_ends_at
		// shows a different day count depending which part of the UI you're on.
		const daysRemaining = trialEndsAt
			? Math.max(
					0,
					Math.ceil(
						(trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
					),
				)
			: 0;
		const isTrialing = currentTenant?.subscription_status === "trialing";

		const branchesValue = Number(branchesInput);
		const seatsValue = Number(seatsInput);
		const isPlanConfigUnchanged =
			planConfigQuote &&
			branchesValue === planConfigQuote.current_allowed_locations &&
			seatsValue === planConfigQuote.current_allowed_staff;
		const isPlanConfigIncrease = Boolean(
			planConfigQuote && (planConfigQuote.price_delta || 0) > 0,
		);

		return (
			<Card>
				{!isChainScope && (
					<CardHeader className="flex items-center gap-2">
						<CardTitle>Subscription</CardTitle>
						<CardDescription>
							Your business is on the{" "}
							<span className="font-medium capitalize">
								{currentTenant?.plan || "Solo"}
							</span>{" "}
							plan.
						</CardDescription>
					</CardHeader>
				)}
				<CardContent className={cn(isChainScope && "pt-6", "space-y-6")}>
					<div
						className="relative overflow-hidden rounded-xl p-4 sm:p-5"
						style={{
							background:
								"linear-gradient(160deg, #1F1536 0%, #2E1F4E 60%, #3A2660 100%)",
						}}
					>
						{/* Decorative scattered salon icons — same motif as the auth screens */}
						<div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
							<svg width="30" height="30" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "10%", right: "8%", opacity: 0.1, transform: "rotate(18deg)" }}>
								<circle cx="8" cy="22" r="4.5" stroke="white" strokeWidth="2" />
								<circle cx="8" cy="10" r="4.5" stroke="white" strokeWidth="2" />
								<line x1="11.5" y1="19.5" x2="27" y2="7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
								<line x1="11.5" y1="12.5" x2="27" y2="25" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
							</svg>
							<svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "12%", left: "4%", opacity: 0.09, transform: "rotate(-12deg)" }}>
								<rect x="11" y="3" width="10" height="7" rx="2" stroke="white" strokeWidth="2" />
								<line x1="16" y1="7" x2="16" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
								<path d="M11 10 Q9 12 9 15 L9 26 Q9 29 16 29 Q23 29 23 26 L23 15 Q23 12 21 10 Z" stroke="white" strokeWidth="2" />
							</svg>
							<svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "38%", left: "2%", opacity: 0.08, transform: "rotate(8deg)" }}>
								<ellipse cx="16" cy="12" rx="9" ry="10" stroke="white" strokeWidth="2" />
								<line x1="16" y1="22" x2="16" y2="29" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
								<line x1="11" y1="29" x2="21" y2="29" stroke="white" strokeWidth="2" strokeLinecap="round" />
							</svg>
							<svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "6%", right: "18%", opacity: 0.09, transform: "rotate(-30deg)" }}>
								<rect x="3" y="8" width="26" height="8" rx="2" stroke="white" strokeWidth="2" />
								{[7, 11, 15, 19, 23].map((x) => (
									<line key={x} x1={x} y1="16" x2={x} y2="25" stroke="white" strokeWidth="2" strokeLinecap="round" />
								))}
							</svg>
						</div>

						<div className="relative flex flex-wrap items-center justify-between gap-3 mb-2">
							<div>
								<p className="font-serif text-xl capitalize text-white">
									{currentTenant?.plan || "Solo"}
								</p>
								<div className="mt-1.5 flex items-center gap-2">
									<Badge className="capitalize bg-white/15 text-white hover:bg-white/15">
										{recurringTotal?.breakdown.billing_cycle || "monthly"} billing
									</Badge>
									<Badge
										className={cn(
											currentTenant?.subscription_status === "active"
												? "bg-success text-success-foreground hover:bg-success"
												: currentTenant?.subscription_status === "trialing"
													? "bg-[#F4C84E] text-[#2E1F4E] hover:bg-[#F4C84E]"
													: "bg-destructive text-destructive-foreground hover:bg-destructive",
										)}
									>
										{currentTenant?.subscription_status?.replace("_", " ") ||
											"Unknown"}
									</Badge>
								</div>
							</div>
							<Button
								type="button"
								size="sm"
								className="rounded-full bg-white text-[#2E1F4E] hover:bg-white/90"
								onClick={() =>
									planConfigSectionRef.current?.scrollIntoView({
										behavior: "smooth",
										block: "center",
									})
								}
							>
								Change plan
							</Button>
						</div>
						{isTrialing && trialEndsAt && (
							<div className="relative mt-3">
								<div className="flex items-center justify-between text-sm mb-1">
									<span className="text-white/60">Trial period</span>
									<span className="font-medium text-white">
										{daysRemaining} days remaining
									</span>
								</div>
								<Progress
									value={Math.max(0, 100 - (daysRemaining / 14) * 100)}
									className="h-2 bg-white/15"
									indicatorClassName="bg-[#F4C84E]"
								/>
								<p className="text-xs text-white/50 mt-1">
									Ends {format(trialEndsAt, "MMM d, yyyy")}
								</p>
							</div>
						)}
						{recurringTotal && (
							<div className="relative mt-3">
								<div className="flex items-baseline justify-between">
									<p className="font-serif text-3xl text-white">
										{formatCurrency(recurringTotal.total_amount, recurringTotal.currency)}
									</p>
									<p className="text-xs text-white/60">
										{isTrialing
											? trialEndsAt
												? `starts after trial · ${format(trialEndsAt, "MMM d")}`
												: "starts after trial"
											: currentTenant?.next_billing_at
												? `next charge · ${format(new Date(currentTenant.next_billing_at), "MMM d")}`
												: "next charge"}
									</p>
								</div>
								<div className="mt-3 space-y-1 border-t border-dashed border-white/15 pt-3 text-sm">
									<div className="flex items-center justify-between text-white/60">
										<span className="capitalize">{currentTenant?.plan || "Solo"} base plan</span>
										<span>{formatCurrency(recurringTotal.breakdown.base_price, recurringTotal.currency)}</span>
									</div>
									{recurringTotal.breakdown.addon_breakdown.extra_seats > 0 && (
										<div className="flex items-center justify-between text-white/60">
											<span>Extra seats ({recurringTotal.breakdown.addon_breakdown.extra_seats})</span>
											<span>{formatCurrency(recurringTotal.breakdown.addon_breakdown.seat_addon_total, recurringTotal.currency)}</span>
										</div>
									)}
									{recurringTotal.breakdown.addon_breakdown.location_addon_total > 0 && (
										<div className="flex items-center justify-between text-white/60">
											<span>Additional locations</span>
											<span>{formatCurrency(recurringTotal.breakdown.addon_breakdown.location_addon_total, recurringTotal.currency)}</span>
										</div>
									)}
									{recurringTotal.breakdown.addon_breakdown.staff_operations_enabled && (
										<div className="flex items-center justify-between text-white/60">
											<span>Staff Operations</span>
											<span>{formatCurrency(recurringTotal.breakdown.addon_breakdown.staff_operations_total, recurringTotal.currency)}</span>
										</div>
									)}
									{recurringTotal.breakdown.discount > 0 && (
										<div className="flex items-center justify-between text-[#F4C84E]">
											<span>Promo discount</span>
											<span>−{formatCurrency(recurringTotal.breakdown.discount, recurringTotal.currency)}</span>
										</div>
									)}
									<div className="flex items-center justify-between border-t border-white/15 pt-2 mt-2 font-medium text-white">
										<span>Total this cycle</span>
										<span>{formatCurrency(recurringTotal.total_amount, recurringTotal.currency)}</span>
									</div>
									{recurringTotal.breakdown.billing_cycle === "annual" && (
										<p className="pt-1 text-xs text-white/50">
											Base plan is billed annually and isn't part of this monthly line — this covers add-ons only.
										</p>
									)}
								</div>
							</div>
						)}
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<div className="rounded-xl bg-muted/50 p-4">
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Locations</p>
							<p className="mt-1 font-serif text-2xl">
								{entitlements?.used_locations ?? 0} /{" "}
								{entitlements?.allowed_locations ??
									currentPlan?.limits?.max_locations ??
									1}
							</p>
						</div>
						<div className="rounded-xl bg-muted/50 p-4">
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Seats</p>
							<p className="mt-1 font-serif text-2xl">
								{entitlements?.used_staff ?? 0} /{" "}
								{entitlements?.allowed_staff ??
									currentPlan?.limits?.max_staff ??
									1}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{Number(entitlements?.extra_staff_seats || 0) > 0
									? `${entitlements?.base_staff_limit ?? currentPlan?.limits?.max_staff ?? 1} included in your plan + ${entitlements?.extra_staff_seats} paid add-on`
									: "All included in your plan"}
							</p>
						</div>
						<div className="rounded-xl bg-muted/50 p-4">
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Storefront Theme</p>
							<p className="mt-1 font-serif text-lg">
								{entitlements?.has_ecommerce_theme
									? "E-commerce active"
									: "Default theme"}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{entitlements?.ecommerce_theme_expires_at
									? `Renews until ${format(new Date(entitlements.ecommerce_theme_expires_at), "MMM d, yyyy")}`
									: "No paid storefront theme active"}
							</p>
						</div>
					</div>

					<div ref={planConfigSectionRef} className="scroll-mt-6">
					<div className="grid gap-4 lg:grid-cols-2 lg:items-start">
					<div className="space-y-3">
						<p className="text-sm font-medium">Manage branches & team size</p>
						<div className="rounded-lg border p-4 space-y-4">
							<p className="text-sm text-muted-foreground">
								Tell us how many branches and team seats you need. We'll
								automatically put you on the right plan for it.
							</p>
							{(currentTenant?.plan === "chain" ||
								planConfigQuote?.required_plan_slug === "chain") && (
								<p className="text-xs text-muted-foreground">
									On the Chain plan, each branch you add here includes 12 team
									seats automatically — opening a new branch location elsewhere
									doesn't add seats on its own, only increasing the branch count
									here does.
								</p>
							)}
							<div className="divide-y rounded-lg border">
								<div className="flex items-center justify-between gap-4 p-3.5">
									<div>
										<Label htmlFor="config-branches" className="text-sm font-medium">Branches</Label>
										<p className="text-xs text-muted-foreground">
											{planConfigQuote
												? `${planConfigQuote.current_allowed_locations} included on ${planConfigQuote.current_plan_slug}`
												: "How many locations you operate"}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-3">
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="h-7 w-7 rounded-full"
											disabled={Number(branchesInput) <= 1}
											onClick={() => setBranchesInput(String(Math.max(1, branchesValue - 1)))}
										>
											<Minus className="h-3.5 w-3.5" />
										</Button>
										<span id="config-branches" className="min-w-[1.5rem] text-center font-serif text-lg">
											{branchesInput}
										</span>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="h-7 w-7 rounded-full"
											onClick={() => setBranchesInput(String(branchesValue + 1))}
										>
											<Plus className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
								<div className="flex items-center justify-between gap-4 p-3.5">
									<div>
										<Label htmlFor="config-seats" className="text-sm font-medium">Team seats</Label>
										<p className="text-xs text-muted-foreground">
											{planConfigQuote
												? `${planConfigQuote.current_allowed_staff} included on ${planConfigQuote.current_plan_slug}`
												: "How many staff accounts you need"}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-3">
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="h-7 w-7 rounded-full"
											disabled={Number(seatsInput) <= 0}
											onClick={() => setSeatsInput(String(Math.max(0, seatsValue - 1)))}
										>
											<Minus className="h-3.5 w-3.5" />
										</Button>
										<span id="config-seats" className="min-w-[1.5rem] text-center font-serif text-lg">
											{seatsInput}
										</span>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="h-7 w-7 rounded-full"
											onClick={() => setSeatsInput(String(seatsValue + 1))}
										>
											<Plus className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
							</div>

							{isQuotingPlanConfig && (
								<p className="text-sm text-muted-foreground flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" /> Calculating...
								</p>
							)}

							{planConfigQuoteError && (
								<p className="text-sm text-destructive">
									{planConfigQuoteError}
								</p>
							)}

							{!isQuotingPlanConfig &&
								planConfigQuote &&
								!planConfigQuote.requires_custom_locations && (
									<div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
										{isPlanConfigUnchanged ? (
											<p>
												You're currently on this plan —{" "}
												<span className="font-medium capitalize">
													{planConfigQuote.required_plan_slug}
												</span>{" "}
												plan,{" "}
												{formatCurrency(
													planConfigQuote.total_monthly_price || 0,
													planConfigQuote.currency,
												)}{" "}
												/ month.
											</p>
										) : (
											<>
												<p>
													This puts you on the{" "}
													<span className="font-medium capitalize">
														{planConfigQuote.required_plan_slug}
													</span>{" "}
													plan.
												</p>
												<p>
													New monthly total:{" "}
													<span className="font-medium">
														{formatCurrency(
															planConfigQuote.total_monthly_price || 0,
															planConfigQuote.currency,
														)}
													</span>
												</p>
												<p
													className={
														isPlanConfigIncrease
															? "text-amber-600"
															: "text-success"
													}
												>
													{isPlanConfigIncrease
														? `+${formatCurrency(planConfigQuote.price_delta || 0, planConfigQuote.currency)} / month — payment required`
														: `${formatCurrency(planConfigQuote.price_delta || 0, planConfigQuote.currency)} / month — applies immediately, no charge`}
												</p>
												{isPlanConfigIncrease &&
													(planConfigQuote.discount_amount || 0) > 0 && (
														<p className="text-success">
															Promo discount: −
															{formatCurrency(
																planConfigQuote.discount_amount || 0,
																planConfigQuote.currency,
															)}{" "}
															· you'll be charged{" "}
															{formatCurrency(
																Math.max(
																	(planConfigQuote.price_delta || 0) -
																		(planConfigQuote.discount_amount || 0),
																	0,
																),
																planConfigQuote.currency,
															)}
														</p>
													)}
											</>
										)}
									</div>
								)}

							{!isQuotingPlanConfig &&
								planConfigQuote?.requires_custom_locations && (
									<p className="text-sm text-destructive">
										That many branches needs a custom plan. Contact support to
										set this up.
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
								{isApplyingPlanConfig && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{isPlanConfigUnchanged
									? "No changes"
									: isPlanConfigIncrease
										? "Pay & Update"
										: "Update Billing"}
							</Button>
						</div>
					</div>

					<div className="space-y-3">
						<p className="text-sm font-medium">Add-ons</p>
						<div className="space-y-3 rounded-lg border border-primary/15 bg-primary/[0.035] p-4">
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="text-sm font-medium">Staff Operations</p>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Check-ins, time-off requests, and leave allowances.
										{!staffOperationsAddon.isEnabled && staffOperationsAddon.isPlanEligible && staffOperationsAddon.priceLabel
											? ` ${staffOperationsAddon.priceLabel}/month.`
											: ""}
										{!staffOperationsAddon.isPlanEligible ? " Available on Studio and Chain plans." : ""}
									</p>
								</div>
								{staffOperationsAddon.isPlanEligible ? (
									<Switch
										checked={staffOperationsAddon.isEnabled}
										disabled={staffOperationsAddon.isUpdating || (!staffOperationsAddon.isEnabled && !staffOperationsAddon.hasValidPrice)}
										onCheckedChange={() => staffOperationsAddon.toggle()}
									/>
								) : (
									<Badge variant="outline" className="shrink-0">Studio+ only</Badge>
								)}
							</div>

							<div className="flex items-center justify-between gap-4 border-t border-primary/10 pt-3">
								<div>
									<p className="text-sm font-medium">Booking page themes</p>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Preview, purchase, and apply themes for your booking page.
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="shrink-0 gap-1.5 rounded-full"
									onClick={() => navigate("/salon/themes-settings")}
								>
									<Palette className="h-3.5 w-3.5" />
									Browse themes
								</Button>
							</div>
						</div>
					</div>
					</div>
					</div>
					<div className="pt-4 border-t space-y-3">
						<p className="text-sm font-medium">Promo code</p>
						{subscriptionPromo ? (
							<div className="rounded-lg bg-success/10 p-3 text-sm">
								<div className="flex items-center justify-between font-medium text-success">
									<span>{subscriptionPromo.code} applied · {subscriptionPromo.campaign_name}</span>
									<span className="font-normal">
										{subscriptionPromo.remaining_uses} use{subscriptionPromo.remaining_uses === 1 ? "" : "s"} left
									</span>
								</div>
								<p className="mt-1 text-success/80">
									{subscriptionPromo.discount_type === "percentage"
										? `${subscriptionPromo.discount_value}% off`
										: `${formatCurrency(subscriptionPromo.discount_value, currentTenant?.currency || "NGN")} off`}
									{" · applies to "}
									{subscriptionPromo.billing_targets
										.map((target) => (target === "credits" ? "messaging credits" : "subscription billing"))
										.join(" and ")}
									{subscriptionPromo.campaign_ends_at && (
										<> · valid through {format(new Date(subscriptionPromo.campaign_ends_at), "MMM d, yyyy")}</>
									)}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<Label>Apply Sales Promo Code</Label>
								<div className="flex gap-2">
									<Input
										value={subscriptionPromoCode}
										onChange={(event) =>
											setSubscriptionPromoCode(
												event.target.value.toUpperCase(),
											)
										}
										placeholder="Enter promo code"
									/>
									<Button
										variant="outline"
										onClick={async () => {
											try {
												await claimTenantPromo.mutateAsync({
													code: subscriptionPromoCode,
													surface: "subscription",
												});
												setSubscriptionPromoCode("");
												toast({
													title: "Promo claimed",
													description:
														"The promo is now attached to this tenant for subscription billing.",
												});
											} catch (error) {
												toast({
													title: "Promo unavailable",
													description:
														error instanceof Error
															? error.message
															: "Failed to claim promo code.",
													variant: "destructive",
												});
											}
										}}
										disabled={
											!subscriptionPromoCode.trim() ||
											claimTenantPromo.isPending
										}
									>
										{claimTenantPromo.isPending ? (
											<Loader2 className="w-4 h-4 animate-spin" />
										) : (
											"Apply"
										)}
									</Button>
								</div>
							</div>
						)}
						{isTrialing && (
							<>
								<Button
									className="w-full gap-2"
									onClick={() => setUpgradeConfirmOpen(true)}
									disabled={isStartingSubscriptionCheckout}
								>
									{isStartingSubscriptionCheckout ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : (
										<Zap className="w-4 h-4" />
									)}
									{isStartingSubscriptionCheckout
										? "Redirecting..."
										: "Upgrade Now"}
								</Button>
								<p className="text-xs text-muted-foreground text-center">
									Continue using all features after your trial ends
								</p>
							</>
						)}
					</div>

					<Dialog open={upgradeConfirmOpen} onOpenChange={setUpgradeConfirmOpen}>
						<DialogContent className="sm:max-w-md">
							<DialogHeader>
								<DialogTitle>Confirm your upgrade</DialogTitle>
								<DialogDescription>
									Here's what you'll be billed. You'll confirm this once more with Paystack before anything is charged.
								</DialogDescription>
							</DialogHeader>
							{recurringTotal ? (
								<div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
									<div className="flex items-center justify-between text-muted-foreground">
										<span className="capitalize">{currentTenant?.plan || "Solo"} base plan</span>
										<span>{formatCurrency(recurringTotal.breakdown.base_price, recurringTotal.currency)}</span>
									</div>
									{recurringTotal.breakdown.addon_breakdown.extra_seats > 0 && (
										<div className="flex items-center justify-between text-muted-foreground">
											<span>Extra seats ({recurringTotal.breakdown.addon_breakdown.extra_seats})</span>
											<span>{formatCurrency(recurringTotal.breakdown.addon_breakdown.seat_addon_total, recurringTotal.currency)}</span>
										</div>
									)}
									{recurringTotal.breakdown.addon_breakdown.location_addon_total > 0 && (
										<div className="flex items-center justify-between text-muted-foreground">
											<span>Additional locations</span>
											<span>{formatCurrency(recurringTotal.breakdown.addon_breakdown.location_addon_total, recurringTotal.currency)}</span>
										</div>
									)}
									{recurringTotal.breakdown.addon_breakdown.staff_operations_enabled && (
										<div className="flex items-center justify-between text-muted-foreground">
											<span>Staff Operations</span>
											<span>{formatCurrency(recurringTotal.breakdown.addon_breakdown.staff_operations_total, recurringTotal.currency)}</span>
										</div>
									)}
									{recurringTotal.breakdown.discount > 0 && (
										<div className="flex items-center justify-between text-success">
											<span>Promo discount</span>
											<span>−{formatCurrency(recurringTotal.breakdown.discount, recurringTotal.currency)}</span>
										</div>
									)}
									<div className="flex items-center justify-between border-t pt-2 mt-2 font-medium text-foreground">
										<span>Total {recurringTotal.breakdown.billing_cycle === "annual" ? "this month (add-ons)" : "this cycle"}</span>
										<span>{formatCurrency(recurringTotal.total_amount, recurringTotal.currency)}</span>
									</div>
								</div>
							) : (
								<p className="text-sm text-muted-foreground">
									Your bill will be calculated from your current plan and add-ons.
								</p>
							)}
							<DialogFooter className="gap-2 sm:gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => setUpgradeConfirmOpen(false)}
									disabled={isStartingSubscriptionCheckout}
								>
									Cancel
								</Button>
								<Button
									type="button"
									className="gap-2"
									onClick={() => {
										setUpgradeConfirmOpen(false);
										void startSubscriptionCheckout();
									}}
									disabled={isStartingSubscriptionCheckout}
								>
									{isStartingSubscriptionCheckout && <Loader2 className="h-4 w-4 animate-spin" />}
									Confirm & Continue to Payment
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</CardContent>
			</Card>
		);
	};

	const { data: referralCodes, isLoading: codesLoading } = useMyReferralCodes();
	const { data: referralDiscounts, isLoading: discountsLoading } =
		useMyReferralDiscounts();
	const generateCodeMutation = useGenerateReferralCode();

	const renderPromotionsTab = () => {
		const bookingUrl = buildPublicBookingUrl(currentTenant?.slug, {
			configuredDomain: import.meta.env.VITE_PUBLIC_BOOKING_BASE_DOMAIN as
				| string
				| undefined,
			hostname:
				typeof window !== "undefined" ? window.location.hostname : undefined,
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
								This promo stays available to your tenant until it is consumed,
								expires, or is invalidated.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2 text-sm">
							<div>
								<span className="text-muted-foreground">Code:</span>{" "}
								<span className="font-medium">{activeTenantPromo.code}</span>
							</div>
							<div>
								<span className="text-muted-foreground">Campaign:</span>{" "}
								<span className="font-medium">
									{activeTenantPromo.campaign_name}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Targets:</span>{" "}
								<span className="font-medium">
									{activeTenantPromo.billing_targets.join(", ")}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Remaining uses:</span>{" "}
								<span className="font-medium">
									{activeTenantPromo.remaining_uses}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Campaign ends:</span>{" "}
								<span className="font-medium">
									{format(
										new Date(activeTenantPromo.campaign_ends_at),
										"MMM d, yyyy",
									)}
								</span>
							</div>
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
							Share your referral link and earn discounts when other salons sign
							up.
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
												`${window.location.origin}/signup?ref=${currentTenant?.slug || ""}`,
											);
											toast({
												title: "Copied!",
												description: "Referral link copied to clipboard",
											});
										}}
									>
										<Copy className="w-4 h-4" />
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									When someone signs up using this link, you both get a
									discount!
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
												<code className="font-mono font-semibold">
													{code.code}
												</code>
												<Badge
													variant={code.consumed ? "secondary" : "default"}
												>
													{code.consumed ? "Used" : "Available"}
												</Badge>
											</div>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													navigator.clipboard.writeText(code.code);
													toast({
														title: "Copied!",
														description: "Referral code copied",
													});
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
											<p className="font-semibold">
												{discount.percentage}% Off
											</p>
											<p className="text-sm text-muted-foreground">
												{discount.source === "referrer"
													? "Referral reward"
													: "New user discount"}
											</p>
										</div>
										<div className="text-right">
											<Badge variant="outline">
												Expires{" "}
												{format(new Date(discount.expires_at), "MMM d, yyyy")}
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

	const renderWithdrawalsTab = () => <WithdrawalHistory />;

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

	const isChainScope = resolvedScope === "business" || resolvedScope === "branch";

	const chainTabHeaders: Record<string, { title: string; subtitle: string }> = {
		profile:
			resolvedScope === "branch"
				? { title: "Branch Profile", subtitle: "Manage this branch's name, contact, and location." }
				: { title: "Business Profile", subtitle: "Manage your business name, contact, and owner details." },
		hours: { title: "Branch Hours", subtitle: "Set the operating hours for this branch." },
		branches: { title: "Manage Branches", subtitle: "Pause or configure bookings per branch location." },
		booking: { title: "Booking Settings", subtitle: "Manage booking behaviour, payment rules, and scheduling capacity." },
		notifications: { title: "Notifications", subtitle: "Configure email and SMS notifications for appointments and updates." },
		subscription: { title: "Subscription", subtitle: "Manage your plan, billing, and add-ons." },
		"custom-domain": { title: "Custom Domain", subtitle: "Connect your own domain to your public booking page." },
		sessions: { title: "Active Sessions", subtitle: "View and manage active login sessions across your account." },
	};

	const settingsContent = (
		<>
			{activeTab === "profile" && renderProfileTab()}
			{activeTab === "hours" && renderHoursTab()}
			{activeTab === "branches" && renderBranchesTab()}
			{activeTab === "booking" && renderBookingTab()}
			{activeTab === "payments" && renderPaymentsTab()}
			{activeTab === "wallet" && renderWalletTab()}
			{activeTab === "payout-destinations" && <PayoutDestinationsManager />}
			{activeTab === "withdrawals" && renderWithdrawalsTab()}
			{activeTab === "promotions" && renderPromotionsTab()}
			{activeTab === "notifications" && renderNotificationsTab()}
			{activeTab === "roles" && renderRolesTab()}
			{activeTab === "subscription" && renderSubscriptionTab()}
			{activeTab === "custom-domain" && <CustomDomainManager />}
			{activeTab === "sessions" && <ActiveSessionsTab />}
		</>
	);

	// Business and branch scopes: sidebar handles navigation — each tab renders
	// its own page-level header above the card content.
	if (isChainScope) {
		const header = chainTabHeaders[activeTab];
		return (
			<SalonSidebar>
				<div className="space-y-6">
					{header && (
						<div>
							<h1 className="text-2xl font-semibold">{header.title}</h1>
							<p className="text-muted-foreground">{header.subtitle}</p>
						</div>
					)}
					{settingsContent}
				</div>
				<PaymentSuccessModal
					open={!!paymentSuccessModal}
					onClose={() => setPaymentSuccessModal(null)}
					title={paymentSuccessModal?.title ?? ""}
					description={paymentSuccessModal?.description ?? ""}
					detail={paymentSuccessModal?.detail}
				/>
			</SalonSidebar>
		);
	}

	// Legacy (non-chain) scope: keep the classic header + in-page sidebar nav.
	return (
		<SalonSidebar>
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-semibold">Settings</h1>
					<p className="text-muted-foreground">
						Manage your salon's configuration and preferences
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
												: "text-muted-foreground hover:bg-muted hover:text-foreground",
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
					<div className="flex-1">{settingsContent}</div>
				</div>
			</div>
			<PaymentSuccessModal
				open={!!paymentSuccessModal}
				onClose={() => setPaymentSuccessModal(null)}
				title={paymentSuccessModal?.title ?? ""}
				description={paymentSuccessModal?.description ?? ""}
				detail={paymentSuccessModal?.detail}
			/>
		</SalonSidebar>
	);
}
