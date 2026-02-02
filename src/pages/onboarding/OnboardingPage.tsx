import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Building2, MapPin, Clock, Loader2, Check } from "lucide-react";

type OnboardingStep = "business" | "location" | "hours" | "complete";

interface BusinessInfo {
  name: string;
  country: string;
  currency: string;
}

interface LocationInfo {
  name: string;
  city: string;
  address: string;
  timezone: string;
}

interface HoursInfo {
  openingTime: string;
  closingTime: string;
  openingDays: string[];
}

const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", timezone: "Africa/Lagos" },
  { code: "GH", name: "Ghana", currency: "GHS", timezone: "Africa/Accra" },
  { code: "US", name: "United States", currency: "USD", timezone: "America/New_York" },
  { code: "GB", name: "United Kingdom", currency: "GBP", timezone: "Europe/London" },
  { code: "KE", name: "Kenya", currency: "KES", timezone: "Africa/Nairobi" },
  { code: "ZA", name: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg" },
];

const DAYS_OF_WEEK = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return { value: `${hour}:00:00`, label: `${hour}:00` };
});

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, refreshTenants } = useAuth();
  const [step, setStep] = useState<OnboardingStep>("business");
  const [isLoading, setIsLoading] = useState(false);

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    name: "",
    country: "",
    currency: "",
  });

  const [locationInfo, setLocationInfo] = useState<LocationInfo>({
    name: "Main Location",
    city: "",
    address: "",
    timezone: "",
  });

  const [hoursInfo, setHoursInfo] = useState<HoursInfo>({
    openingTime: "09:00:00",
    closingTime: "18:00:00",
    openingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
  });

  const stepProgress = {
    business: 33,
    location: 66,
    hours: 100,
    complete: 100,
  };

  const handleCountryChange = (countryCode: string) => {
    const country = COUNTRIES.find((c) => c.code === countryCode);
    if (country) {
      setBusinessInfo((prev) => ({
        ...prev,
        country: countryCode,
        currency: country.currency,
      }));
      setLocationInfo((prev) => ({
        ...prev,
        timezone: country.timezone,
      }));
    }
  };

  const toggleDay = (day: string) => {
    setHoursInfo((prev) => ({
      ...prev,
      openingDays: prev.openingDays.includes(day)
        ? prev.openingDays.filter((d) => d !== day)
        : [...prev.openingDays, day],
    }));
  };

  const handleSubmit = async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      // 1. Create the tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          name: businessInfo.name,
          country: businessInfo.country,
          currency: businessInfo.currency,
          timezone: locationInfo.timezone,
          subscription_status: "trialing",
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 2. Create the user's role as owner
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: user.id,
        tenant_id: tenant.id,
        role: "owner",
      });

      if (roleError) throw roleError;

      // 3. Create the default location
      const selectedCountry = COUNTRIES.find((c) => c.code === businessInfo.country);
      const { error: locationError } = await supabase.from("locations").insert({
        tenant_id: tenant.id,
        name: locationInfo.name,
        city: locationInfo.city,
        address: locationInfo.address || null,
        country: selectedCountry?.name || businessInfo.country,
        timezone: locationInfo.timezone,
        opening_time: hoursInfo.openingTime,
        closing_time: hoursInfo.closingTime,
        opening_days: hoursInfo.openingDays,
        is_default: true,
      });

      if (locationError) throw locationError;

      // 4. Create communication credits for the tenant
      const { error: creditsError } = await supabase.from("communication_credits").insert({
        tenant_id: tenant.id,
        balance: 30,
        free_monthly_allocation: 30,
      });

      if (creditsError) throw creditsError;

      // Refresh tenants in auth context
      await refreshTenants();

      setStep("complete");
      
      toast({
        title: "Welcome to Salon Magik!",
        description: "Your salon has been set up successfully.",
      });

      // Navigate to salon dashboard after a brief delay
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

  const canProceed = () => {
    switch (step) {
      case "business":
        return businessInfo.name.trim() && businessInfo.country;
      case "location":
        return locationInfo.city.trim();
      case "hours":
        return hoursInfo.openingDays.length > 0;
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (step === "business") setStep("location");
    else if (step === "location") setStep("hours");
    else if (step === "hours") handleSubmit();
  };

  const prevStep = () => {
    if (step === "location") setStep("business");
    else if (step === "hours") setStep("location");
  };

  if (step === "complete") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-success" />
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <SalonMagikLogo size="md" />
            <span className="text-sm text-muted-foreground">
              Step {step === "business" ? 1 : step === "location" ? 2 : 3} of 3
            </span>
          </div>
          <Progress value={stepProgress[step]} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          {step === "business" && (
            <>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Tell us about your business</CardTitle>
                <CardDescription>
                  Let's get started with some basic information about your salon.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business name *</Label>
                  <Input
                    id="businessName"
                    placeholder="e.g., Glamour Hair Studio"
                    value={businessInfo.name}
                    onChange={(e) => setBusinessInfo((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Select value={businessInfo.country} onValueChange={handleCountryChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {businessInfo.currency && (
                  <p className="text-sm text-muted-foreground">
                    Currency: <span className="font-medium">{businessInfo.currency}</span>
                  </p>
                )}
              </CardContent>
            </>
          )}

          {step === "location" && (
            <>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Where is your salon located?</CardTitle>
                <CardDescription>
                  Add your primary location. You can add more locations later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="locationName">Location name</Label>
                  <Input
                    id="locationName"
                    placeholder="e.g., Main Branch"
                    value={locationInfo.name}
                    onChange={(e) => setLocationInfo((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    placeholder="e.g., Lagos"
                    value={locationInfo.city}
                    onChange={(e) => setLocationInfo((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Street address (optional)</Label>
                  <Input
                    id="address"
                    placeholder="e.g., 123 Victoria Island"
                    value={locationInfo.address}
                    onChange={(e) => setLocationInfo((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={locationInfo.timezone}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </CardContent>
            </>
          )}

          {step === "hours" && (
            <>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Set your business hours</CardTitle>
                <CardDescription>
                  When is your salon open for appointments?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opening time</Label>
                    <Select
                      value={hoursInfo.openingTime}
                      onValueChange={(v) => setHoursInfo((prev) => ({ ...prev, openingTime: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time.value} value={time.value}>
                            {time.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Closing time</Label>
                    <Select
                      value={hoursInfo.closingTime}
                      onValueChange={(v) => setHoursInfo((prev) => ({ ...prev, closingTime: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time.value} value={time.value}>
                            {time.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Days open *</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDay(day.id)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          hoursInfo.openingDays.includes(day.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-input hover:bg-muted"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between p-6 pt-0">
            {step !== "business" ? (
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
              ) : step === "hours" ? (
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
