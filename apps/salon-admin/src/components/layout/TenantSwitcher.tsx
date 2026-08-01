import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@shared/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Front desk staff",
};

function TenantAvatar({ name, logoUrl, className }: { name: string; logoUrl?: string | null; className?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={name} className={cn("rounded-lg object-cover flex-shrink-0", className)} />;
  }
  return (
    <div className={cn("rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0", className)}>
      <span className="font-bold text-white leading-none">{name[0]?.toUpperCase() || "?"}</span>
    </div>
  );
}

/**
 * Header tenant switcher — only renders once the signed-in identity holds a
 * role at more than one tenant. Deliberately styled as a dropdown panel
 * (not the sidebar's native <select> branch switcher) so switching
 * *businesses* reads as a distinct, bigger action than switching branches
 * within one business.
 */
export function TenantSwitcher() {
  const { currentTenant, tenants, roles, setCurrentTenant } = useAuth();
  const [open, setOpen] = useState(false);

  if (tenants.length <= 1 || !currentTenant) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <TenantAvatar name={currentTenant?.name || "Your Salon"} logoUrl={currentTenant?.logo_url} className="w-8 h-8 text-sm" />
        <span className="font-semibold text-sm text-foreground truncate max-w-[120px] sm:max-w-[180px]">
          {currentTenant?.name || "Your Salon"}
        </span>
      </div>
    );
  }

  const roleForTenant = (tenantId: string) => roles.find((r) => r.tenant_id === tenantId)?.role;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 -ml-2.5 min-w-0 transition-colors",
            "hover:bg-muted hover:border-border",
            open && "bg-muted border-border",
          )}
        >
          <TenantAvatar name={currentTenant.name || "Your Salon"} logoUrl={currentTenant.logo_url} className="w-8 h-8 text-sm" />
          <span className="font-semibold text-sm text-foreground truncate max-w-[100px] sm:max-w-[160px]">
            {currentTenant.name || "Your Salon"}
          </span>
          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform", open && "rotate-180 text-primary")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-2">
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Your businesses
        </p>
        <div className="space-y-0.5">
          {tenants.map((tenant) => {
            const isActive = tenant.id === currentTenant.id;
            const role = roleForTenant(tenant.id);
            return (
              <button
                key={tenant.id}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) setCurrentTenant(tenant);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  isActive ? "bg-primary/8" : "hover:bg-muted",
                )}
              >
                <TenantAvatar name={tenant.name || "Salon"} logoUrl={tenant.logo_url} className="w-7.5 h-7.5 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{tenant.name || "Salon"}</p>
                  {role && (
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[role] || role}</p>
                  )}
                </div>
                {isActive && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 border-t pt-2 px-2.5 pb-1">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Switching changes which business's data you see — bookings, staff, and settings all update.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
