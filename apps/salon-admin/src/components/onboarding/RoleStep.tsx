import { cn } from "@shared/utils";
import { Crown, ShieldCheck, UserCheck, ClipboardList, Scissors, type LucideIcon } from "lucide-react";

export type UserRole = "owner" | "manager" | "supervisor" | "receptionist" | "staff";

interface RoleStepProps {
  selectedRole: UserRole | null;
  onRoleSelect: (role: UserRole) => void;
}

const ROLES: { id: UserRole; icon: LucideIcon; title: string; description: string }[] = [
  {
    id: "owner",
    icon: Crown,
    title: "Owner",
    description: "Full access to all features, billing, and settings",
  },
  {
    id: "manager",
    icon: ShieldCheck,
    title: "Manager",
    description: "Manage staff, appointments, and daily operations",
  },
  {
    id: "supervisor",
    icon: UserCheck,
    title: "Supervisor",
    description: "Oversee staff and handle customer issues",
  },
  {
    id: "receptionist",
    icon: ClipboardList,
    title: "Receptionist",
    description: "Book appointments and manage customer check-ins",
  },
  {
    id: "staff",
    icon: Scissors,
    title: "Staff",
    description: "View assigned appointments and update status",
  },
];

export function RoleStep({ selectedRole, onRoleSelect }: RoleStepProps) {
  return (
    <div className="p-7">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-[#2E1F4E]">
          <span className="inline-block h-[1.5px] w-4 bg-[#F4C84E]" />
          Your role
        </div>
        <h2 className="text-[24px] font-medium leading-snug tracking-[-0.3px] text-gray-900">
          What's your role?
        </h2>
        <p className="mt-1.5 text-[14px] text-black/45">
          Select the role that best describes your position at the salon.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {ROLES.map((role) => {
          const isSelected = selectedRole === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onRoleSelect(role.id)}
              className={cn(
                "flex w-full items-center gap-4 rounded-[22px] border px-5 py-4 text-left transition-colors",
                isSelected
                  ? "border-[#2E1F4E] bg-[#2E1F4E]/[0.04]"
                  : "border-black/[0.08] bg-white hover:bg-black/[0.02]",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]",
                  isSelected ? "bg-[#2E1F4E]/10" : "bg-black/[0.04]",
                )}
              >
                <role.icon
                  className={cn("h-[18px] w-[18px]", isSelected ? "text-[#2E1F4E]" : "text-black/40")}
                  strokeWidth={1.6}
                />
              </div>
              <div>
                <p
                  className={cn(
                    "text-[14.5px] font-medium",
                    isSelected ? "text-[#2E1F4E]" : "text-gray-800",
                  )}
                >
                  {role.title}
                </p>
                <p className="mt-0.5 text-[13px] text-black/45">{role.description}</p>
              </div>
              {isSelected && (
                <div className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2E1F4E]">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
