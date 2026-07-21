import { cn } from "@shared/utils";

export type UserRole = "owner" | "manager" | "supervisor" | "receptionist" | "staff";

interface RoleStepProps {
  selectedRole: UserRole | null;
  onRoleSelect: (role: UserRole) => void;
}

const ROLES = [
  {
    id: "owner" as UserRole,
    emoji: "👑",
    title: "Owner",
    description: "Full access to all features, billing, and settings",
  },
  {
    id: "manager" as UserRole,
    emoji: "🛡️",
    title: "Manager",
    description: "Manage staff, appointments, and daily operations",
  },
  {
    id: "supervisor" as UserRole,
    emoji: "✅",
    title: "Supervisor",
    description: "Oversee staff and handle customer issues",
  },
  {
    id: "receptionist" as UserRole,
    emoji: "📋",
    title: "Receptionist",
    description: "Book appointments and manage customer check-ins",
  },
  {
    id: "staff" as UserRole,
    emoji: "✂️",
    title: "Staff",
    description: "View assigned appointments and update status",
  },
];

export function RoleStep({ selectedRole, onRoleSelect }: RoleStepProps) {
  return (
    <div className="p-7">
      <div className="mb-6">
        <h2 className="font-serif text-[22px] font-medium leading-snug tracking-[-0.2px] text-gray-900">
          What's your role?
        </h2>
        <p className="mt-1 text-[14px] text-black/45">
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
                "flex w-full items-center gap-4 rounded-[14px] border px-4 py-3.5 text-left transition-colors",
                isSelected
                  ? "border-[#2E1F4E] bg-[#2E1F4E]/[0.04]"
                  : "border-black/[0.08] bg-white hover:bg-black/[0.02]",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[20px]",
                  isSelected ? "bg-[#2E1F4E]/10" : "bg-black/[0.04]",
                )}
              >
                {role.emoji}
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
