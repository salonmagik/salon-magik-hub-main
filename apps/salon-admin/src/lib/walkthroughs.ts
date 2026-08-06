import type { ElementType } from "react";
import {
  LayoutGrid,
  Scissors,
  CalendarDays,
  Users,
  UserPlus,
  ArrowLeftRight,
  MessageSquare,
  Clock,
  Building2,
} from "lucide-react";
import type { ProductTourStepInput } from "@/components/onboarding/ProductTourProvider";

export type WalkthroughDataRequirement = "customers" | "catalog";

// Which page component's mount-effect is responsible for auto-triggering a
// walkthrough on first visit. Distinct from `section`, which is just the
// grouping label shown on the Help page — several Business Hub pageKeys
// share one "Business Hub" section there.
export type WalkthroughPageKey =
  | "dashboard"
  | "services"
  | "team"
  | "appointments"
  | "customers"
  | "transactions"
  | "messaging"
  | "my-shift"
  | "hub-overview"
  | "hub-settings"
  | "hub-subscription"
  | "hub-theme";

export interface WalkthroughDef {
  id: string;
  pageKey: WalkthroughPageKey;
  section: string;
  sectionIcon: ElementType;
  label: string;
  description: string;
  /** hasPermission(module) gate — omit for walkthroughs available to anyone who can reach the page. */
  permission?: string;
  /** Business Hub items: gated on canUseOwnerHub rather than a single permission module. */
  requiresOwnerHub?: boolean;
  /** My Shift item: gated on the Staff Operations addon being enabled for this tenant. */
  requiresStaffOperations?: boolean;
  /** Data-existence gate — hidden until the tenant has at least one of these. */
  requires?: WalkthroughDataRequirement;
  buildStep: (opts: { isDesktop: boolean }) => ProductTourStepInput;
}

export const WALKTHROUGHS: WalkthroughDef[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────
  {
    id: "dashboard.quick-create",
    pageKey: "dashboard",
    section: "Dashboard",
    sectionIcon: LayoutGrid,
    label: "Quick Create",
    description: "Add a booking, customer, or sale from anywhere",
    permission: "dashboard",
    buildStep: ({ isDesktop }) => ({
      id: "dashboard.quick-create",
      path: "/salon",
      target: isDesktop ? '[data-tour-id="tour-quick-create"]' : '[data-tour-id="tour-quick-create-mobile"]',
      title: "Quick Create",
      content: "Jump straight into booking an appointment, adding a customer, or recording a sale — from any page.",
    }),
  },
  {
    id: "dashboard.notifications",
    pageKey: "dashboard",
    section: "Dashboard",
    sectionIcon: LayoutGrid,
    label: "Notifications",
    description: "Where alerts and reminders show up",
    permission: "dashboard",
    buildStep: () => ({
      id: "dashboard.notifications",
      path: "/salon",
      target: '[data-tour-id="tour-notifications"]',
      title: "Notifications",
      content: "New bookings, refund requests, and low-credit warnings all show up here.",
    }),
  },

  // ── Services & Products ────────────────────────────────────────────────
  {
    id: "services.create-service",
    pageKey: "services",
    section: "Services & Products",
    sectionIcon: Scissors,
    label: "Create your first service",
    description: "Set a price, duration, and staff assignment",
    permission: "services",
    buildStep: ({ isDesktop }) => ({
      id: "services.create-service",
      path: "/salon/services?tab=services",
      target: isDesktop ? '[data-tour-id="tour-add-service"]' : '[data-tour-id="tour-add-catalog-mobile"]',
      title: "Add your services",
      content: isDesktop
        ? "This is where you build your service menu — set prices, durations, and staff assignments so bookings know what to schedule."
        : "Tap here, then choose \"Add service\" to build your service menu.",
    }),
  },
  {
    id: "services.create-product",
    pageKey: "services",
    section: "Services & Products",
    sectionIcon: Scissors,
    label: "Create your first product",
    description: "Sell retail items alongside your services",
    permission: "services",
    buildStep: ({ isDesktop }) => ({
      id: "services.create-product",
      path: "/salon/services?tab=products",
      target: isDesktop ? '[data-tour-id="tour-add-product"]' : '[data-tour-id="tour-add-catalog-mobile"]',
      title: "Add your products",
      content: isDesktop
        ? "Sell retail items alongside your services — set a price and stock level."
        : "Tap here, then choose \"Add product\" to sell retail items alongside your services.",
    }),
  },
  {
    id: "services.create-voucher",
    pageKey: "services",
    section: "Services & Products",
    sectionIcon: Scissors,
    label: "Create your first voucher",
    description: "Gift vouchers customers can redeem",
    permission: "services",
    buildStep: ({ isDesktop }) => ({
      id: "services.create-voucher",
      path: "/salon/services?tab=vouchers",
      target: isDesktop ? '[data-tour-id="tour-add-voucher"]' : '[data-tour-id="tour-add-catalog-mobile"]',
      title: "Create a voucher",
      content: isDesktop
        ? "Gift vouchers your customers can buy or redeem — set a value and expiry."
        : "Tap here, then choose \"Create voucher\" to set up a gift voucher.",
    }),
  },
  {
    id: "services.create-package",
    pageKey: "services",
    section: "Services & Products",
    sectionIcon: Scissors,
    label: "Create your first package",
    description: "Bundle services and products at a discount",
    permission: "services",
    requires: "catalog",
    buildStep: ({ isDesktop }) => ({
      id: "services.create-package",
      path: "/salon/services?tab=packages",
      target: isDesktop ? '[data-tour-id="tour-add-package"]' : '[data-tour-id="tour-add-catalog-mobile"]',
      title: "Bundle a package",
      content: isDesktop
        ? "Bundle services and products together at a discounted price."
        : "Tap here, then choose \"Create package\" to bundle services and products together.",
    }),
  },

  // ── Team ────────────────────────────────────────────────────────────────
  {
    id: "team.invite",
    pageKey: "team",
    section: "Team",
    sectionIcon: UserPlus,
    label: "Invite your team",
    description: "Add staff and control what they can see and do",
    permission: "staff",
    buildStep: ({ isDesktop }) => ({
      id: "team.invite",
      path: "/salon/staff",
      target: isDesktop ? '[data-tour-id="tour-invite-staff"]' : '[data-tour-id="tour-invite-staff-mobile"]',
      title: "Invite your team",
      content: "Add staff members here and control what they can see and do with role-based permissions.",
    }),
  },
  {
    id: "team.tabs",
    pageKey: "team",
    section: "Team",
    sectionIcon: UserPlus,
    label: "Finding your way around",
    description: "Team members, invitations, permissions, and time off",
    permission: "staff",
    buildStep: () => ({
      id: "team.tabs",
      path: "/salon/staff",
      target: '[data-tour-id="tour-staff-tabs"]',
      title: "Finding your way around",
      content: "Team members, pending invitations, permissions, and time off each have their own tab here.",
    }),
  },

  // ── Appointments ────────────────────────────────────────────────────────
  {
    id: "appointments.book",
    pageKey: "appointments",
    section: "Appointments",
    sectionIcon: CalendarDays,
    label: "Book an appointment",
    description: "Schedule a customer into an open slot",
    permission: "appointments",
    buildStep: ({ isDesktop }) => ({
      id: "appointments.book",
      path: "/salon/appointments",
      target: isDesktop ? '[data-tour-id="tour-book-appointment"]' : '[data-tour-id="tour-book-or-walkin-mobile"]',
      title: "Book an appointment",
      content: isDesktop
        ? "Schedule a customer into an open slot on your calendar."
        : "Tap here, then choose \"Book appointment\" to schedule a customer.",
    }),
  },
  {
    id: "appointments.walkin",
    pageKey: "appointments",
    section: "Appointments",
    sectionIcon: CalendarDays,
    label: "Record a walk-in",
    description: "Log a customer who arrived without booking ahead",
    permission: "appointments",
    buildStep: ({ isDesktop }) => ({
      id: "appointments.walkin",
      path: "/salon/appointments",
      target: isDesktop ? '[data-tour-id="tour-record-walkin"]' : '[data-tour-id="tour-book-or-walkin-mobile"]',
      title: "Record a walk-in",
      content: isDesktop
        ? "Log a customer who showed up without booking ahead of time."
        : "Tap here, then choose \"Record walk-in\" to log a customer who showed up unannounced.",
    }),
  },
  {
    id: "appointments.calendar-view",
    pageKey: "appointments",
    section: "Appointments",
    sectionIcon: CalendarDays,
    label: "Calendar view",
    description: "Navigating by day, week, and staff column",
    permission: "appointments",
    buildStep: () => ({
      id: "appointments.calendar-view",
      path: "/salon/appointments",
      target: '[data-tour-id="tour-calendar-view"]',
      title: "Calendar view",
      content: "See your schedule laid out by day, week, and staff member.",
    }),
  },
  {
    id: "appointments.list-view",
    pageKey: "appointments",
    section: "Appointments",
    sectionIcon: CalendarDays,
    label: "List view",
    description: "Scanning appointments as a sortable list",
    permission: "appointments",
    buildStep: () => ({
      id: "appointments.list-view",
      path: "/salon/appointments",
      target: '[data-tour-id="tour-list-view"]',
      title: "List view",
      content: "Prefer scanning a list? Switch here to see appointments as a sortable table instead.",
    }),
  },

  // ── Customers ───────────────────────────────────────────────────────────
  {
    id: "customers.add",
    pageKey: "customers",
    section: "Customers",
    sectionIcon: Users,
    label: "Add a customer",
    description: "Save contact details and preferences",
    permission: "customers",
    buildStep: ({ isDesktop }) => ({
      id: "customers.add",
      path: "/salon/customers",
      target: isDesktop ? '[data-tour-id="tour-add-customer"]' : '[data-tour-id="tour-add-customer-mobile"]',
      title: "Add a customer",
      content: isDesktop
        ? "Save a customer's contact details and preferences."
        : "Tap here, then choose \"Add New Customer\" to save their details.",
    }),
  },
  {
    id: "customers.view-details",
    pageKey: "customers",
    section: "Customers",
    sectionIcon: Users,
    label: "View customer details",
    description: "See visit history, preferences, and balance",
    permission: "customers",
    requires: "customers",
    buildStep: () => ({
      id: "customers.view-details",
      path: "/salon/customers",
      target: '[data-tour-id="tour-view-customer"]',
      title: "View customer details",
      content: "Tap a customer to see their visit history, preferences, and balance.",
    }),
  },

  // ── Transactions ────────────────────────────────────────────────────────
  {
    id: "transactions.tabs",
    pageKey: "transactions",
    section: "Transactions",
    sectionIcon: ArrowLeftRight,
    label: "Finding your way around",
    description: "Where inflow, refunds, and cash payments each live",
    permission: "payments",
    buildStep: () => ({
      id: "transactions.tabs",
      path: "/salon/transactions",
      target: '[data-tour-id="tour-transactions-tabs"]',
      title: "Finding your way around",
      content: "Inflow, refunds, cash payments, and store credit each have their own tab here.",
    }),
  },

  // ── Messaging ───────────────────────────────────────────────────────────
  {
    id: "messaging.single",
    pageKey: "messaging",
    section: "Messaging",
    sectionIcon: MessageSquare,
    label: "Message one customer",
    description: "Send a single SMS or email to one person",
    permission: "messaging",
    requires: "customers",
    buildStep: () => ({
      id: "messaging.single",
      path: "/salon/messaging",
      target: '[data-tour-id="tour-message-single"]',
      title: "Message one customer",
      content: "Choose \"One specific customer\" to send a single SMS or email.",
    }),
  },
  {
    id: "messaging.group",
    pageKey: "messaging",
    section: "Messaging",
    sectionIcon: MessageSquare,
    label: "Message multiple customers",
    description: "Pick several people, or send to everyone at once",
    permission: "messaging",
    requires: "customers",
    buildStep: () => ({
      id: "messaging.group",
      path: "/salon/messaging",
      target: '[data-tour-id="tour-message-group"]',
      title: "Message multiple customers",
      content: "Choose \"A group of customers\" to pick several people, or send to everyone at once.",
    }),
  },
  {
    id: "messaging.segment",
    pageKey: "messaging",
    section: "Messaging",
    sectionIcon: MessageSquare,
    label: "Message a customer segment",
    description: "Target a bucket like VIPs, regulars, or lapsed customers",
    permission: "messaging",
    requires: "customers",
    buildStep: () => ({
      id: "messaging.segment",
      path: "/salon/messaging",
      target: '[data-tour-id="tour-message-group"]',
      title: "Message a segment",
      content: "Choose \"A group of customers\", then pick a segment like VIPs, regulars, or lapsed customers from the list that appears.",
    }),
  },

  // ── My Shift ────────────────────────────────────────────────────────────
  {
    id: "my-shift.clock-in",
    pageKey: "my-shift",
    section: "My Shift",
    sectionIcon: Clock,
    label: "Clock in & out",
    description: "Starting and ending your tracked shift",
    requiresStaffOperations: true,
    buildStep: () => ({
      id: "my-shift.clock-in",
      path: "/salon/my-shift",
      target: '[data-tour-id="tour-clock-in"]',
      title: "Clock in & out",
      content: "Start and end your tracked shift here.",
    }),
  },

  // ── Business Hub ────────────────────────────────────────────────────────
  {
    id: "hub.branches",
    pageKey: "hub-overview",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Manage branches",
    description: "Add, pause, or switch between your locations",
    requiresOwnerHub: true,
    buildStep: ({ isDesktop }) => ({
      id: "hub.branches",
      path: "/salon/overview",
      target: isDesktop ? '[data-tour-id="tour-manage-branches"]' : '[data-tour-id="tour-manage-branches-mobile"]',
      title: "Manage branches",
      content: "Add a new location, or pause one that's temporarily closed.",
    }),
  },
  {
    id: "hub.overview",
    pageKey: "hub-overview",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Cross-location overview",
    description: "Read consolidated revenue and performance across branches",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.overview",
      path: "/salon/overview",
      target: '[data-tour-id="tour-hub-overview"]',
      title: "Cross-location overview",
      content: "See revenue, bookings, and performance consolidated across every branch.",
    }),
  },
  {
    id: "hub.booking-settings",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Booking settings",
    description: "Hub-wide defaults for online booking",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-settings",
      path: "/salon/settings?tab=booking",
      target: '[data-tour-id="tour-enable-booking"]',
      title: "Booking settings",
      content: "Turn on online booking, and set the defaults that apply across your locations.",
    }),
  },
  {
    id: "hub.subscription",
    pageKey: "hub-subscription",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Subscription",
    description: "Plan, billing, and seats across locations",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.subscription",
      path: "/salon/subscription",
      target: '[data-tour-id="tour-change-plan"]',
      title: "Subscription",
      content: "Review your plan and change it as your business grows.",
    }),
  },
  {
    id: "hub.theme",
    pageKey: "hub-theme",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Theme",
    description: "Customize your booking page's look and branding",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.theme",
      path: "/salon/themes-settings",
      target: '[data-tour-id="tour-apply-theme"]',
      title: "Theme",
      content: "Customize the look of your public booking page to match your brand.",
    }),
  },
];

export interface WalkthroughAvailabilityCtx {
  hasPermission: (module: string) => boolean;
  canUseOwnerHub: boolean;
  hasCustomers: boolean;
  hasCatalog: boolean;
  staffOperationsEnabled: boolean;
}

export function isWalkthroughAvailable(walkthrough: WalkthroughDef, ctx: WalkthroughAvailabilityCtx): boolean {
  if (walkthrough.requiresOwnerHub && !ctx.canUseOwnerHub) return false;
  if (walkthrough.requiresStaffOperations && !ctx.staffOperationsEnabled) return false;
  if (walkthrough.permission && !ctx.hasPermission(walkthrough.permission)) return false;
  if (walkthrough.requires === "customers" && !ctx.hasCustomers) return false;
  if (walkthrough.requires === "catalog" && !ctx.hasCatalog) return false;
  return true;
}

export function getAvailableWalkthroughsForPage(
  pageKey: WalkthroughPageKey,
  ctx: WalkthroughAvailabilityCtx,
): WalkthroughDef[] {
  return WALKTHROUGHS.filter((w) => w.pageKey === pageKey && isWalkthroughAvailable(w, ctx));
}

export function getAvailableWalkthroughsBySection(
  ctx: WalkthroughAvailabilityCtx,
): Array<{ section: string; sectionIcon: ElementType; items: WalkthroughDef[] }> {
  const bySection = new Map<string, { sectionIcon: ElementType; items: WalkthroughDef[] }>();
  for (const w of WALKTHROUGHS) {
    if (!isWalkthroughAvailable(w, ctx)) continue;
    const existing = bySection.get(w.section);
    if (existing) {
      existing.items.push(w);
    } else {
      bySection.set(w.section, { sectionIcon: w.sectionIcon, items: [w] });
    }
  }
  return Array.from(bySection.entries()).map(([section, { sectionIcon, items }]) => ({
    section,
    sectionIcon,
    items,
  }));
}
