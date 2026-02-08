import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Users, Crown, Shield, UserCheck, User } from "lucide-react";
import { cn } from "@shared/utils";

export type UserRole = "owner" | "manager" | "supervisor" | "receptionist" | "staff";

interface RoleStepProps {
  selectedRole: UserRole | null;
  onRoleSelect: (role: UserRole) => void;
}

const ROLES = [
  {
    id: "owner" as UserRole,
    title: "Owner",
    description: "Full access to all features, billing, and settings",
    icon: Crown,
  },
  {
    id: "manager" as UserRole,
    title: "Manager",
    description: "Manage staff, appointments, and daily operations",
    icon: Shield,
  },
  {
    id: "supervisor" as UserRole,
    title: "Supervisor",
    description: "Oversee staff and handle customer issues",
    icon: UserCheck,
  },
  {
    id: "receptionist" as UserRole,
    title: "Receptionist",
    description: "Book appointments and manage customer check-ins",
    icon: Users,
  },
  {
    id: "staff" as UserRole,
    title: "Staff",
    description: "View assigned appointments and update status",
    icon: User,
  },
];

export function RoleStep({ selectedRole, onRoleSelect }: RoleStepProps) {
  return (
    <>
      <CardHeader>
        <CardTitle>What's your role?</CardTitle>
        <CardDescription>
          Select the role that best describes your position at the salon.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ROLES.map((role) => {
          const Icon = role.icon;
          const isSelected = selectedRole === role.id;
          
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onRoleSelect(role.id)}
              className={cn(
                "w-full flex items-start gap-4 p-4 rounded-lg border text-left transition-colors",
                isSelected
                  ? "bg-primary/5 border-primary"
                  : "bg-background border-input hover:bg-muted"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                isSelected ? "bg-primary/10" : "bg-muted"
              )}>
                <Icon className={cn(
                  "w-5 h-5",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className={cn(
                  "font-medium",
                  isSelected && "text-primary"
                )}>
                  {role.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {role.description}
                </p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </>
  );
}
