import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@ui/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@shared/utils";

import { RoleStep, type UserRole } from "@/components/onboarding/RoleStep";
import { OwnerInviteStep, type OwnerInviteInfo } from "@/components/onboarding/OwnerInviteStep";
import { PlanStep, type SubscriptionPlan } from "@/components/onboarding/PlanStep";
import { BusinessStep, type BusinessInfo } from "@/components/onboarding/BusinessStep";
import { LocationsStep, type LocationsConfig, type LocationInfo } from "@/components/onboarding/LocationsStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { getCurrencyForCountry } from "@/hooks/usePlanPricing";
import { seedDefaultPermissions } from "@/hooks/usePermissions";
import { usePlans } from "@/hooks/usePlans";
import { useChainPriceQuote } from "@/hooks/useAdditionalLocationPricing";
import {
  clearGoogleOAuthIntent,
  clearPendingSalesPromoCode,
  readGoogleOAuthIntent,
  readPendingSalesPromoCode,
} from "@/lib/googleOAuthFlow";
import { getGoogleProfileFields } from "@/lib/authCompletion";

type OnboardingStep = "role" | "owner-invite" | "business" | "plan" | "locations" | "review" | "complete";

function SegmentProgress({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-[4px] flex-1 rounded-full transition-colors duration-300",
            i < currentIndex
              ? "bg-[#2E1F4E]"
              : i === currentIndex
                ? "bg-[#F4C84E]"
                : "bg-black/[0.08]",
          )}
        />
      ))}
    </div>
  );
}

const VALID_PLAN_SLUGS: SubscriptionPlan[] = ["solo", "studio", "chain"];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, refreshTenants } = useAuth();
  const { data: plans } = usePlans();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get("plan") as SubscriptionPlan | null;
  const { data: trialSetting } = useQuery({
    queryKey: ["default-trial-days"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "default_trial_days")
        .maybeSingle();
      if (error) throw error;
      const rawDays = Number((data?.value as any)?.days);
      return Number.isFinite(rawDays) ? Math.max(0, rawDays) : null;
    },
  });
  const [step, setStep] = useState<OnboardingStep>("role");
  const [isLoading, setIsLoading] = useState(false);
  const [expectedChainLocationsInput, setExpectedChainLocationsInput] = useState("2");
  const expectedChainLocations = useMemo(() => {
    const trimmed = expectedChainLocationsInput.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    return parsed;
  }, [expectedChainLocationsInput]);
  const effectiveExpectedChainLocations = expectedChainLocations ?? 2;

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const [ownerInvite, setOwnerInvite] = useState<OwnerInviteInfo>({
    name: "",
    email: "",
    phone: "",
  });
  const [ownerInviteError, setOwnerInviteError] = useState<string | null>(null);
  const [isCheckingOwnerEmail, setIsCheckingOwnerEmail] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    planFromUrl && VALID_PLAN_SLUGS.includes(planFromUrl) ? planFromUrl : null,
  );

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    name: "",
    country: "",
    currency: "",
    city: "",
    address: "",
    timezone: "",
    openingTime: "09:00:00",
    closingTime: "18:00:00",
    openingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
  });

  const [locationsConfig, setLocationsConfig] = useState<LocationsConfig>({
    sameCountry: true,
    sameName: true,
    sameHours: true,
    locations: [],
  });
  const [promoCode, setPromoCode] = useState(() => readPendingSalesPromoCode() || "");
  const [promoPreview, setPromoPreview] = useState<{
    valid: boolean;
    message?: string;
    campaignName?: string;
    discountType?: string;
    discountValue?: number;
    maxUsesPerTenant?: number;
    billingTargets?: string[];
    campaignEndsAt?: string | null;
    expiresAt?: string | null;
  } | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const googleProfile = getGoogleProfileFields(user);
  const firstName = googleProfile.firstName;
  const lastName = googleProfile.lastName;
  const email = user?.email || "";
  const phone = googleProfile.phone;
  const googleOAuthIntent = readGoogleOAuthIntent();

  const isOwner = selectedRole === "owner";
  const isChain = selectedPlan === "chain";
  const chainPlan = (plans || []).find((plan) => plan.slug === "chain");

  const currency = businessInfo.country
    ? getCurrencyForCountry(businessInfo.country)
    : "USD";

  const { data: chainQuote } = useChainPriceQuote(
    isChain ? chainPlan?.id || null : null,
    currency,
    effectiveExpectedChainLocations,
  );
  const configuredChainLocations = isChain
    ? Math.max(1, locationsConfig.locations.length || effectiveExpectedChainLocations)
    : 1;
  const { data: configuredChainQuote } = useChainPriceQuote(
    isChain ? chainPlan?.id || null : null,
    currency,
    configuredChainLocations,
  );
  const onboardingTrialDays =
    trialSetting ?? plans?.find((plan) => plan.is_recommended)?.trial_days ?? plans?.[0]?.trial_days ?? 14;
  const onboardingTrialEndsAt = new Date(Date.now() + onboardingTrialDays * 24 * 60 * 60 * 1000).toISOString();

  const getStepFlow = (): OnboardingStep[] => {
    const flow: OnboardingStep[] = ["role"];
    if (!isOwner) flow.push("owner-invite");
    flow.push("business", "plan");
    if (isChain) flow.push("locations");
    flow.push("review");
    return flow;
  };

  const stepFlow = getStepFlow();
  const currentStepIndex = stepFlow.indexOf(step);
  const totalSteps = stepFlow.length;

  const canProceed = (): boolean => {
    switch (step) {
      case "role":
        return selectedRole !== null;
      case "owner-invite": {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return (
          ownerInvite.name.trim() !== "" &&
          ownerInvite.email.trim() !== "" &&
          emailRe.test(ownerInvite.email.trim())
        );
      }
      case "business":
        return (
          businessInfo.name.trim() !== "" &&
          businessInfo.country !== "" &&
          businessInfo.city.trim() !== "" &&
          businessInfo.openingDays.length > 0
        );
      case "plan":
        if (!selectedPlan) return false;
        if (selectedPlan !== "chain") return true;
        if (expectedChainLocations == null) return false;
        return Boolean(chainQuote);
      case "locations":
        return (
          locationsConfig.locations.length > 0 &&
          locationsConfig.locations.every((loc) => loc.city.trim() !== "")
        );
      case "review":
        if (promoCode.trim() && !promoPreview?.valid) return false;
        if (!isChain) return true;
        return Boolean(configuredChainQuote);
      default:
        return false;
    }
  };

  const nextStep = async () => {
    const currentIndex = stepFlow.indexOf(step);
    if (currentIndex < stepFlow.length - 1) {
      const next = stepFlow[currentIndex + 1];

      if (step === "owner-invite") {
        setIsCheckingOwnerEmail(true);
        try {
          const { data, error } = await (supabase.rpc as any)("check_owner_invite_email", {
            p_email: ownerInvite.email.trim().toLowerCase(),
          });
          if (error) {
            setOwnerInviteError("Something went wrong checking this email. Please try again.");
            return;
          }
          if (data?.available === false) {
            setOwnerInviteError(
              data.reason === "already_owner"
                ? "This email already owns another salon on Salon Magik. Each owner can only manage one active salon — try a different email for this owner."
                : "This email already has a Salon Magik account. We can't send an owner invite to an existing account yet — try a different email, or have them sign in and set this up themselves once you're done.",
            );
            return;
          }
          setOwnerInviteError(null);
        } finally {
          setIsCheckingOwnerEmail(false);
        }
      }

      if (next === "locations" && locationsConfig.locations.length !== Math.max(1, effectiveExpectedChainLocations)) {
        const totalLocations = Math.max(1, effectiveExpectedChainLocations);
        const initialLocations: LocationInfo[] = Array.from({ length: totalLocations }).map((_, index) => ({
          id: crypto.randomUUID(),
          name: locationsConfig.sameName ? businessInfo.name : "",
          city: businessInfo.city,
          address: businessInfo.address,
          country: businessInfo.country,
          timezone: businessInfo.timezone,
          openingTime: businessInfo.openingTime,
          closingTime: businessInfo.closingTime,
          openingDays: businessInfo.openingDays,
          isDefault: index === 0,
        }));
        setLocationsConfig((prev) => ({ ...prev, locations: initialLocations }));
      }

      setStep(next);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    const currentIndex = stepFlow.indexOf(step);
    if (currentIndex > 0) {
      setStep(stepFlow[currentIndex - 1]);
    }
  };

  const handleApplyPromo = async () => {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode) {
      setPromoPreview(null);
      return;
    }

    setIsApplyingPromo(true);
    try {
      const { data, error } = await (supabase.rpc as any)("validate_sales_promo_code_for_email", {
        p_code: normalizedCode,
      });

      if (error) throw error;

      setPromoPreview({
        valid: Boolean(data?.valid),
        message: data?.message,
        campaignName: data?.campaign_name,
        discountType: data?.discount_type,
        discountValue: Number(data?.discount_value || 0),
        maxUsesPerTenant: Number(data?.max_uses_per_tenant || 0),
        billingTargets: Array.isArray(data?.billing_targets) ? data.billing_targets : [],
        campaignEndsAt: data?.campaign_ends_at || null,
        expiresAt: data?.expires_at || null,
      });
    } catch (error) {
      console.error("Promo validation error:", error);
      setPromoPreview({
        valid: false,
        message: "Unable to validate this promo code right now.",
      });
    } finally {
      setIsApplyingPromo(false);
    }
  };

  // Auto-validate a pre-filled promo code the moment the review step is reached.
  useEffect(() => {
    if (step === "review" && promoCode.trim() && !promoPreview && !isApplyingPromo) {
      void handleApplyPromo();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSubmit = async () => {
    if (!user || !selectedRole || !selectedPlan) return;

    setIsLoading(true);

    try {
      const tenantId = crypto.randomUUID();
      let creatorDefaultLocationId: string | null = null;

      const { error: tenantError } = await supabase.from("tenants").insert({
        id: tenantId,
        name: businessInfo.name,
        country: businessInfo.country,
        currency: businessInfo.currency,
        timezone: businessInfo.timezone,
        plan: selectedPlan,
        subscription_status: "trialing",
        trial_ends_at: onboardingTrialEndsAt,
      });

      if (tenantError) throw tenantError;

      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: user.id,
        tenant_id: tenantId,
        role: selectedRole,
      });

      if (roleError) throw roleError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: `${firstName} ${lastName}`.trim() || "User",
          phone: phone || null,
        })
        .eq("user_id", user.id);

      if (profileError) console.error("Profile update error:", profileError);

      if (isChain && locationsConfig.locations.length > 0) {
        const expectedLocations = Math.max(1, effectiveExpectedChainLocations);
        const configuredLocations = Math.max(
          1,
          Math.min(locationsConfig.locations.length, expectedLocations),
        );
        const requiresCustomUnlock = configuredLocations > 10 || configuredChainQuote?.requires_custom === true;
        const activatedLocations = requiresCustomUnlock ? Math.min(10, configuredLocations) : configuredLocations;
        const locationInserts = locationsConfig.locations.slice(0, activatedLocations).map((loc) => ({
          tenant_id: tenantId,
          name: loc.name || businessInfo.name,
          city: loc.city,
          address: loc.address || null,
          country: loc.country || businessInfo.country,
          timezone: loc.timezone || businessInfo.timezone,
          opening_time: loc.openingTime,
          closing_time: loc.closingTime,
          opening_days: loc.openingDays,
          is_default: loc.isDefault,
          availability: "open" as const,
        }));

        const { error: locationsError } = await supabase
          .from("locations")
          .insert(locationInserts)
          .select("id");
        if (locationsError) throw locationsError;
        const { data: defaultLocationRow, error: defaultLocationError } = await supabase
          .from("locations")
          .select("id")
          .eq("tenant_id", tenantId)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (defaultLocationError) throw defaultLocationError;
        creatorDefaultLocationId = defaultLocationRow?.id || null;

        if (!chainPlan?.id) {
          throw new Error("Chain plan is not configured yet. Contact support.");
        }
        const { error: entitlementError } = await (supabase.rpc as any)("set_tenant_chain_entitlement", {
          p_tenant_id: tenantId,
          p_plan_id: chainPlan.id,
          p_allowed_locations: activatedLocations,
          p_source: requiresCustomUnlock ? "onboarding_pending_unlock" : "onboarding",
          p_reason: requiresCustomUnlock
            ? `Pending custom unlock approval for ${configuredLocations} requested locations.`
            : "Initial chain location entitlement from onboarding.",
        });
        if (entitlementError) throw entitlementError;

        if (requiresCustomUnlock) {
          const { error: requestError } = await (supabase.from("tenant_chain_unlock_requests") as any).upsert(
            {
              tenant_id: tenantId,
              plan_id: chainPlan.id,
              requested_locations: configuredLocations,
              allowed_locations: activatedLocations,
              status: "pending",
              reason: "Requested during onboarding for chain 11+ locations.",
              requested_by: user.id,
            },
            { onConflict: "tenant_id" },
          );
          if (requestError) throw requestError;
        }
      } else {
        const { data: insertedLocation, error: locationError } = await supabase
          .from("locations")
          .insert({
            tenant_id: tenantId,
            name: "Main Location",
            city: businessInfo.city,
            address: businessInfo.address || null,
            country: businessInfo.country,
            timezone: businessInfo.timezone,
            opening_time: businessInfo.openingTime,
            closing_time: businessInfo.closingTime,
            opening_days: businessInfo.openingDays,
            is_default: true,
            availability: "open" as const,
          })
          .select("id")
          .single();

        if (locationError) throw locationError;
        creatorDefaultLocationId = insertedLocation?.id || null;
      }

      if (selectedRole !== "owner" && creatorDefaultLocationId) {
        const { error: assignmentError } = await supabase.from("staff_locations").insert({
          user_id: user.id,
          tenant_id: tenantId,
          location_id: creatorDefaultLocationId,
        });
        if (assignmentError) throw assignmentError;
      }

      const { error: creditsError } = await supabase.from("communication_credits").insert({
        tenant_id: tenantId,
        balance: selectedPlan === "chain" ? 500 : selectedPlan === "studio" ? 100 : 30,
        free_monthly_allocation: selectedPlan === "chain" ? 500 : selectedPlan === "studio" ? 100 : 30,
      });

      if (creditsError) throw creditsError;

      try {
        await seedDefaultPermissions(tenantId);
      } catch (permError) {
        console.error("Permission seeding error:", permError);
      }

      if (!isOwner && ownerInvite.email) {
        try {
          const { data: inviteData, error: inviteError } = await supabase.functions.invoke("send-staff-invitation", {
            body: {
              firstName: ownerInvite.name.split(" ")[0] || ownerInvite.name,
              lastName: ownerInvite.name.split(" ").slice(1).join(" ") || "",
              email: ownerInvite.email,
              phone: ownerInvite.phone || null,
              role: "owner",
              tenantId: tenantId,
              tenantName: businessInfo.name,
              invitedByName: `${firstName} ${lastName}`.trim(),
            },
          });
          if (inviteError || inviteData?.error) {
            toast({
              title: "Owner invite didn't go through",
              description:
                inviteData?.error ||
                "Your salon is set up, but we couldn't invite the owner. Add them from Staff once you're in.",
              variant: "destructive",
            });
          }
        } catch (inviteError) {
          console.error("Owner invitation error:", inviteError);
          toast({
            title: "Owner invite didn't go through",
            description: "Your salon is set up, but we couldn't invite the owner. Add them from Staff once you're in.",
            variant: "destructive",
          });
        }
      }

      if (googleOAuthIntent?.source === "signup" && googleOAuthIntent.inviteToken) {
        const { error: waitlistUpdateError } = await supabase
          .from("waitlist_leads")
          .update({
            status: "converted",
            converted_tenant_id: tenantId,
            converted_at: new Date().toISOString(),
          })
          .eq("invitation_token", googleOAuthIntent.inviteToken);

        if (waitlistUpdateError) {
          console.error("Waitlist conversion update error:", waitlistUpdateError);
        }
      }

      if (promoCode.trim() && promoPreview?.valid) {
        const { data: promoClaimData, error: promoClaimError } = await (supabase.rpc as any)("claim_sales_promo_code", {
          p_code: promoCode.trim().toUpperCase(),
          p_tenant_id: tenantId,
          p_surface: null,
        });

        if (promoClaimError) {
          console.error("Promo claim error:", promoClaimError);
          toast({
            title: "Promo not attached",
            description:
              "Your salon was created, but the promo code could not be attached. You can try again later in billing if it is still valid.",
            variant: "destructive",
          });
        } else if (promoClaimData?.success) {
          clearPendingSalesPromoCode();
        } else if (promoClaimData?.message) {
          toast({
            title: "Promo not attached",
            description: promoClaimData.message,
            variant: "destructive",
          });
        }
      }

      if (!isOwner && ownerInvite.email) {
        supabase.functions
          .invoke("send-welcome-email", {
            body: {
              tenantId,
              type: "staff_setup_for_owner",
              ownerName: `${firstName} ${lastName}`.trim() || "there",
              salonName: businessInfo.name,
              invitedOwnerName: ownerInvite.name || ownerInvite.email,
            },
          })
          .catch((err) => console.warn("Welcome email (staff_setup_for_owner) failed:", err));
      } else {
        supabase.functions
          .invoke("send-welcome-email", {
            body: {
              tenantId,
              type: "owner",
              ownerName: `${firstName} ${lastName}`.trim() || "there",
              salonName: businessInfo.name,
              plan: selectedPlan,
              trialDays: onboardingTrialDays,
            },
          })
          .catch((err) => console.warn("Welcome email (owner) failed:", err));
      }

      await refreshTenants();
      clearGoogleOAuthIntent();
      clearPendingSalesPromoCode();

      if (isChain && configuredChainLocations > 10) {
        toast({
          title: "Onboarding complete",
          description:
            "Your first 10 locations are active. Additional locations are pending custom pricing approval.",
        });
      }

      setStep("complete");
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast({
        title: "Setup failed",
        description: error.message || "An error occurred during setup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F6F2] p-4">
        <WelcomeModal
          initialPlan={selectedPlan || "solo"}
          currency={businessInfo.currency || "NGN"}
          trialDays={onboardingTrialDays}
          promoPreview={promoPreview}
          chainLocations={isChain ? locationsConfig.locations : []}
          businessName={businessInfo.name}
          onDismiss={() => navigate("/salon/overview")}
        />
      </div>
    );
  }

  const profileInfo = {
    firstName,
    lastName,
    phone,
    email,
    useSignInEmail: true,
    useSignInPhone: !!phone,
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F8F6F2]">
      {/* Decorative scattered salon icons */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        {/* ── LEFT COLUMN ── */}
        {/* Comb */}
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "4%", left: "5%", opacity: 0.065, transform: "rotate(-25deg)" }}>
          <rect x="3" y="8" width="26" height="8" rx="2" stroke="#2E1F4E" strokeWidth="2" />
          {[7,11,15,19,23].map((x) => <line key={x} x1={x} y1="16" x2={x} y2="25" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />)}
        </svg>
        {/* Nail polish */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "17%", left: "3%", opacity: 0.06, transform: "rotate(-14deg)" }}>
          <rect x="11" y="3" width="10" height="7" rx="2" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="16" y1="7" x2="16" y2="11" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 10 Q9 12 9 15 L9 26 Q9 29 16 29 Q23 29 23 26 L23 15 Q23 12 21 10 Z" stroke="#2E1F4E" strokeWidth="2" />
        </svg>
        {/* Tweezers */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "31%", left: "5%", opacity: 0.06, transform: "rotate(15deg)" }}>
          <path d="M13 28 L13 14 Q16 5 19 14 L19 28" stroke="#2E1F4E" strokeWidth="2" fill="none" strokeLinecap="round" />
          <line x1="13" y1="26" x2="19" y2="26" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Leaf */}
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "44%", left: "3%", opacity: 0.06, transform: "rotate(-30deg)" }}>
          <path d="M16 28 Q6 22 6 12 Q6 6 16 4 Q26 6 26 12 Q26 22 16 28 Z" stroke="#2E1F4E" strokeWidth="2" fill="none" />
          <line x1="16" y1="28" x2="16" y2="12" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Star */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "57%", left: "6%", opacity: 0.055, transform: "rotate(10deg)" }}>
          <path d="M16 4 L18.5 12 L27 12 L20 17 L22.5 25 L16 20 L9.5 25 L12 17 L5 12 L13.5 12 Z" stroke="#2E1F4E" strokeWidth="1.8" fill="none" />
        </svg>
        {/* Lemniscate */}
        <svg width="44" height="44" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "67%", left: "4%", opacity: 0.06 }}>
          <path d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z" stroke="#2E1F4E" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="16" cy="16" r="2" fill="#2E1F4E" />
        </svg>
        {/* Hair roller cylinder */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "80%", left: "3%", opacity: 0.055, transform: "rotate(20deg)" }}>
          <ellipse cx="16" cy="6" rx="8" ry="3" stroke="#2E1F4E" strokeWidth="2" />
          <ellipse cx="16" cy="26" rx="8" ry="3" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="8" y1="6" x2="8" y2="26" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="24" y1="6" x2="24" y2="26" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="9" y1="13" x2="23" y2="13" stroke="#2E1F4E" strokeWidth="1" />
          <line x1="9" y1="19" x2="23" y2="19" stroke="#2E1F4E" strokeWidth="1" />
        </svg>
        {/* Bobby pin */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "91%", left: "7%", opacity: 0.055, transform: "rotate(35deg)" }}>
          <path d="M10 5 Q10 18 10 26 Q10 29 14 29" stroke="#2E1F4E" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M14 5 Q12 10 12 18 Q12 24 14 28" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <line x1="10" y1="5" x2="14" y2="5" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />
        </svg>

        {/* ── LEFT-CENTER ── */}
        {/* Small scissors */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "11%", left: "20%", opacity: 0.055, transform: "rotate(45deg)" }}>
          <circle cx="8" cy="22" r="4.5" stroke="#2E1F4E" strokeWidth="2" />
          <circle cx="8" cy="10" r="4.5" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="11.5" y1="19.5" x2="27" y2="7" stroke="#2E1F4E" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="11.5" y1="12.5" x2="27" y2="25" stroke="#2E1F4E" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        {/* Candle */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "52%", left: "18%", opacity: 0.055, transform: "rotate(-10deg)" }}>
          <rect x="11" y="14" width="10" height="14" rx="1" stroke="#2E1F4E" strokeWidth="2" />
          <path d="M16 14 L16 8 Q18 6 16 4 Q14 6 16 8" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        {/* Nail file */}
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "76%", left: "22%", opacity: 0.05, transform: "rotate(25deg)" }}>
          <rect x="13" y="4" width="6" height="24" rx="3" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="13.5" y1="10" x2="18.5" y2="10" stroke="#2E1F4E" strokeWidth="1" />
          <line x1="13.5" y1="15" x2="18.5" y2="15" stroke="#2E1F4E" strokeWidth="1" />
          <line x1="13.5" y1="20" x2="18.5" y2="20" stroke="#2E1F4E" strokeWidth="1" />
        </svg>
        {/* Eye with lashes */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "94%", left: "26%", opacity: 0.05, transform: "rotate(-35deg)" }}>
          <path d="M5 16 Q16 8 27 16 Q16 24 5 16 Z" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
          <circle cx="16" cy="16" r="3.5" stroke="#2E1F4E" strokeWidth="1.5" />
          <line x1="11" y1="12" x2="10" y2="8" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="14" y1="10" x2="13.5" y2="6" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="9" x2="16" y2="5" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="19" y1="10" x2="19.5" y2="6" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="22" y1="12" x2="23" y2="8" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        {/* ── TOP STRIP ── */}
        {/* Razor */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "3%", left: "33%", opacity: 0.05, transform: "rotate(-40deg)" }}>
          <rect x="9" y="6" width="14" height="20" rx="4" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="12" y1="11" x2="20" y2="11" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="15" x2="20" y2="15" stroke="#2E1F4E" strokeWidth="1" strokeLinecap="round" />
          <circle cx="16" cy="21" r="2" stroke="#2E1F4E" strokeWidth="1.5" />
        </svg>
        {/* Hair clip */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "5%", left: "49%", opacity: 0.05, transform: "rotate(20deg)" }}>
          <rect x="6" y="12" width="20" height="8" rx="4" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="12" y1="12" x2="20" y2="20" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="20" y1="12" x2="12" y2="20" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Serum dropper */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "2%", left: "65%", opacity: 0.055, transform: "rotate(-10deg)" }}>
          <ellipse cx="16" cy="10" rx="6" ry="7" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="16" y1="17" x2="16" y2="26" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 28 Q16 31 18 28" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>

        {/* ── RIGHT COLUMN ── */}
        {/* Scissors */}
        <svg width="36" height="36" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "6%", right: "6%", opacity: 0.07, transform: "rotate(18deg)" }}>
          <circle cx="8" cy="22" r="4.5" stroke="#2E1F4E" strokeWidth="2" />
          <circle cx="8" cy="10" r="4.5" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="11.5" y1="19.5" x2="27" y2="7" stroke="#2E1F4E" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="11.5" y1="12.5" x2="27" y2="25" stroke="#2E1F4E" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        {/* Mirror */}
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "19%", right: "4%", opacity: 0.065, transform: "rotate(12deg)" }}>
          <ellipse cx="16" cy="12" rx="9" ry="10" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="16" y1="22" x2="16" y2="29" stroke="#2E1F4E" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="11" y1="29" x2="21" y2="29" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {/* Lipstick */}
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "32%", right: "7%", opacity: 0.06, transform: "rotate(8deg)" }}>
          <rect x="12" y="16" width="8" height="12" rx="1" stroke="#2E1F4E" strokeWidth="2" />
          <path d="M12 16 L12 11 Q16 7 20 11 L20 16" stroke="#2E1F4E" strokeWidth="2" fill="none" />
          <line x1="10" y1="16" x2="22" y2="16" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {/* Blow dryer */}
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "46%", right: "5%", opacity: 0.07, transform: "rotate(-20deg)" }}>
          <ellipse cx="13" cy="13" rx="9" ry="7" stroke="#2E1F4E" strokeWidth="2" />
          <path d="M21 10 L27 8 L27 18 L21 16" stroke="#2E1F4E" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 19 Q7 23 7 27" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {/* Crown */}
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "59%", right: "8%", opacity: 0.065, transform: "rotate(-12deg)" }}>
          <path d="M6 22 L6 14 L12 18 L16 10 L20 18 L26 14 L26 22 Z" stroke="#2E1F4E" strokeWidth="2" fill="none" strokeLinejoin="round" />
          <line x1="6" y1="22" x2="26" y2="22" stroke="#2E1F4E" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {/* Perfume bottle */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "71%", right: "5%", opacity: 0.06, transform: "rotate(8deg)" }}>
          <rect x="10" y="13" width="12" height="15" rx="3" stroke="#2E1F4E" strokeWidth="2" />
          <rect x="13" y="9" width="6" height="5" rx="1" stroke="#2E1F4E" strokeWidth="1.5" />
          <path d="M15 8 L15 5 L17 5 L17 8" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <line x1="17" y1="5" x2="20" y2="4" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Makeup brush */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "83%", right: "7%", opacity: 0.06, transform: "rotate(30deg)" }}>
          <line x1="16" y1="4" x2="16" y2="20" stroke="#2E1F4E" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M10 20 Q10 28 16 28 Q22 28 22 20 Z" stroke="#2E1F4E" strokeWidth="2" fill="none" />
        </svg>
        {/* Diamond gem */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "93%", right: "9%", opacity: 0.055, transform: "rotate(-10deg)" }}>
          <polygon points="16,5 24,13 16,28 8,13" stroke="#2E1F4E" strokeWidth="2" fill="none" />
          <line x1="8" y1="13" x2="24" y2="13" stroke="#2E1F4E" strokeWidth="1.5" />
        </svg>

        {/* ── RIGHT-CENTER ── */}
        {/* Hair clip */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "9%", right: "18%", opacity: 0.05, transform: "rotate(30deg)" }}>
          <rect x="6" y="12" width="20" height="8" rx="4" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="12" y1="12" x2="20" y2="20" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="20" y1="12" x2="12" y2="20" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Small scissors */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "26%", right: "15%", opacity: 0.055, transform: "rotate(40deg)" }}>
          <circle cx="8" cy="22" r="4.5" stroke="#2E1F4E" strokeWidth="2" />
          <circle cx="8" cy="10" r="4.5" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="11.5" y1="19.5" x2="27" y2="7" stroke="#2E1F4E" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="11.5" y1="12.5" x2="27" y2="25" stroke="#2E1F4E" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        {/* Massage stone */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "40%", right: "17%", opacity: 0.05, transform: "rotate(15deg)" }}>
          <ellipse cx="16" cy="16" rx="11" ry="8" stroke="#2E1F4E" strokeWidth="2" />
          <line x1="9" y1="13" x2="23" y2="13" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="19" x2="23" y2="19" stroke="#2E1F4E" strokeWidth="1" strokeLinecap="round" />
        </svg>
        {/* Lotus / spa flower */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "64%", right: "19%", opacity: 0.055, transform: "rotate(-15deg)" }}>
          <path d="M16 28 Q14 22 16 18 Q18 22 16 28" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
          <path d="M10 24 Q12 18 16 18 Q14 22 10 24" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
          <path d="M22 24 Q20 18 16 18 Q18 22 22 24" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
          <path d="M8 18 Q10 12 16 12 Q14 16 8 18" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
          <path d="M24 18 Q22 12 16 12 Q18 16 24 18" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
          <path d="M16 12 Q14 6 16 4 Q18 6 16 12" stroke="#2E1F4E" strokeWidth="1.5" fill="none" />
        </svg>
        {/* Steam / aromatherapy */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ top: "87%", right: "20%", opacity: 0.05, transform: "rotate(40deg)" }}>
          <ellipse cx="16" cy="24" rx="8" ry="5" stroke="#2E1F4E" strokeWidth="2" />
          <path d="M12 18 Q10 13 12 9" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M16 18 Q16 12 16 8" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M20 18 Q22 13 20 9" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>

        {/* ── BOTTOM STRIP ── */}
        {/* Curling iron */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "5%", left: "35%", opacity: 0.055, transform: "rotate(25deg)" }}>
          <line x1="16" y1="3" x2="16" y2="10" stroke="#2E1F4E" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M9 10 Q9 27 16 27 Q23 27 23 10" stroke="#2E1F4E" strokeWidth="2" fill="none" />
          <line x1="9" y1="10" x2="23" y2="10" stroke="#2E1F4E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {/* Small star */}
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "3%", left: "52%", opacity: 0.05, transform: "rotate(-15deg)" }}>
          <path d="M16 4 L18.5 12 L27 12 L20 17 L22.5 25 L16 20 L9.5 25 L12 17 L5 12 L13.5 12 Z" stroke="#2E1F4E" strokeWidth="1.8" fill="none" />
        </svg>
        {/* Candle */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="absolute" style={{ bottom: "6%", left: "68%", opacity: 0.055, transform: "rotate(10deg)" }}>
          <rect x="11" y="14" width="10" height="14" rx="1" stroke="#2E1F4E" strokeWidth="2" />
          <path d="M16 14 L16 8 Q18 6 16 4 Q14 6 16 8" stroke="#2E1F4E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Top nav */}
      <div className="flex items-center justify-between px-8 py-5">
        <SalonMagikLogo size="sm" />
        <span className="text-[13px] text-black/45">
          Step {currentStepIndex + 1} of {totalSteps}
        </span>
      </div>

      {/* Wizard */}
      <div className="mx-auto w-full max-w-[640px] px-7 pb-20 pt-2">
        {/* Stepper */}
        <div className="mb-8">
          <SegmentProgress currentIndex={currentStepIndex} total={totalSteps} />
        </div>

        {/* Step content — no white card wrapper, sits directly on cream */}
        <div>

            {step === "role" && (
              <RoleStep selectedRole={selectedRole} onRoleSelect={setSelectedRole} />
            )}

            {step === "owner-invite" && (
              <OwnerInviteStep
                ownerInfo={ownerInvite}
                onChange={setOwnerInvite}
                serverError={ownerInviteError}
                onClearServerError={() => setOwnerInviteError(null)}
              />
            )}

            {step === "business" && (
              <BusinessStep businessInfo={businessInfo} onChange={setBusinessInfo} />
            )}

            {step === "plan" && (
              <>
                <PlanStep
                  selectedPlan={selectedPlan}
                  onPlanSelect={setSelectedPlan}
                  currency={currency}
                />
                {isChain && (
                  <div className="space-y-4 px-7 pb-6 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="expectedLocations" className="text-[13.5px] font-medium text-gray-700">
                        How many branches do you have?
                      </Label>
                      <Input
                        id="expectedLocations"
                        type="number"
                        min={1}
                        value={expectedChainLocationsInput}
                        onChange={(event) => setExpectedChainLocationsInput(event.target.value)}
                        className="h-[44px] text-[14px]"
                      />
                      <p className="text-[12.5px] text-black/40">
                        Chain tiers apply to additional branches beyond the first.
                      </p>
                    </div>

                    {chainQuote && (
                      <div className="rounded-[18px] bg-[#EDE9E4] px-5 py-5">
                        {chainQuote.requires_custom ? (
                          <p className="text-[13.5px] text-amber-700">
                            This tier requires custom pricing. You can continue — activation beyond 10 branches will be pending approval.
                          </p>
                        ) : (
                          <>
                            <div className="flex items-baseline justify-between gap-4">
                              <p className="text-[15.5px] font-medium text-gray-900">
                                Estimated monthly total
                              </p>
                              <p className="text-[20px] font-medium text-gray-900 whitespace-nowrap">
                                {currency} {Number(chainQuote.total_price).toLocaleString()}
                              </p>
                            </div>
                            <div className="mt-3 space-y-1.5">
                              {chainQuote.breakdown.map((item, index) => (
                                <div key={`${item.tier_label}-${index}`} className="flex items-center justify-between text-[13px] text-black/50">
                                  <span>{item.tier_label}: {item.locations} location{item.locations !== 1 ? "s" : ""}</span>
                                  <span>
                                    {item.subtotal != null
                                      ? `${currency} ${Number(item.subtotal).toLocaleString()}`
                                      : "Custom"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {step === "locations" && (
              <LocationsStep
                config={locationsConfig}
                businessName={businessInfo.name}
                defaultCountry={businessInfo.country}
                defaultTimezone={businessInfo.timezone}
                defaultOpeningTime={businessInfo.openingTime}
                defaultClosingTime={businessInfo.closingTime}
                defaultOpeningDays={businessInfo.openingDays}
                maxLocations={Math.max(1, effectiveExpectedChainLocations)}
                onChange={setLocationsConfig}
              />
            )}

            {step === "review" && (
              <ReviewStep
                role={selectedRole!}
                profile={profileInfo}
                ownerInvite={isOwner ? null : ownerInvite}
                plan={selectedPlan!}
                business={businessInfo}
                locations={isChain ? locationsConfig : null}
                onEditStep={(s) => setStep(s)}
                chainSummary={
                  isChain && configuredChainQuote
                    ? {
                        configuredLocations: configuredChainLocations,
                        estimatedMonthlyTotal: Number(configuredChainQuote.total_price || 0),
                        currency,
                        expectedBillingDate: new Date(onboardingTrialEndsAt).toLocaleDateString(),
                        requiresCustom: configuredChainQuote.requires_custom,
                      }
                    : null
                }
                trialDays={onboardingTrialDays}
                promoCode={promoCode}
                onPromoCodeChange={(value) => {
                  setPromoCode(value);
                  setPromoPreview(null);
                }}
                onApplyPromo={handleApplyPromo}
                isApplyingPromo={isApplyingPromo}
                promoPreview={promoPreview}
              />
            )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between">
            {currentStepIndex > 0 ? (
              <button
                type="button"
                onClick={prevStep}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-full border border-black/[0.1] bg-white px-5 py-[10px] text-[14px] text-black/55 transition-colors hover:border-black/20 hover:text-black/80 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={nextStep}
              disabled={!canProceed() || isLoading || isCheckingOwnerEmail}
              className={cn(
                "flex items-center gap-2 rounded-full px-6 py-[11px] text-[14.5px] font-medium transition-colors",
                canProceed() && !isLoading && !isCheckingOwnerEmail
                  ? "bg-[#2E1F4E] text-white hover:bg-[#3A2660]"
                  : "cursor-not-allowed bg-black/10 text-black/30",
              )}
            >
              {isCheckingOwnerEmail ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : step === "review" ? (
                "Complete setup"
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
          <p className="mt-5 text-center text-[12.5px] text-black/35">No credit card needed · takes about 2 minutes</p>
        </div>
      </div>
    </div>
  );
}
