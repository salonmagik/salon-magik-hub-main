import {
  User, Building2, MapPin, Users, Sparkles,
  type LucideIcon,
} from "lucide-react";
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
  onEditStep?: (step: "role" | "owner-invite" | "business" | "plan") => void;
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
};

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  GH: "Ghana",
  US: "United States",
  GB: "United Kingdom",
  KE: "Kenya",
  ZA: "South Africa",
};

const ALL_DAYS = [
  { key: "monday",    label: "Mon" },
  { key: "tuesday",   label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday",  label: "Thu" },
  { key: "friday",    label: "Fri" },
  { key: "saturday",  label: "Sat" },
  { key: "sunday",    label: "Sun" },
];

function ReviewCard({
  icon: Icon,
  title,
  children,
  onEdit,
  editLabel = "Edit",
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="rounded-[22px] border border-black/[0.07] bg-white p-6 px-7 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#2E1F4E]/8">
            <Icon className="h-[15px] w-[15px] text-[#2E1F4E]" strokeWidth={1.8} />
          </div>
          <h3 className="text-[15.5px] font-medium text-gray-900">{title}</h3>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-[13px] text-[#2E1F4E] transition-opacity hover:opacity-60"
          >
            {editLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.05em] text-black/38">{label}</p>
      <p className="text-[14px] text-gray-800">{value}</p>
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
  onEditStep,
}: ReviewStepProps) {
  const formatTime = (time: string) => time.slice(0, 5);

  return (
    <div className="p-7">
      {/* Header */}
      <div className="mb-7">
        <div className="mb-3 flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-[#2E1F4E]">
          <span className="inline-block h-[1.5px] w-4 bg-[#F4C84E]" />
          Almost there
        </div>
        <h2 className="text-[24px] font-medium leading-snug tracking-[-0.3px] text-gray-900">
          Review your setup
        </h2>
        <p className="mt-1.5 text-[14px] text-black/45">
          Check everything below before we get your salon ready to go.
        </p>
      </div>

      <div className="space-y-3.5">
        {/* Profile */}
        <ReviewCard
          icon={User}
          title="Your profile"
          onEdit={onEditStep ? () => onEditStep("role") : undefined}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Name" value={`${profile.firstName} ${profile.lastName}`} />
            <Field label="Role" value={ROLE_NAMES[role]} />
            <Field label="Email" value={profile.email} />
            {profile.phone && <Field label="Phone" value={profile.phone} />}
          </div>
        </ReviewCard>

        {/* Owner invite */}
        {ownerInvite && (
          <ReviewCard
            icon={Users}
            title="Owner invitation"
            onEdit={onEditStep ? () => onEditStep("owner-invite") : undefined}
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Name" value={ownerInvite.name} />
              <Field label="Email" value={ownerInvite.email} />
              {ownerInvite.phone && <Field label="Phone" value={ownerInvite.phone} />}
            </div>
            <p className="mt-3 text-[12.5px] text-amber-600">
              An invitation will be sent after setup completes.
            </p>
          </ReviewCard>
        )}

        {/* Plan */}
        <ReviewCard
          icon={Sparkles}
          title="Subscription plan"
          onEdit={onEditStep ? () => onEditStep("plan") : undefined}
          editLabel="Change"
        >
          <div className="inline-flex items-center gap-2.5 rounded-full bg-[#2E1F4E]/8 px-4 py-[9px]">
            <span className="text-[14px] font-medium text-[#2E1F4E]">{PLAN_NAMES[plan]}</span>
            <span className="text-[13px] text-black/40">{trialDays}-day free trial, no card required</span>
          </div>
        </ReviewCard>

        {/* Chain billing */}
        {plan === "chain" && chainSummary && (
          <ReviewCard icon={Sparkles} title="Chain billing preview">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Configured branches" value={chainSummary.configuredLocations} />
              <Field
                label="Estimated monthly"
                value={`${chainSummary.currency} ${chainSummary.estimatedMonthlyTotal.toLocaleString()}`}
              />
              {chainSummary.expectedBillingDate && (
                <Field label="Billing starts" value={chainSummary.expectedBillingDate} />
              )}
            </div>
            {chainSummary.requiresCustom && (
              <p className="mt-3 text-[12.5px] text-amber-600">
                Branches above 10 are pending custom pricing approval.
              </p>
            )}
          </ReviewCard>
        )}

        {/* Business details */}
        <ReviewCard
          icon={Building2}
          title="Business details"
          onEdit={onEditStep ? () => onEditStep("business") : undefined}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Business name" value={business.name} />
            <Field label="Country" value={COUNTRY_NAMES[business.country] || business.country} />
            <Field label="Currency" value={business.currency} />
            <Field label="City" value={business.city} />
            {plan !== "chain" && (
              <Field
                label="Hours"
                value={`${formatTime(business.openingTime)} to ${formatTime(business.closingTime)}`}
              />
            )}
          </div>

          {plan !== "chain" && (
            <div className="mt-5">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.05em] text-black/38">
                Open days
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_DAYS.map(({ key, label }) => {
                  const isOpen = business.openingDays.includes(key);
                  return (
                    <span
                      key={key}
                      className={cn(
                        "rounded-full px-3 py-1 text-[12.5px] font-medium",
                        isOpen
                          ? "bg-[#2E1F4E]/10 text-[#2E1F4E]"
                          : "bg-black/[0.05] text-black/30",
                      )}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </ReviewCard>

        {/* Branches */}
        {locations && locations.locations.length > 0 && (
          <ReviewCard icon={MapPin} title={`Branches (${locations.locations.length})`}>
            <div className="space-y-2">
              {locations.locations.map((loc, idx) => (
                <div key={loc.id} className="flex items-center gap-2 text-[13.5px]">
                  <span className="font-medium text-gray-800">{loc.name || `Branch ${idx + 1}`}</span>
                  <span className="text-black/40">— {loc.city}</span>
                  {loc.isDefault && (
                    <span className="rounded-full bg-[#2E1F4E]/8 px-2 py-0.5 text-[11px] text-[#2E1F4E]">
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ReviewCard>
        )}
      </div>

      <p className="mt-6 text-center text-[12.5px] text-black/35">
        You can change any of this later from Settings
      </p>
    </div>
  );
}
