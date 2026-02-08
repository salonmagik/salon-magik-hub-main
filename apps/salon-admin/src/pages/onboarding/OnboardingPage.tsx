import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@ui/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Progress } from "@ui/progress";
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react";

import { RoleStep, type UserRole } from "@/components/onboarding/RoleStep";
import { OwnerInviteStep, type OwnerInviteInfo } from "@/components/onboarding/OwnerInviteStep";
import { PlanStep, type SubscriptionPlan } from "@/components/onboarding/PlanStep";
import { BusinessStep, type BusinessInfo } from "@/components/onboarding/BusinessStep";
import { LocationsStep, type LocationsConfig, type LocationInfo } from "@/components/onboarding/LocationsStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { getCurrencyForCountry } from "@/hooks/usePlanPricing";
import { seedDefaultPermissions } from "@/hooks/usePermissions";

type OnboardingStep = "role" | "owner-invite" | "business" | "plan" | "locations" | "review" | "complete";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, refreshTenants } = useAuth();
  const [step, setStep] = useState<OnboardingStep>("role");
  const [isLoading, setIsLoading] = useState(false);

  // Step data
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const [ownerInvite, setOwnerInvite] = useState<OwnerInviteInfo>({
    name: "",
    email: "",
    phone: "",
  });

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

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

  // Get user info from auth metadata (collected during signup)
  const firstName = user?.user_metadata?.first_name || "";
  const lastName = user?.user_metadata?.last_name || "";
  const email = user?.email || "";
  const phone = user?.user_metadata?.phone || "";

  // Determine step flow based on role and plan
  const isOwner = selectedRole === "owner";
  const isChain = selectedPlan === "chain";

  // Get currency based on selected country
  const currency = businessInfo.country 
    ? getCurrencyForCountry(businessInfo.country) 
    : "USD";

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
  const progress = step === "complete" ? 100 : ((currentStepIndex + 1) / totalSteps) * 100;

  const canProceed = (): boolean => {
    switch (step) {
      case "role":
        return selectedRole !== null;
      case "owner-invite":
        return ownerInvite.name.trim() !== "" && ownerInvite.email.trim() !== "";
      case "business":
        return businessInfo.name.trim() !== "" && 
               businessInfo.country !== "" && 
               businessInfo.city.trim() !== "" &&
               businessInfo.openingDays.length > 0;
      case "plan":
        return selectedPlan !== null;
      case "locations":
        return locationsConfig.locations.length > 0 && 
               locationsConfig.locations.every((loc) => loc.city.trim() !== "");
      case "review":
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const currentIndex = stepFlow.indexOf(step);
    if (currentIndex < stepFlow.length - 1) {
      const next = stepFlow[currentIndex + 1];
      
      // Initialize locations when entering locations step
      if (next === "locations" && locationsConfig.locations.length === 0) {
        const initialLocation: LocationInfo = {
          id: crypto.randomUUID(),
          name: locationsConfig.sameName ? businessInfo.name : "",
          city: businessInfo.city,
          address: businessInfo.address,
          country: businessInfo.country,
          timezone: businessInfo.timezone,
          openingTime: businessInfo.openingTime,
          closingTime: businessInfo.closingTime,
          openingDays: businessInfo.openingDays,
          isDefault: true,
        };
        setLocationsConfig((prev) => ({ ...prev, locations: [initialLocation] }));
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

  const handleSubmit = async () => {
    if (!user || !selectedRole || !selectedPlan) return;

    setIsLoading(true);

    try {
      const tenantId = crypto.randomUUID();

      // 1. Create the tenant
      const { error: tenantError } = await supabase.from("tenants").insert({
        id: tenantId,
        name: businessInfo.name,
        country: businessInfo.country,
        currency: businessInfo.currency,
        timezone: businessInfo.timezone,
        plan: selectedPlan,
        subscription_status: "trialing",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (tenantError) throw tenantError;

      // 2. Create the user's role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: user.id,
        tenant_id: tenantId,
        role: selectedRole,
      });

      if (roleError) throw roleError;

      // 3. Update user profile with auth metadata
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: `${firstName} ${lastName}`.trim() || "User",
          phone: phone || null,
        })
        .eq("user_id", user.id);

      if (profileError) console.error("Profile update error:", profileError);

      // 4. Create locations
      if (isChain && locationsConfig.locations.length > 0) {
        const locationInserts = locationsConfig.locations.map((loc) => ({
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
        }));

        const { error: locationsError } = await supabase.from("locations").insert(locationInserts);
        if (locationsError) throw locationsError;
      } else {
        // Single location for Solo/Studio
        const { error: locationError } = await supabase.from("locations").insert({
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
        });

        if (locationError) throw locationError;
      }

      // 5. Create communication credits
      const { error: creditsError } = await supabase.from("communication_credits").insert({
        tenant_id: tenantId,
        balance: selectedPlan === "chain" ? 500 : selectedPlan === "studio" ? 100 : 30,
        free_monthly_allocation: selectedPlan === "chain" ? 500 : selectedPlan === "studio" ? 100 : 30,
      });

      if (creditsError) throw creditsError;

      // 6. Seed default role permissions
      try {
        await seedDefaultPermissions(tenantId);
      } catch (permError) {
        console.error("Permission seeding error:", permError);
        // Don't block onboarding if permission seeding fails
      }

      // 7. Send owner invitation for non-owners
      if (!isOwner && ownerInvite.email) {
        try {
          await supabase.functions.invoke("send-staff-invitation", {
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
        } catch (inviteError) {
          console.error("Owner invitation error:", inviteError);
          // Don't block onboarding if invitation fails
        }
      }

      await refreshTenants();

      setStep("complete");
      
      toast({
        title: "Welcome to Salon Magik!",
        description: "Your salon has been set up successfully.",
      });

      setTimeout(() => {
        navigate("/salon");
      }, 2000);
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold mb-2">You're all set!</h1>
            <p className="text-muted-foreground">Redirecting to your dashboard...</p>
          </div>
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
        </div>
      </div>
    );
  }

  // Create profile info for ReviewStep (using auth data)
  const profileInfo = {
    firstName,
    lastName,
    phone,
    email,
    useSignInEmail: true,
    useSignInPhone: !!phone,
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <SalonMagikLogo size="md" />
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          {step === "role" && (
            <RoleStep
              selectedRole={selectedRole}
              onRoleSelect={setSelectedRole}
            />
          )}

          {step === "owner-invite" && (
            <OwnerInviteStep
              ownerInfo={ownerInvite}
              onChange={setOwnerInvite}
            />
          )}

          {step === "business" && (
            <BusinessStep
              businessInfo={businessInfo}
              onChange={setBusinessInfo}
            />
          )}

          {step === "plan" && (
            <PlanStep
              selectedPlan={selectedPlan}
              onPlanSelect={setSelectedPlan}
              currency={currency}
            />
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
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between p-6 pt-0">
            {currentStepIndex > 0 ? (
              <Button variant="ghost" onClick={prevStep} disabled={isLoading}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button onClick={nextStep} disabled={!canProceed() || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : step === "review" ? (
                "Complete Setup"
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
