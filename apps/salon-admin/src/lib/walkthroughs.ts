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
  BarChart3,
  Mail,
  FileText,
  Bell,
  CreditCard,
  Globe,
  List,
  Calendar,
  Check,
} from "lucide-react";
import type { ProductTourStepInput } from "@/components/onboarding/ProductTourProvider";

// ─── Setup checklist metadata ───────────────────────────────────────────────
// Lives here (not in SalonDashboard.tsx) so both SalonDashboard.tsx and
// HelpPage.tsx can import it without a circular dependency — both already
// call useDashboardStats() for their own rendering, so building checklist
// walkthrough steps from it costs nothing extra.
export const CHECKLIST_META: Record<
  string,
  { icon: ElementType; iconBg: string; iconColor: string; description: string; actionLabel: string; warningTag?: string }
> = {
  payments: {
    icon: CreditCard,
    iconBg: "bg-destructive-bg",
    iconColor: "text-destructive",
    description: "Online deposits can't be settled to you until this is added.",
    actionLabel: "Set up",
    warningTag: "Blocks deposits",
  },
  booking: {
    icon: Globe,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "Let clients book themselves through your link.",
    actionLabel: "Enable",
  },
  products: {
    icon: List,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "Sell retail items alongside your services.",
    actionLabel: "Add",
  },
  appointment: {
    icon: Calendar,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "See how your calendar comes together.",
    actionLabel: "Book",
  },
  services: {
    icon: Check,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "",
    actionLabel: "Add",
  },
  customer: {
    icon: Check,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "",
    actionLabel: "Add",
  },
};

export interface WalkthroughExtraEntry {
  id: string;
  buildStep: (opts: { isDesktop: boolean }) => ProductTourStepInput;
}

// One step per still-incomplete checklist row — dynamic because which rows
// exist depends on this tenant's live setup state, unlike every other
// walkthrough in the registry.
export function buildChecklistWalkthroughs(
  checklistItems: Array<{ id: string; label: string; completed: boolean }>,
): WalkthroughExtraEntry[] {
  return checklistItems
    .filter((item) => !item.completed && CHECKLIST_META[item.id])
    .map((item) => ({
      id: `dashboard.checklist.${item.id}`,
      buildStep: () => ({
        id: `dashboard.checklist.${item.id}`,
        path: "/salon",
        target: `[data-tour-id="tour-checklist-${item.id}"]`,
        title: item.label,
        content: CHECKLIST_META[item.id].description || `Finish setting up: ${item.label}.`,
        // Same-page, conditionally-rendered target — skip past it quickly
        // rather than stalling for the default 6s if it's not there.
        waitTimeoutMs: 1500,
      }),
    }));
}

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
  | "hub-theme"
  | "branch-settings"
  | "reports"
  | "audit-log"
  | "all-notifications";

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
  // The setup checklist itself is NOT here — its rows are dynamic (which
  // ones exist depends on what's still incomplete for this tenant), so it's
  // built at runtime from live useDashboardStats() data. See
  // buildChecklistWalkthroughs() below, used by SalonDashboard.tsx and
  // HelpPage.tsx (both already call useDashboardStats for their own
  // rendering, so this adds no new cost).
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
    label: "Add a branch",
    description: "Open a new location from the overview page",
    requiresOwnerHub: true,
    buildStep: ({ isDesktop }) => ({
      id: "hub.branches",
      path: "/salon/overview",
      target: isDesktop ? '[data-tour-id="tour-manage-branches"]' : '[data-tour-id="tour-manage-branches-mobile"]',
      title: "Add a branch",
      content: "Add a new location from here.",
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
    id: "hub.quick-actions",
    pageKey: "hub-overview",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Quick actions",
    description: "New booking, pending approvals, unpaid balances, and messages",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.quick-actions",
      path: "/salon/overview",
      target: '[data-tour-id="tour-hub-quick-actions"]',
      title: "Quick actions",
      content: "Jump straight to new bookings, pending approvals, unpaid balances, or messaging — for any branch.",
      waitTimeoutMs: 1500,
    }),
  },
  {
    id: "hub.branch-performance",
    pageKey: "hub-overview",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Branch performance table",
    description: "Compare inflow, bookings, and staff across every location",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.branch-performance",
      path: "/salon/overview",
      target: '[data-tour-id="tour-branch-performance"]',
      title: "Branch performance",
      content: "Compare inflow, bookings, staff online, and outstanding balances across every branch.",
    }),
  },
  {
    id: "hub.booking-enable",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Enable online booking",
    description: "Let customers book through your public booking page",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-enable",
      path: "/salon/business-settings?tab=booking",
      target: '[data-tour-id="tour-enable-booking"]',
      title: "Enable online booking",
      content: "Turn this on to let customers book through your public booking page.",
    }),
  },
  {
    id: "hub.booking-auto-confirm",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Auto-confirm bookings",
    description: "Skip manual approval, or require it before a customer pays",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-auto-confirm",
      path: "/salon/business-settings?tab=booking",
      target: '[data-tour-id="tour-auto-confirm-bookings"]',
      title: "Auto-confirm bookings",
      content: "When off, customers submit requests first and only pay after your approval.",
    }),
  },
  {
    id: "hub.booking-deposits",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Accept online deposits",
    description: "Company-level payment rule for public booking checkout",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-deposits",
      path: "/salon/business-settings?tab=booking",
      target: '[data-tour-id="tour-accept-deposits"]',
      title: "Accept online deposits",
      content: "A company-level payment rule applied across your entire public booking checkout.",
    }),
  },
  {
    id: "hub.booking-allow-staff",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Allow staff selection",
    description: "Let customers choose a preferred staff member",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-allow-staff",
      path: "/salon/business-settings?tab=booking",
      target: '[data-tour-id="tour-allow-staff-selection"]',
      title: "Allow staff selection",
      content: "Let customers choose a preferred staff member during booking.",
    }),
  },
  {
    id: "hub.booking-require-staff",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Require staff selection",
    description: "Force a staff pick before checkout",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-require-staff",
      path: "/salon/business-settings?tab=booking",
      target: '[data-tour-id="tour-require-staff-selection"]',
      title: "Require staff selection",
      content: "Force customers to select a staff member before checkout.",
    }),
  },
  {
    id: "hub.booking-auto-assign",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Auto-assign staff",
    description: "Automatically fill in a staff member if left unselected",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.booking-auto-assign",
      path: "/salon/business-settings?tab=booking",
      target: '[data-tour-id="tour-auto-assign-staff"]',
      title: "Auto-assign staff",
      content: "Automatically assign an eligible staff member when the customer leaves staff unselected.",
    }),
  },
  {
    id: "hub.business-profile",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Business profile",
    description: "Name, logo, address, and default currency",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.business-profile",
      path: "/salon/business-settings?tab=profile",
      target: '[data-tour-id="tour-settings-profile"]',
      title: "Business profile",
      content: "Your business name, logo, address, and default currency live here.",
    }),
  },
  {
    id: "hub.manage-branches-tab",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Pause & configure branches",
    description: "Pause bookings for a branch during breaks or closures",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.manage-branches-tab",
      path: "/salon/business-settings?tab=branches",
      target: '[data-tour-id="tour-manage-branches-tab"]',
      title: "Pause & configure branches",
      content: "Pause bookings for a branch during breaks, closures, or downtime.",
    }),
  },
  {
    id: "hub.payout-destinations",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Payout destinations",
    description: "Where your online payments get settled",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.payout-destinations",
      path: "/salon/business-settings?tab=payout-destinations",
      target: '[data-tour-id="tour-payout-destinations"]',
      title: "Payout destinations",
      content: "Set up where your online payments get settled to.",
    }),
  },
  {
    id: "hub.custom-domain",
    pageKey: "hub-settings",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Custom domain",
    description: "Connect your own domain to your booking page",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.custom-domain",
      path: "/salon/business-settings?tab=custom-domain",
      target: '[data-tour-id="tour-custom-domain"]',
      title: "Custom domain",
      content: "Connect your own domain to your public booking page.",
    }),
  },
  {
    id: "hub.subscription-plan",
    pageKey: "hub-subscription",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Your plan",
    description: "Current plan, status, and how to change it",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.subscription-plan",
      path: "/salon/subscription",
      target: '[data-tour-id="tour-change-plan"]',
      title: "Your plan",
      content: "Review your current plan and status here, and change plans as your business grows.",
    }),
  },
  {
    id: "hub.subscription-usage",
    pageKey: "hub-subscription",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Usage",
    description: "Locations, seats, and storefront theme used",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.subscription-usage",
      path: "/salon/subscription",
      target: '[data-tour-id="tour-subscription-usage"]',
      title: "Usage",
      content: "See how many locations and staff seats you're using against your plan's limits.",
    }),
  },
  {
    id: "hub.subscription-seats",
    pageKey: "hub-subscription",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Branches & team seats",
    description: "Adjust how many locations and seats you need",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.subscription-seats",
      path: "/salon/subscription",
      target: '[data-tour-id="tour-subscription-seats"]',
      title: "Branches & team seats",
      content: "Tell us how many branches and team seats you need — we'll put you on the right plan automatically.",
    }),
  },
  {
    id: "hub.subscription-addons",
    pageKey: "hub-subscription",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Add-ons",
    description: "Staff Operations and other optional extras",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.subscription-addons",
      path: "/salon/subscription",
      target: '[data-tour-id="tour-subscription-addons"]',
      title: "Add-ons",
      content: "Optional extras like Staff Operations (check-ins, time-off, leave allowances) live here.",
    }),
  },
  {
    id: "hub.theme-default",
    pageKey: "hub-theme",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "Default theme",
    description: "Your free, always-available booking page look",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.theme-default",
      path: "/salon/themes-settings",
      target: '[data-tour-id="tour-theme-default"]',
      title: "Default theme",
      content: "Your free storefront theme — always available, no purchase needed.",
    }),
  },
  {
    id: "hub.theme-ecommerce",
    pageKey: "hub-theme",
    section: "Business Hub",
    sectionIcon: Building2,
    label: "E-commerce theme",
    description: "A paid theme built for selling products online",
    requiresOwnerHub: true,
    buildStep: () => ({
      id: "hub.theme-ecommerce",
      path: "/salon/themes-settings",
      target: '[data-tour-id="tour-theme-ecommerce"]',
      title: "E-commerce theme",
      content: "A paid storefront theme built for selling products, with its own hero and styling.",
    }),
  },

  // ── Branch Settings ─────────────────────────────────────────────────────
  {
    id: "branch.profile",
    pageKey: "branch-settings",
    section: "Branch Settings",
    sectionIcon: Building2,
    label: "Branch profile",
    description: "This location's name, contact, and address",
    permission: "settings",
    buildStep: () => ({
      id: "branch.profile",
      path: "/salon/branch-settings?tab=profile",
      target: '[data-tour-id="tour-settings-profile"]',
      title: "Branch profile",
      content: "This branch's name, contact details, and address live here.",
    }),
  },
  {
    id: "branch.hours",
    pageKey: "branch-settings",
    section: "Branch Settings",
    sectionIcon: Building2,
    label: "Branch hours",
    description: "Operating days and hours for this location",
    permission: "settings",
    buildStep: () => ({
      id: "branch.hours",
      path: "/salon/branch-settings?tab=hours",
      target: '[data-tour-id="tour-settings-hours"]',
      title: "Branch hours",
      content: "Set this branch's open days and operating hours — used for online booking availability.",
    }),
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  {
    id: "reports.filters",
    pageKey: "reports",
    section: "Reports",
    sectionIcon: BarChart3,
    label: "Date range & export",
    description: "Change the period, or export the data",
    permission: "reports",
    buildStep: () => ({
      id: "reports.filters",
      path: "/salon/reports",
      target: '[data-tour-id="tour-reports-filters"]',
      title: "Date range & export",
      content: "Pick a date range to report on, and export the underlying data as CSV or Excel.",
    }),
  },
  {
    id: "reports.stats",
    pageKey: "reports",
    section: "Reports",
    sectionIcon: BarChart3,
    label: "Key stats",
    description: "Inflow, completed, cancelled, new and returning clients",
    permission: "reports",
    buildStep: () => ({
      id: "reports.stats",
      path: "/salon/reports",
      target: '[data-tour-id="tour-reports-stats"]',
      title: "Key stats",
      content: "Inflow, completed and cancelled appointments, new vs. returning clients, and average transaction value.",
    }),
  },
  {
    id: "reports.chart",
    pageKey: "reports",
    section: "Reports",
    sectionIcon: BarChart3,
    label: "Inflow over time",
    description: "This period compared to the last",
    permission: "reports",
    buildStep: () => ({
      id: "reports.chart",
      path: "/salon/reports",
      target: '[data-tour-id="tour-reports-chart"]',
      title: "Inflow over time",
      content: "Compares this period's daily inflow against the previous period.",
    }),
  },
  {
    id: "reports.breakdowns",
    pageKey: "reports",
    section: "Reports",
    sectionIcon: BarChart3,
    label: "Top services & payment methods",
    description: "What's selling, and how clients pay",
    permission: "reports",
    buildStep: () => ({
      id: "reports.breakdowns",
      path: "/salon/reports",
      target: '[data-tour-id="tour-reports-breakdowns"]',
      title: "Top services & payment methods",
      content: "See your most-booked services and a breakdown of how clients pay.",
    }),
  },
  {
    id: "reports.staff",
    pageKey: "reports",
    section: "Reports",
    sectionIcon: BarChart3,
    label: "Staff performance",
    description: "Ranked by revenue generated this period",
    permission: "reports",
    buildStep: () => ({
      id: "reports.staff",
      path: "/salon/reports",
      target: '[data-tour-id="tour-reports-staff"]',
      title: "Staff performance",
      content: "Your team ranked by revenue generated in this period.",
    }),
  },
  {
    id: "reports.segments",
    pageKey: "reports",
    section: "Reports",
    sectionIcon: BarChart3,
    label: "Customer segments",
    description: "Who your customers are, and what they're worth",
    permission: "reports",
    requires: "customers",
    buildStep: () => ({
      id: "reports.segments",
      path: "/salon/reports",
      target: '[data-tour-id="tour-reports-segments"]',
      title: "Customer segments",
      content: "See who your customers are — VIPs, big spenders, regulars — and what each group is worth.",
    }),
  },

  // ── Audit Log ────────────────────────────────────────────────────────────
  {
    id: "audit-log.filters",
    pageKey: "audit-log",
    section: "Audit Log",
    sectionIcon: FileText,
    label: "Filtering activity",
    description: "Search by staff, action type, date, or branch",
    permission: "audit_log",
    buildStep: () => ({
      id: "audit-log.filters",
      path: "/salon/audit-log",
      target: '[data-tour-id="tour-audit-log-filters"]',
      title: "Filtering activity",
      content: "Narrow the log by staff name, action type, date range, or branch.",
    }),
  },
  {
    id: "audit-log.table",
    pageKey: "audit-log",
    section: "Audit Log",
    sectionIcon: FileText,
    label: "Activity history",
    description: "Business-friendly action labels for everything that happened",
    permission: "audit_log",
    buildStep: () => ({
      id: "audit-log.table",
      path: "/salon/audit-log",
      target: '[data-tour-id="tour-audit-log-table"]',
      title: "Activity history",
      content: "Every recorded action, in plain language — what happened, where, who did it, and when.",
    }),
  },

  // ── All Notifications ───────────────────────────────────────────────────
  {
    id: "all-notifications.filters",
    pageKey: "all-notifications",
    section: "All Notifications",
    sectionIcon: Bell,
    label: "Filtering notifications",
    description: "All, unread, or urgent — across every branch",
    buildStep: () => ({
      id: "all-notifications.filters",
      path: "/salon/all-notifications",
      target: '[data-tour-id="tour-notifications-filters"]',
      title: "Filtering notifications",
      content: "Switch between all, unread, or urgent notifications from any branch.",
    }),
  },
  {
    id: "all-notifications.list",
    pageKey: "all-notifications",
    section: "All Notifications",
    sectionIcon: Bell,
    label: "Notification list",
    description: "Tap one to jump straight to what it's about",
    buildStep: () => ({
      id: "all-notifications.list",
      path: "/salon/all-notifications",
      target: '[data-tour-id="tour-notifications-list"]',
      title: "Notification list",
      content: "Tap a notification to jump straight to the related booking, payment, or customer.",
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

// Lets a trigger page skip the customer/catalog existence queries entirely
// when none of its own walkthroughs are data-gated (most aren't).
export function pageNeedsDataFlags(pageKey: WalkthroughPageKey): boolean {
  return WALKTHROUGHS.some((w) => w.pageKey === pageKey && w.requires != null);
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
