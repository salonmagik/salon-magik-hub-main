import { CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { CheckCircle2, User, Building2, MapPin, Users, Sparkles } from "lucide-react";
import type { UserRole } from "./RoleStep";
import type { ProfileInfo } from "./ProfileStep";
import type { OwnerInviteInfo } from "./OwnerInviteStep";
import type { SubscriptionPlan } from "./PlanStep";
import type { BusinessInfo } from "./BusinessStep";
import type { LocationsConfig } from "./LocationsStep";

interface ReviewStepProps {
  role: UserRole;
  profile: ProfileInfo;
  ownerInvite: OwnerInviteInfo | null;
  plan: SubscriptionPlan;
  business: BusinessInfo;
  locations: LocationsConfig | null;
  chainSummary?: {
    configuredLocations: number;
    estimatedMonthlyTotal: number;
    currency: string;
    expectedBillingDate: string | null;
    requiresCustom?: boolean;
  } | null;
  trialDays?: number;
}

const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  solo: "Solo",
  studio: "Studio",
  chain: "Chain",
};

const ROLE_NAMES: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  GH: "Ghana",
  US: "United States",
  GB: "United Kingdom",
  KE: "Kenya",
  ZA: "South Africa",
};

export function ReviewStep({
  role,
  profile,
  ownerInvite,
  plan,
  business,
  locations,
  chainSummary,
  trialDays = 14,
}: ReviewStepProps) {
  const formatDays = (days: string[]) => {
    const dayMap: Record<string, string> = {
      monday: "Mon",
      tuesday: "Tue",
      wednesday: "Wed",
      thursday: "Thu",
      friday: "Fri",
      saturday: "Sat",
      sunday: "Sun",
    };
    return days.map((d) => dayMap[d]).join(", ");
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5); // "09:00:00" -> "09:00"
  };

  return (
    <>
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <CheckCircle2 className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Review your setup</CardTitle>
        <CardDescription>
          Please review the information below before completing your setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Role & Profile */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-primary" />
            Your Profile
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Role:</span>{" "}
              <span className="font-medium">{ROLE_NAMES[role]}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Name:</span>{" "}
              <span className="font-medium">{profile.firstName} {profile.lastName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{" "}
              <span className="font-medium">{profile.email}</span>
            </div>
            {profile.phone && (
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                <span className="font-medium">{profile.phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Owner Invite (if applicable) */}
        {ownerInvite && (
          <div className="border rounded-lg p-4 space-y-3 border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <Users className="w-4 h-4" />
              Owner Invitation
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="font-medium">{ownerInvite.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-medium">{ownerInvite.email}</span>
              </div>
            </div>
            <p className="text-xs text-amber-600">
              An invitation will be sent after setup.
            </p>
          </div>
        )}

        {/* Plan */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4 text-primary" />
            Subscription Plan
          </div>
          <div className="text-sm">
            <span className="font-medium">{PLAN_NAMES[plan]}</span>
            <span className="text-muted-foreground"> – {trialDays}-day free trial</span>
          </div>
        </div>

        {plan === "chain" && chainSummary && (
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              Chain Billing Preview
            </div>
            <p className="text-sm">
              Configured stores: <span className="font-medium">{chainSummary.configuredLocations}</span>
            </p>
            <p className="text-sm">
              Estimated monthly charge:{" "}
              <span className="font-medium">
                {chainSummary.currency} {chainSummary.estimatedMonthlyTotal.toLocaleString()}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Expected billing date: {chainSummary.expectedBillingDate || "Next billing cycle"}
            </p>
            {chainSummary.requiresCustom && (
              <p className="text-xs text-amber-700">
                This setup includes custom-tier stores. Onboarding continues, but stores above 10 remain pending approval.
              </p>
            )}
          </div>
        )}

        {/* Business & Location */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="w-4 h-4 text-primary" />
            Business Details
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span>{" "}
              <span className="font-medium">{business.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Country:</span>{" "}
              <span className="font-medium">{COUNTRY_NAMES[business.country] || business.country}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Currency:</span>{" "}
              <span className="font-medium">{business.currency}</span>
            </div>
            <div>
              <span className="text-muted-foreground">City:</span>{" "}
              <span className="font-medium">{business.city}</span>
            </div>
          </div>
          {plan !== "chain" && (
            <div className="text-sm">
              <span className="text-muted-foreground">Hours:</span>{" "}
              <span className="font-medium">
                {formatTime(business.openingTime)} – {formatTime(business.closingTime)}
              </span>
              <br />
              <span className="text-muted-foreground">Open:</span>{" "}
              <span className="font-medium">{formatDays(business.openingDays)}</span>
            </div>
          )}
        </div>

        {/* Multi-location (Chain only) */}
        {locations && locations.locations.length > 0 && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="w-4 h-4 text-primary" />
              Locations ({locations.locations.length})
            </div>
            <div className="space-y-2">
              {locations.locations.map((loc, idx) => (
                <div key={loc.id} className="text-sm flex items-center gap-2">
                  <span className="font-medium">{loc.name || `Location ${idx + 1}`}</span>
                  <span className="text-muted-foreground">– {loc.city}</span>
                  {loc.isDefault && (
                    <span className="text-xs text-primary">(Default)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </>
  );
}
