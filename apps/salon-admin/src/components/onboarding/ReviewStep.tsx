import { Input } from "@ui/input";
import { CheckCircle2, User, Building2, MapPin, Users, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@shared/utils";
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
  promoCode?: string;
  onPromoCodeChange?: (value: string) => void;
  onApplyPromo?: () => void;
  isApplyingPromo?: boolean;
  promoPreview?: {
    valid: boolean;
    message?: string;
    campaignName?: string;
    discountType?: string;
    discountValue?: number;
    maxUsesPerTenant?: number;
    billingTargets?: string[];
    campaignEndsAt?: string | null;
  } | null;
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

function ReviewCard({ icon: Icon, title, children, highlight }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  highlight?: "amber";
}) {
  return (
    <div className={cn(
      "rounded-[12px] border p-4",
      highlight === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-black/[0.06] bg-black/[0.02]",
    )}>
      <div className={cn(
        "mb-3 flex items-center gap-2 text-[13px] font-medium",
        highlight === "amber" ? "text-amber-700" : "text-black/60",
      )}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-[13px]">
      <span className="text-black/40">{label}: </span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

export function ReviewStep({
  role,
  profile,
  ownerInvite,
  plan,
  business,
  locations,
  chainSummary,
  trialDays = 14,
  promoCode = "",
  onPromoCodeChange,
  onApplyPromo,
  isApplyingPromo = false,
  promoPreview = null,
}: ReviewStepProps) {
  const formatDays = (days: string[]) => {
    const dayMap: Record<string, string> = {
      monday: "Mon", tuesday: "Tue", wednesday: "Wed",
      thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
    };
    return days.map((d) => dayMap[d]).join(", ");
  };

  const formatTime = (time: string) => time.slice(0, 5);

  return (
    <div className="p-7">
      <div className="mb-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#2E1F4E]/10">
          <CheckCircle2 className="h-5 w-5 text-[#2E1F4E]" />
        </div>
        <h2 className="font-serif text-[22px] font-medium leading-snug tracking-[-0.2px] text-gray-900">
          Review your setup
        </h2>
        <p className="mt-1 text-[14px] text-black/45">
          Please review the information below before completing your setup.
        </p>
      </div>

      <div className="space-y-3">
        {/* Profile */}
        <ReviewCard icon={User} title="Your Profile">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Row label="Role" value={ROLE_NAMES[role]} />
            <Row label="Name" value={`${profile.firstName} ${profile.lastName}`} />
            <Row label="Email" value={profile.email} />
            {profile.phone && <Row label="Phone" value={profile.phone} />}
          </div>
        </ReviewCard>

        {/* Owner invite */}
        {ownerInvite && (
          <ReviewCard icon={Users} title="Owner Invitation" highlight="amber">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Row label="Name" value={ownerInvite.name} />
              <Row label="Email" value={ownerInvite.email} />
              {ownerInvite.phone && <Row label="Phone" value={ownerInvite.phone} />}
            </div>
            <p className="mt-2 text-[12px] text-amber-600">
              An invitation will be sent after setup.
            </p>
          </ReviewCard>
        )}

        {/* Plan */}
        <ReviewCard icon={Sparkles} title="Subscription Plan">
          <p className="text-[13px]">
            <span className="font-medium text-gray-800">{PLAN_NAMES[plan]}</span>
            <span className="text-black/40"> — {trialDays}-day free trial</span>
          </p>
        </ReviewCard>

        {/* Chain billing */}
        {plan === "chain" && chainSummary && (
          <ReviewCard icon={Sparkles} title="Chain Billing Preview">
            <div className="space-y-1">
              <Row label="Configured branches" value={chainSummary.configuredLocations} />
              <Row
                label="Estimated monthly"
                value={`${chainSummary.currency} ${chainSummary.estimatedMonthlyTotal.toLocaleString()}`}
              />
              {chainSummary.expectedBillingDate && (
                <Row label="Billing starts" value={chainSummary.expectedBillingDate} />
              )}
              {chainSummary.requiresCustom && (
                <p className="mt-1.5 text-[12px] text-amber-700">
                  Stores above 10 are pending custom pricing approval.
                </p>
              )}
            </div>
          </ReviewCard>
        )}

        {/* Promo code */}
        <ReviewCard icon={Sparkles} title="Promo Code">
          <div className="flex gap-2">
            <Input
              value={promoCode}
              onChange={(event) => onPromoCodeChange?.(event.target.value.toUpperCase())}
              placeholder="Enter promo code"
              className="h-9 text-[13px]"
            />
            <button
              type="button"
              onClick={onApplyPromo}
              disabled={!promoCode.trim() || isApplyingPromo}
              className="flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] px-3.5 text-[13px] font-medium text-black/60 transition-colors hover:border-black/20 hover:text-black/80 disabled:opacity-40"
            >
              {isApplyingPromo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply
            </button>
          </div>
          {promoPreview ? (
            <div className={cn(
              "mt-2 rounded-[8px] px-3 py-2 text-[12.5px]",
              promoPreview.valid
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600",
            )}>
              {promoPreview.valid ? (
                <>
                  <span className="font-medium">{promoPreview.campaignName}</span>
                  {" · "}
                  {promoPreview.discountType === "fixed"
                    ? promoPreview.discountValue
                    : `${promoPreview.discountValue}% off`}
                  {promoPreview.billingTargets?.length
                    ? ` · ${promoPreview.billingTargets.join(", ")}`
                    : ""}
                </>
              ) : (
                promoPreview.message
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[12px] text-black/35">
              Optional. If valid, your discount is attached when setup completes.
            </p>
          )}
        </ReviewCard>

        {/* Business */}
        <ReviewCard icon={Building2} title="Business Details">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Row label="Name" value={business.name} />
            <Row label="Country" value={COUNTRY_NAMES[business.country] || business.country} />
            <Row label="Currency" value={business.currency} />
            <Row label="City" value={business.city} />
          </div>
          {plan !== "chain" && (
            <div className="mt-2 space-y-1">
              <Row label="Hours" value={`${formatTime(business.openingTime)} – ${formatTime(business.closingTime)}`} />
              <Row label="Open" value={formatDays(business.openingDays)} />
            </div>
          )}
        </ReviewCard>

        {/* Branches */}
        {locations && locations.locations.length > 0 && (
          <ReviewCard icon={MapPin} title={`Branches (${locations.locations.length})`}>
            <div className="space-y-1.5">
              {locations.locations.map((loc, idx) => (
                <div key={loc.id} className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium text-gray-800">{loc.name || `Branch ${idx + 1}`}</span>
                  <span className="text-black/40">— {loc.city}</span>
                  {loc.isDefault && (
                    <span className="text-[11px] text-[#2E1F4E]">(Default)</span>
                  )}
                </div>
              ))}
            </div>
          </ReviewCard>
        )}
      </div>
    </div>
  );
}
