export type ActiveContextType = "owner_hub" | "location";

export interface RouteDefinition {
  module: string;
  path: string;
  order: number;
}

export const ROUTE_DEFINITIONS: RouteDefinition[] = [
  { module: "salons_overview", path: "/salon/overview", order: 10 },
  { module: "staff", path: "/salon/overview/staff", order: 15 },
  { module: "dashboard", path: "/salon", order: 20 },
  { module: "appointments", path: "/salon/appointments", order: 30 },
  { module: "calendar", path: "/salon/calendar", order: 40 },
  { module: "customers", path: "/salon/customers", order: 50 },
  { module: "services", path: "/salon/services", order: 60 },
  { module: "payments", path: "/salon/payments", order: 70 },
  { module: "reports", path: "/salon/reports", order: 80 },
  { module: "messaging", path: "/salon/messaging", order: 90 },
  { module: "journal", path: "/salon/journal", order: 100 },
  { module: "staff", path: "/salon/staff", order: 110 },
  { module: "settings", path: "/salon/settings", order: 120 },
  { module: "audit_log", path: "/salon/audit-log", order: 130 },
];

const HUB_ALLOWED_MODULES = new Set<string>(["salons_overview", "staff"]);

export function isModuleAllowedInContext(
  module: string,
  contextType: ActiveContextType,
  routePath?: string
): boolean {
  if (routePath === "/salon/overview/staff" && contextType !== "owner_hub") {
    return false;
  }

  if (contextType === "owner_hub") {
    if (!HUB_ALLOWED_MODULES.has(module)) return false;
    if (routePath === "/salon/staff") return false;
    return true;
  }

  // In location context, the overview route acts as hub only.
  return module !== "salons_overview";
}

export function fallbackFirstRoute(contextType: ActiveContextType): string {
  if (contextType === "owner_hub") {
    return "/salon/overview";
  }
  return "/salon";
}
