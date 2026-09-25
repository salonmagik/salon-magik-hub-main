import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { format, subDays } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SalonSidebar, MobileQuickActionEffect, type MobileQuickAction } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { useAuth } from "@/hooks/useAuth";
import { useCustomers } from "@/hooks/useCustomers";
import { useCustomerSegments } from "@/hooks/useCustomerSegments";
import { useEmailTemplates, templateTypeLabels, type TemplateType } from "@/hooks/useEmailTemplates";
import { useSMSTemplates, smsTemplateTypeLabels, type SMSTemplateType } from "@/hooks/useSMSTemplates";
import { useMessagingCredits } from "@/hooks/useMessagingCredits";
import { supabase } from "@/lib/supabase";
import { EditTemplateDialog } from "@/components/dialogs/EditTemplateDialog";
import { EditSMSTemplateDialog } from "@/components/messaging/EditSMSTemplateDialog";
import { CreditPurchaseDialog } from "@/components/billing/CreditPurchaseDialog";
import { PaymentSuccessModal } from "@/components/PaymentSuccessModal";
import { Button } from "@ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@ui/command";
import { Progress } from "@ui/progress";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import {
  AlertCircle,
  Bold,
  Check,
  Info,
  Italic,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
import { MarketingStep } from "@/components/marketing/MarketingStep";
import "@/components/marketing/marketing.css";
import { wrapSelection } from "@/components/messaging/templateEditorUtils";

type MarketingTab = "send-broadcast" | "templates" | "delivery-history";
type AudienceMode = "single" | "group" | null;
type BroadcastChannel = "sms" | "email";
type AudiencePreset =
  | "all_customers"
  | "vip_customers"
  | "big_spenders"
  | "regulars"
  | "loves_packages"
  | "lapsed_customers"
  | "no_appointment_30"
  | "no_appointment_60"
  | "new_customers"
  | "upcoming_appointments"
  | "cancelled_appointments";
type HistoryChannelFilter = "all" | "email" | "sms" | "whatsapp";
type HistoryStatusFilter = "all" | "delivered" | "sent" | "pending" | "failed";

type CustomerListItem = ReturnType<typeof useCustomers>["customers"][number];

type AudienceAppointmentRow = {
  customer_id: string | null;
  status: string | null;
  scheduled_start: string | null;
};

type AudienceDefinition = {
  id: AudiencePreset;
  label: string;
  helper: string;
  customerIds: string[];
};

type BroadcastReusableTemplate = {
  id: string;
  name: string;
  channel: BroadcastChannel;
  subject: string | null;
  body: string;
  created_at: string;
};

type BroadcastDraft = {
  id: string;
  audience_preset: AudiencePreset;
  channel: BroadcastChannel;
  selected_customer_ids: string[];
  subject: string | null;
  body: string;
  current_step: number;
  expires_at: string;
};

type VariableChip = {
  label: string;
  token: string;
  channels: BroadcastChannel[];
};

type StarterMessage = {
  id: string;
  title: string;
  channel: BroadcastChannel;
  subject?: string;
  body: string;
};

type SenderLocation = {
  id: string;
  name: string;
  country: string | null;
};

type SaveReusableState = {
  open: boolean;
  name: string;
};

type PreflightItem = {
  id: string;
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
};

const SALON_EMAIL_TEMPLATE_TYPES: TemplateType[] = [
  "appointment_confirmation",
  "appointment_reminder",
  "appointment_cancelled",
  "booking_confirmation",
  "service_started",
  "buffer_requested",
  "service_change_approval",
];

const SALON_SMS_TEMPLATE_TYPES: SMSTemplateType[] = [
  "appointment_confirmation",
  "appointment_reminder",
  "appointment_cancelled",
];

const CREDIT_COST: Record<BroadcastChannel, number> = {
  sms: 2,
  email: 0,
};

const variableChips: VariableChip[] = [
  { label: "Customer's name", token: "{{customer_name}}", channels: ["sms", "email"] },
  { label: "Appointment date", token: "{{appointment_date}}", channels: ["sms", "email"] },
  { label: "Appointment time", token: "{{appointment_time}}", channels: ["sms", "email"] },
  { label: "Salon name", token: "{{salon_name}}", channels: ["sms", "email"] },
  { label: "Booking link", token: "{{booking_link}}", channels: ["sms", "email"] },
  { label: "Service name", token: "{{service_name}}", channels: ["sms", "email"] },
  { label: "Amount", token: "{{amount}}", channels: ["sms", "email"] },
];

const starterMessages: StarterMessage[] = (["email", "sms"] as const).flatMap(channel => [
  { id: `appointment_reminder_${channel}`, title: "Appointment reminder", channel,
    subject: "Reminder: your appointment at {{salon_name}}",
    body: "Hi {{customer_name}}, this is a reminder from {{salon_name}} about your appointment on {{appointment_date}} at {{appointment_time}}." },
  { id: `new_service_${channel}`, title: "New service launch", channel,
    subject: "Something new at {{salon_name}}",
    body: "Hi {{customer_name}}, we have a new service at {{salon_name}}! Discover what's new and book your next visit: {{booking_link}}" },
  { id: `holiday_hours_${channel}`, title: "Holiday hours", channel,
    subject: "Holiday hours at {{salon_name}}",
    body: "Hi {{customer_name}}, our opening hours at {{salon_name}} are changing for the holidays. Please check available dates before booking: {{booking_link}}" },
  { id: `we_miss_you_${channel}`, title: "We miss you", channel,
    subject: "We miss you at {{salon_name}}",
    body: "Hi {{customer_name}}, we haven't seen you in a while and we'd love to welcome you back to {{salon_name}}. Book your next appointment here: {{booking_link}}" },
]);

const previewSampleValues = {
  customer_name: "Amara",
  appointment_date: "Tuesday, May 12",
  appointment_time: "2:30 PM",
  salon_name: "Salon Magik",
  booking_link: "https://salonmagik.com/book/glamour-house",
  service_name: "Silk Press",
  amount: "GHS 200",
};

function renderMessagePreview(input: string, salonName?: string) {
  return input.replace(/\{\{([^}]+)\}\}/g, (_, rawToken) => {
    const token = String(rawToken).trim();
    if (token === "salon_name" && salonName) return salonName;
    return previewSampleValues[token as keyof typeof previewSampleValues] || `{${token}}`;
  });
}

function toTitleCase(input: string) {
  return input
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeCountry(country?: string | null) {
  return String(country || "").trim().toUpperCase();
}

function getMarketLabel(country?: string | null) {
  const normalized = normalizeCountry(country);
  if (normalized === "GH") return "Ghana";
  if (normalized === "NG") return "Nigeria";
  return normalized || "Unknown market";
}

function getCustomerSmsCountry(customer: CustomerListItem) {
  // Prefer an explicit E.164 country prefix because it reflects the number
  // that the telco will actually route. Fall back to the customer's profile
  // country for local-format numbers.
  const phone = String(customer.phone || "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+233") || phone.startsWith("233")) return "GH";
  if (phone.startsWith("+234") || phone.startsWith("234")) return "NG";
  const country = normalizeCountry(customer.country);
  if (country === "GHANA") return "GH";
  if (country === "NIGERIA") return "NG";
  return country || null;
}

export default function MarketingPage() {
  useWalkthroughAutoTrigger("messaging");
  const { currentTenant, user, activeContextType, activeLocationId } = useAuth();
  const queryClient = useQueryClient();
  const { customers: rawCustomers, isLoading: customersLoading, error: customersError } = useCustomers();
  const { segments, isLoading: segmentsLoading, error: segmentsError } = useCustomerSegments();
  const customers = rawCustomers as CustomerListItem[];
  const { credits, messageLogs, stats, isLoading: creditsLoading, error: creditsError, refetch: refetchCredits } = useMessagingCredits();
  const { templates: emailTemplates, isLoading: emailTemplatesLoading, refetch: refetchEmailTemplates } = useEmailTemplates();
  const { templates: smsTemplates, isLoading: smsTemplatesLoading, refetch: refetchSMSTemplates } = useSMSTemplates();

  const [activeTab, setActiveTab] = useState<MarketingTab>("send-broadcast");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("group");
  const [audienceChosen, setAudienceChosen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [openStep, setOpenStep] = useState(1);
  const [templateChannel, setTemplateChannel] = useState<BroadcastChannel>("email");
  const [showMoreAudiences, setShowMoreAudiences] = useState(false);
  const [singleCustomerId, setSingleCustomerId] = useState("");
  const [singleCustomerSearch, setSingleCustomerSearch] = useState("");
  const [senderScope, setSenderScope] = useState<"business" | "branch">("branch");
  const [selectedAudience, setSelectedAudience] = useState<AudiencePreset>("all_customers");
  const [selectedChannel, setSelectedChannel] = useState<BroadcastChannel | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [selectedCustomerOverrides, setSelectedCustomerOverrides] = useState<string[]>([]);
  const [historyChannelFilter, setHistoryChannelFilter] = useState<HistoryChannelFilter>("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>("all");
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [editingEmailTemplate, setEditingEmailTemplate] = useState<TemplateType | null>(null);
  const [editingSmsTemplate, setEditingSmsTemplate] = useState<SMSTemplateType | null>(null);
  const [creditPurchaseDialogOpen, setCreditPurchaseDialogOpen] = useState(false);
  const mobileQuickAction = useMemo<MobileQuickAction>(
    () => ({ kind: "single", ariaLabel: "Buy SMS credits", onSelect: () => setCreditPurchaseDialogOpen(true) }),
    [],
  );
  const [creditPurchaseSuccessOpen, setCreditPurchaseSuccessOpen] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [customerSearch, setCustomerSearch] = useState("");
  const [saveReusable, setSaveReusable] = useState<SaveReusableState>({ open: false, name: "" });
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; creditsUsed: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [activeLocation, setActiveLocation] = useState<SenderLocation | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const sendInFlight = useRef(false);

  const isChainPlan = String(currentTenant?.plan || "").toLowerCase() === "chain";

  const { data: appointmentRows = [], isLoading: isLoadingAudienceData } = useQuery({
    queryKey: ["messaging-audience-appointments", currentTenant?.id],
    enabled: Boolean(currentTenant?.id),
    queryFn: async (): Promise<AudienceAppointmentRow[]> => {
      const { data, error } = await supabase
        .from("appointments")
        .select("customer_id, status, scheduled_start")
        .eq("tenant_id", currentTenant!.id)
        .not("customer_id", "is", null);
      if (error) throw error;
      return (data || []) as AudienceAppointmentRow[];
    },
  });

  const { data: reusableTemplates = [], isLoading: reusableTemplatesLoading, refetch: refetchReusableTemplates } = useQuery({
    queryKey: ["broadcast-reusable-templates", currentTenant?.id],
    enabled: Boolean(currentTenant?.id),
    queryFn: async (): Promise<BroadcastReusableTemplate[]> => {
      const { data, error } = await supabase
        .from("broadcast_reusable_templates")
        .select("id, name, channel, subject, body, created_at")
        .eq("tenant_id", currentTenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BroadcastReusableTemplate[];
    },
  });

  const { data: activeDraft, refetch: refetchDraft } = useQuery({
    queryKey: ["broadcast-draft", currentTenant?.id, user?.id],
    enabled: Boolean(currentTenant?.id && user?.id),
    queryFn: async (): Promise<BroadcastDraft | null> => {
      const { data, error } = await supabase
        .from("broadcast_drafts")
        .select("id, audience_preset, channel, selected_customer_ids, subject, body, current_step, expires_at")
        .eq("tenant_id", currentTenant!.id)
        .eq("user_id", user!.id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      return (data as BroadcastDraft | null) || null;
    },
  });

  // Handle ?purchase=success redirect from Paystack after credit purchase
  useEffect(() => {
    if (searchParams.get("purchase") !== "success") return;
    const clean = new URLSearchParams(searchParams);
    clean.delete("purchase");
    clean.delete("reference");
    clean.delete("trxref");
    setSearchParams(clean, { replace: true });
    setCreditPurchaseSuccessOpen(true);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!activeDraft || sendResult) return;
    setAudienceMode("group");
    setAudienceChosen(true);
    setOpenStep(3);
    setSelectedAudience(activeDraft.audience_preset);
    setSelectedChannel(activeDraft.channel);
    setSelectedCustomerOverrides(activeDraft.selected_customer_ids || []);
    setEmailSubject(activeDraft.subject || "");
    setMessage(activeDraft.body || "");
  }, [activeDraft, sendResult]);

  // Pre-select lapsed clients when navigated here from the dashboard reactivation flow
  useEffect(() => {
    const state = location.state as { lapsedClientIds?: string[]; templateType?: string } | null;
    if (!state?.lapsedClientIds?.length) return;
    setActiveTab("send-broadcast");
    setAudienceChosen(true);
    setOpenStep(2);
    setAudienceMode("group");
    setSelectedAudience("no_appointment_60");
    setSelectedCustomerOverrides(state.lapsedClientIds);
  }, [location.state]);

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.status !== "deleted" && customer.status !== "blocked"),
    [customers],
  );

  const upcomingAppointmentCustomerIds = useMemo(() => {
    const now = new Date();
    return new Set(
      appointmentRows
        .filter((row) => row.customer_id && row.scheduled_start && !["cancelled", "declined", "completed"].includes(row.status || "") && new Date(row.scheduled_start) > now)
        .map((row) => row.customer_id as string),
    );
  }, [appointmentRows]);

  const cancelledAppointmentCustomerIds = useMemo(
    () => new Set(appointmentRows.filter((row) => row.customer_id && row.status === "cancelled").map((row) => row.customer_id as string)),
    [appointmentRows],
  );

  const audienceDefinitions = useMemo<AudienceDefinition[]>(() => {
    const now = new Date();
    const newCustomerCutoff = subDays(now, 30);
    const noAppointment30Cutoff = subDays(now, 30);
    const noAppointment60Cutoff = subDays(now, 60);

    const customerIdsFor = (predicate: (customer: CustomerListItem) => boolean) =>
      activeCustomers.filter(predicate).map((customer) => customer.id);

    return [
      { id: "all_customers", label: "All customers", helper: "Everyone in your customer list.", customerIds: customerIdsFor(() => true) },
      { id: "vip_customers", label: "VIP customers", helper: "Customers marked as VIP.", customerIds: customerIdsFor((customer) => Boolean(segments[customer.id]?.is_vip)) },
      { id: "big_spenders", label: "Big spenders", helper: "Your top 10% by lifetime spend.", customerIds: customerIdsFor((customer) => Boolean(segments[customer.id]?.is_big_spender)) },
      { id: "regulars", label: "Regulars", helper: "5+ visits.", customerIds: customerIdsFor((customer) => Boolean(segments[customer.id]?.is_regular)) },
      { id: "loves_packages", label: "Loves packages", helper: "3+ package purchases this quarter.", customerIds: customerIdsFor((customer) => Boolean(segments[customer.id]?.loves_packages)) },
      { id: "lapsed_customers", label: "Lapsed", helper: "No visit in 45+ days.", customerIds: customerIdsFor((customer) => Boolean(segments[customer.id]?.is_lapsed)) },
      { id: "no_appointment_30", label: "No appointment in 30 days", helper: "Useful for reactivation outreach.", customerIds: customerIdsFor((customer) => !customer.last_visit_at || new Date(customer.last_visit_at) < noAppointment30Cutoff) },
      { id: "no_appointment_60", label: "No appointment in 60 days", helper: "A colder reactivation segment.", customerIds: customerIdsFor((customer) => !customer.last_visit_at || new Date(customer.last_visit_at) < noAppointment60Cutoff) },
      { id: "new_customers", label: "New customers", helper: "Customers added in the last 30 days.", customerIds: customerIdsFor((customer) => new Date(customer.created_at) >= newCustomerCutoff) },
      { id: "upcoming_appointments", label: "Upcoming appointments", helper: "Customers with a future booking.", customerIds: customerIdsFor((customer) => upcomingAppointmentCustomerIds.has(customer.id)) },
      { id: "cancelled_appointments", label: "Cancelled appointments", helper: "Customers with cancelled bookings.", customerIds: customerIdsFor((customer) => cancelledAppointmentCustomerIds.has(customer.id)) },
    ];
  }, [activeCustomers, cancelledAppointmentCustomerIds, upcomingAppointmentCustomerIds, segments]);

  const selectedAudienceDefinition = useMemo(
    () => audienceDefinitions.find((definition) => definition.id === selectedAudience) ?? audienceDefinitions[0],
    [audienceDefinitions, selectedAudience],
  );

  // A saved draft can outlive the last customer in a segment. Do not allow a
  // stale zero-count selection to advance to channel or message composition.
  useEffect(() => {
    if (
      audienceMode === "group" &&
      audienceChosen &&
      !customersLoading &&
      !segmentsLoading &&
      selectedAudienceDefinition &&
      selectedAudienceDefinition.customerIds.length === 0
    ) {
      setAudienceChosen(false);
      setOpenStep(1);
      setSelectedCustomerOverrides([]);
    }
  }, [audienceChosen, audienceMode, customersLoading, segmentsLoading, selectedAudienceDefinition]);

  const audienceCustomers = useMemo(() => {
    const ids = new Set(selectedAudienceDefinition?.customerIds || []);
    return activeCustomers.filter((customer) => ids.has(customer.id));
  }, [activeCustomers, selectedAudienceDefinition]);

  const filteredAudienceCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return audienceCustomers;
    return audienceCustomers.filter((customer) => {
      return (
        customer.full_name.toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query) ||
        (customer.email || "").toLowerCase().includes(query)
      );
    });
  }, [audienceCustomers, customerSearch]);

  const effectiveAudienceCustomers = useMemo(() => {
    if (!selectedCustomerOverrides.length) return audienceCustomers;
    const overrideIds = new Set(selectedCustomerOverrides);
    return audienceCustomers.filter((customer) => overrideIds.has(customer.id));
  }, [audienceCustomers, selectedCustomerOverrides]);

  const effectiveChannel: BroadcastChannel = selectedChannel ?? "sms";

  const eligibleRecipients = useMemo(() => {
    if (!selectedChannel) return [];
    if (audienceMode === "single") {
      const customer = activeCustomers.find((c) => c.id === singleCustomerId);
      if (!customer) return [];
      const hasContact = effectiveChannel === "sms" ? Boolean(customer.phone) : Boolean(customer.email);
      return hasContact ? [customer] : [];
    }
    if (!audienceChosen) return [];
    return effectiveAudienceCustomers.filter((customer) =>
      effectiveChannel === "sms" ? Boolean(customer.phone) : Boolean(customer.email),
    );
  }, [audienceMode, audienceChosen, singleCustomerId, activeCustomers, selectedChannel, effectiveChannel, effectiveAudienceCustomers]);

  const contactExcludedCount = !selectedChannel ? 0 : Math.max(0, (audienceMode === "single" ? Number(Boolean(singleCustomerId)) : effectiveAudienceCustomers.length) - eligibleRecipients.length);
  const selectedRecipientIds = eligibleRecipients.map((customer) => customer.id);
  const selectedRecipientCount = selectedRecipientIds.length;
  const currentStarters = useMemo(
    () => starterMessages.filter((item) => item.channel === selectedChannel),
    [selectedChannel],
  );

  const currentReusableTemplates = useMemo(
    () => reusableTemplates.filter((item) => item.channel === selectedChannel),
    [reusableTemplates, selectedChannel],
  );

  const currentTemplatePool = useMemo(
    () => [
      ...currentReusableTemplates.map((item) => ({
        id: `saved-${item.id}`,
        title: item.name,
        body: item.body,
        subject: item.subject || "",
        isReusable: true,
      })),
      ...currentStarters.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        subject: item.subject || "",
        isReusable: false,
      })),
    ],
    [currentReusableTemplates, currentStarters],
  );

  const previewBody = useMemo(
    () => renderMessagePreview(message, currentTenant?.name || previewSampleValues.salon_name),
    [currentTenant?.name, message],
  );
  const previewSubject = useMemo(
    () => renderMessagePreview(emailSubject, currentTenant?.name || previewSampleValues.salon_name),
    [currentTenant?.name, emailSubject],
  );
  const senderDisplayName = useMemo(() => {
    if (!currentTenant) return "Salon Magik";
    if (isChainPlan) {
      if (senderScope === "branch" && activeLocation?.name) return activeLocation.name;
      return currentTenant.name || "Salon Magik";
    }
    return currentTenant.name || "Salon Magik";
  }, [isChainPlan, senderScope, activeLocation?.name, currentTenant]);

  useEffect(() => {
    if (!isSubmitting) {
      if (submitProgress > 0 && submitProgress < 100) {
        setSubmitProgress(0);
      }
      return;
    }

    setSubmitProgress((current) => (current === 0 ? 18 : current));
    const timer = window.setInterval(() => {
      setSubmitProgress((current) => (current >= 88 ? current : current + 7));
    }, 220);

    return () => window.clearInterval(timer);
  }, [isSubmitting, submitProgress]);

  useEffect(() => {
    if (!currentTenant?.id || !activeLocationId || activeContextType !== "location") {
      setActiveLocation(null);
      return;
    }

    let cancelled = false;
    supabase
      .from("locations")
      .select("id, name, country")
      .eq("tenant_id", currentTenant.id)
      .eq("id", activeLocationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to resolve active messaging location:", error);
          setActiveLocation(null);
          return;
        }
        setActiveLocation((data as SenderLocation | null) || null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeContextType, activeLocationId, currentTenant?.id]);

  const messageCharacterCount = message.length;
  const smsSegments = Math.max(1, Math.ceil(Math.max(messageCharacterCount, 1) / 160));
  const estimatedCost = selectedRecipientCount * CREDIT_COST[effectiveChannel] * (effectiveChannel === "sms" ? smsSegments : 1);
  const balanceAfterSend = (credits?.balance || 0) - estimatedCost;
  const tenantCountry = normalizeCountry(currentTenant?.country);
  const messagingCountry = normalizeCountry(activeLocation?.country || tenantCountry);
  const isGhanaTenant = messagingCountry === "GH";
  const isNigeriaTenant = messagingCountry === "NG";
  const smsMarketSupported = isGhanaTenant || isNigeriaTenant;
  const smsCountryMismatchRecipients = useMemo(() => {
    if (effectiveChannel !== "sms" || !smsMarketSupported) return [];
    return eligibleRecipients.filter((customer) => {
      const customerCountry = getCustomerSmsCountry(customer);
      return customerCountry && customerCountry !== messagingCountry;
    });
  }, [effectiveChannel, eligibleRecipients, messagingCountry, smsMarketSupported]);
  const smsUnknownCountryRecipients = useMemo(() => {
    if (effectiveChannel !== "sms" || !smsMarketSupported) return [];
    return eligibleRecipients.filter((customer) => !getCustomerSmsCountry(customer));
  }, [effectiveChannel, eligibleRecipients, smsMarketSupported]);
  const nigeriaSmsOutsideWindow = effectiveChannel === "sms" && isNigeriaTenant && (() => {
    const hour = Number(new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()));
    return hour < 8 || hour >= 20;
  })();
  const hasCreditWallet = Boolean(credits);
  const hasEnoughSmsCredits = effectiveChannel !== "sms" || (hasCreditWallet && balanceAfterSend >= 0);
  const hasEligibleRecipients = selectedRecipientCount > 0;
  const hasRequiredMessage = Boolean(message.trim());
  const hasRequiredSubject = effectiveChannel !== "email" || Boolean(emailSubject.trim());
  const providerReady =
    effectiveChannel === "email"
      ? Boolean(currentTenant?.id)
      : smsMarketSupported;

  const preflightItems = useMemo<PreflightItem[]>(() => {
    const items: PreflightItem[] = [
      {
        id: "tenant",
        label: "Active salon",
        status: currentTenant?.id ? "ready" : "blocked",
        detail: currentTenant?.id
          ? `${currentTenant.name || "This salon"} is selected.`
          : "Select an active salon before sending.",
      },
      {
        id: "audience",
        label: "Recipient audience",
        status: hasEligibleRecipients ? "ready" : "blocked",
        detail: hasEligibleRecipients
          ? `${selectedRecipientCount} customer${selectedRecipientCount === 1 ? "" : "s"} can receive ${effectiveChannel.toUpperCase()}.`
          : `No customers in this selection can receive ${effectiveChannel.toUpperCase()}.`,
      },
      {
        id: "message",
        label: "Message content",
        status: hasRequiredMessage && hasRequiredSubject ? "ready" : "blocked",
        detail:
          effectiveChannel === "email" && !hasRequiredSubject
            ? "Add a subject line before sending this email."
            : hasRequiredMessage
              ? "Your message content is ready."
              : "Write the message customers should receive.",
      },
      {
        id: "credits",
        label: "Credits",
        status:
          effectiveChannel === "email"
            ? "ready"
            : !hasCreditWallet
              ? "blocked"
              : hasEnoughSmsCredits
                ? "ready"
                : "blocked",
        detail:
          effectiveChannel === "email"
            ? "Email sends are included with your plan."
            : !hasCreditWallet
              ? "A communication credit wallet is missing for this salon."
              : hasEnoughSmsCredits
                ? `${estimatedCost} credit${estimatedCost === 1 ? "" : "s"} will be used for this SMS send.`
                : `You need ${Math.abs(balanceAfterSend)} more credits before sending SMS.`,
      },
      {
        id: "provider",
        label: "Delivery path",
        status: providerReady ? "ready" : "blocked",
        detail:
          effectiveChannel === "email"
            ? "Email will go through Salon Magik's deployed email delivery path."
            : isGhanaTenant
              ? "Ghana SMS will use Arkesel."
              : isNigeriaTenant
                ? "Nigeria SMS will use Arkesel."
              : `SMS is not configured for ${getMarketLabel(messagingCountry)} yet.`,
      },
    ];

    if (isNigeriaTenant && effectiveChannel === "sms") {
      items.push({
        id: "nigeria-sms-window",
        label: "Nigeria SMS delivery window",
        status: effectiveChannel === "sms" && nigeriaSmsOutsideWindow ? "blocked" : "warning",
        detail: "Nigerian telecom operators enforce an 8:00 a.m.–8:00 p.m. Nigeria-time SMS window. This legal and telco requirement cannot be bypassed. Sending outside the window is disabled; scheduling is coming later.",
      });
    }

    if (effectiveChannel === "sms" && smsCountryMismatchRecipients.length > 0) {
      const market = getMarketLabel(messagingCountry);
      items.push({
        id: "sms-country-mismatch",
        label: "Recipient country mismatch",
        status: "blocked",
        detail: `${smsCountryMismatchRecipients.length} selected recipient${smsCountryMismatchRecipients.length === 1 ? " has" : "s have"} a phone country different from this ${market} branch. Remove them from the audience before sending; cross-border SMS delivery may be rejected by local telecom operators.`,
      });
    }

    if (effectiveChannel === "sms" && smsUnknownCountryRecipients.length > 0) {
      items.push({
        id: "sms-country-unknown",
        label: "Recipient country not confirmed",
        status: "warning",
        detail: `${smsUnknownCountryRecipients.length} selected recipient${smsUnknownCountryRecipients.length === 1 ? " has" : "s have"} no country on their profile or phone number. Confirm the number country before sending to improve delivery reliability.`,
      });
    }

    if (contactExcludedCount > 0) {
      items.push({
        id: "skipped",
        label: "Skipped customers",
        status: "warning",
        detail: `${contactExcludedCount} customer${contactExcludedCount === 1 ? "" : "s"} will be skipped because they do not have a ${effectiveChannel === "sms" ? "phone number" : "valid email address"} on file.`,
      });
    }

    return items;
  }, [
    balanceAfterSend,
    contactExcludedCount,
    currentTenant?.id,
    currentTenant?.name,
    estimatedCost,
    effectiveChannel,
    hasCreditWallet,
    hasEligibleRecipients,
    hasEnoughSmsCredits,
    hasRequiredMessage,
    hasRequiredSubject,
    isGhanaTenant,
    isNigeriaTenant,
    messagingCountry,
    nigeriaSmsOutsideWindow,
    providerReady,
    selectedRecipientCount,
    smsCountryMismatchRecipients.length,
    smsUnknownCountryRecipients.length,
  ]);

  const blockedPreflightItems = preflightItems.filter((item) => item.status === "blocked");
  const warningPreflightItems = preflightItems.filter((item) => item.status === "warning");
  const canSendBroadcast =
    blockedPreflightItems.length === 0 && Boolean(selectedChannel) &&
    (audienceMode === "single" ? Boolean(singleCustomerId) : audienceChosen) &&
    !customersLoading && !isLoadingAudienceData && !segmentsLoading && !creditsLoading && !customersError && !segmentsError && !creditsError &&
    !isSubmitting && !sendResult;

  const filteredHistory = useMemo(() => {
    return messageLogs.filter((log) => {
      if (historyChannelFilter !== "all" && log.channel !== historyChannelFilter) return false;
      if (historyStatusFilter !== "all" && log.status !== historyStatusFilter) return false;
      return true;
    });
  }, [historyChannelFilter, historyStatusFilter, messageLogs]);

  const availableVariables = variableChips.filter((chip) => chip.channels.includes(effectiveChannel));

  const toggleCustomerOverride = (customerId: string) => {
    setSelectedCustomerOverrides((current) =>
      current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId],
    );
  };

  const removeSmsCountryMismatches = () => {
    const mismatchIds = new Set(smsCountryMismatchRecipients.map((customer) => customer.id));
    setSelectedCustomerOverrides(
      effectiveAudienceCustomers
        .filter((customer) => !mismatchIds.has(customer.id))
        .map((customer) => customer.id),
    );
  };

  const insertVariable = (token: string, target: "body" | "subject" = "body") => {
    const element = target === "body" ? composerRef.current : subjectRef.current;
    const value = target === "body" ? message : emailSubject;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (target === "body") setMessage(next); else setEmailSubject(next);
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(start + token.length, start + token.length); });
  };

  const handlePickTemplate = (templateId: string) => {
    const template = currentTemplatePool.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setMessage(template.body);
    if (effectiveChannel === "email") {
      setEmailSubject(template.subject || "");
    }
  };

  const handleSaveDraft = async () => {
    if (!currentTenant?.id || !user?.id) return;
    try {
      const { error } = await supabase.from("broadcast_drafts").upsert(
        {
          tenant_id: currentTenant.id,
          user_id: user.id,
          audience_preset: selectedAudience,
          channel: effectiveChannel,
          selected_customer_ids: audienceMode === "single" ? [singleCustomerId] : selectedCustomerOverrides,
          subject: effectiveChannel === "email" ? emailSubject || null : null,
          body: message,
          current_step: openStep,
        },
        { onConflict: "tenant_id,user_id" },
      );
      if (error) throw error;
      toast({ title: "Draft saved", description: "You can resume this broadcast for the next 48 hours." });
      refetchDraft();
    } catch (error: unknown) {
      toast({ title: "Could not save draft", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleSendBroadcast = async () => {
    if (!canSendBroadcast || sendInFlight.current) return;
    if (nigeriaSmsOutsideWindow) {
      toast({
        title: "Nigeria SMS sending is outside the permitted window",
        description: "Nigerian telecom operators allow SMS delivery from 8:00 a.m. to 8:00 p.m. Nigeria time. Try again during the permitted window.",
        variant: "destructive",
      });
      return;
    }
    if (effectiveChannel === "sms" && smsCountryMismatchRecipients.length > 0) {
      toast({
        title: "Review recipient countries before sending",
        description: `Remove the ${smsCountryMismatchRecipients.length} recipient${smsCountryMismatchRecipients.length === 1 ? "" : "s"} whose phone country does not match this branch. Cross-border SMS may not be delivered by local telecom operators.`,
        variant: "destructive",
      });
      return;
    }
    if (selectedRecipientCount === 0) {
      toast({
        title: "No recipients available",
        description: "Choose customers who can receive this channel before sending.",
        variant: "destructive",
      });
      return;
    }
    if (!message.trim()) {
      toast({
        title: "Message required",
        description: "Write the message your customers should receive.",
        variant: "destructive",
      });
      return;
    }
    if (effectiveChannel === "email" && !emailSubject.trim()) {
      toast({
        title: "Subject required",
        description: "Add a subject line before sending this email broadcast.",
        variant: "destructive",
      });
      return;
    }
    if (effectiveChannel === "sms" && balanceAfterSend < 0) {
      toast({
        title: "Not enough credits",
        description: `You need ${Math.abs(balanceAfterSend)} more credits to send this SMS broadcast.`,
        variant: "destructive",
      });
      return;
    }
    if (!providerReady) {
      toast({
        title: "Delivery path not ready",
        description:
          effectiveChannel === "sms"
            ? `SMS is not configured for ${getMarketLabel(currentTenant?.country)} yet.`
            : "Email delivery is not ready for this salon.",
        variant: "destructive",
      });
      return;
    }

    sendInFlight.current = true;
    setIsSubmitting(true);
    setSubmitProgress(18);
    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-message", {
        body: {
          customerIds: selectedRecipientIds,
          audienceMode: audienceMode === "group" ? "group" : "single",
          audiencePreset: audienceMode === "group" ? selectedAudience : undefined,
          channel: effectiveChannel,
          message,
          subject: effectiveChannel === "email" ? emailSubject : undefined,
          senderContext: {
            senderDisplayName,
            locationId: activeLocationId,
          },
        },
      });
      if (error) throw error;

      const result = data as { sent: number; failed: number; creditsUsed: number };
      setSendResult(result);
      setMobilePreviewOpen(false);
      setSubmitProgress(100);
      toast({
        title: result.failed > 0 ? "Broadcast partially sent" : "Broadcast sent",
        description:
          result.failed > 0
            ? `${result.sent} sent and ${result.failed} failed.`
            : `${result.sent} ${effectiveChannel.toUpperCase()} message${result.sent === 1 ? "" : "s"} sent successfully.`,
      });

      if (activeDraft?.id) {
        await supabase.from("broadcast_drafts").delete().eq("id", activeDraft.id);
        refetchDraft();
      }

      await refetchCredits();
      queryClient.invalidateQueries({ queryKey: ["messaging-credits"] });
    } catch (error: unknown) {
      toast({
        title: "Broadcast failed",
        description: error instanceof Error ? error.message : "We could not send this message right now.",
        variant: "destructive",
      });
    } finally {
      sendInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSaveReusableTemplate = async () => {
    if (!currentTenant?.id || !user?.id) return;
    if (!saveReusable.name.trim()) {
      toast({ title: "Name required", description: "Give this reusable template a name.", variant: "destructive" });
      return;
    }
    if (reusableTemplates.length >= 3) {
      toast({ title: "Template limit reached", description: "A salon can only keep 3 reusable broadcast templates.", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from("broadcast_reusable_templates").insert({
        tenant_id: currentTenant.id,
        name: saveReusable.name.trim(),
        channel: selectedChannel,
        subject: effectiveChannel === "email" ? emailSubject : null,
        body: message,
        created_by: user.id,
        updated_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Saved to reuse", description: "Your broadcast template is now available in the compose screen." });
      setSaveReusable({ open: false, name: "" });
      refetchReusableTemplates();
    } catch (error: unknown) {
      toast({ title: "Could not save template", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const resetBroadcastFlow = () => {
    setSendResult(null);
    setSelectedCustomerOverrides([]);
    setAudienceMode("group");
    setAudienceChosen(false);
    setOpenStep(1);
    setSelectedTemplateId("");
    setSingleCustomerId("");
    setSingleCustomerSearch("");
    setSelectedChannel(null);
    setMessage("");
    setEmailSubject("");
  };

  const applyEmailFormat = (before: string, after = before) => {
    const element = composerRef.current;
    if (!element) return;
    const { nextValue, nextCursor } = wrapSelection(message, element.selectionStart, element.selectionEnd, before, after);
    setMessage(nextValue);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(nextCursor, nextCursor); });
  };

  const renderEmailPreview = (body: string): ReactNode => {
    const renderInline = (line: string): ReactNode[] => {
      const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g);
      return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("_") && part.endsWith("_")) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, rawHref] = linkMatch;
          let href: string | null = null;
          try {
            const parsed = new URL(rawHref, window.location.origin);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") href = parsed.href;
          } catch {
            href = null;
          }
          return href ? (
            <a key={index} href={href} target="_blank" rel="noreferrer" className="underline">
              {label}
            </a>
          ) : (
            <span key={index}>{label}</span>
          );
        }
        return <span key={index}>{part}</span>;
      });
    };

    return body.split("\n").map((line, index) => (
      <span key={index}>
        {renderInline(line)}
        {index < body.split("\n").length - 1 ? <br /> : null}
      </span>
    ));
  };

  const isAudienceComplete =
    audienceMode === "single"
      ? Boolean(singleCustomerId)
      : audienceMode === "group" && audienceChosen && Boolean(selectedAudienceDefinition?.customerIds.length);

  const singleCustomerData = activeCustomers.find((c) => c.id === singleCustomerId);

  const filteredSingleCustomers = useMemo(() => {
    const q = singleCustomerSearch.trim().toLowerCase();
    if (!q) return [];
    return activeCustomers
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [activeCustomers, singleCustomerSearch]);

  const audienceLabel = !isAudienceComplete ? "Not chosen yet" : audienceMode === "single"
    ? `1 customer — ${singleCustomerData?.full_name || ""}`
    : `${selectedAudienceDefinition?.label} · ${effectiveAudienceCustomers.length}`;
  const summaryCount = selectedChannel ? selectedRecipientCount : !isAudienceComplete ? 0 : audienceMode === "single" ? 1 : effectiveAudienceCustomers.length;
  const toggleStep = (step: number) => setOpenStep(current => current === step ? 0 : step);
  const templateDescriptions: Partial<Record<TemplateType, string>> = {
    appointment_confirmation: "Sent when a booking is made",
    appointment_reminder: "Sent before the visit",
    appointment_cancelled: "Sent when a booking is cancelled",
    booking_confirmation: "Sent after checkout",
    service_started: "Sent when a service starts",
    buffer_requested: "Sent when extra time is requested",
    service_change_approval: "Sent when a service change needs approval",
  };

  const renderSendSummary = () => (
              <aside className="marketing-send-summary" aria-label="Send summary" aria-live="polite">
                <div className="marketing-summary-heading"><h2>Send summary</h2><span className={`marketing-badge ${sendResult ? "success" : canSendBroadcast ? "success" : "warning"}`}>{sendResult ? (sendResult.failed ? "Check history" : "Sent") : canSendBroadcast ? "Ready" : "Not ready"}</span></div>
                <dl><div><dt>Audience</dt><dd>{audienceLabel}</dd></div><div><dt>Recipients</dt><dd>{summaryCount}</dd></div><div><dt>Channel</dt><dd>{selectedChannel ? selectedChannel === "email" ? "Email" : "SMS" : "Not chosen yet"}</dd></div><div><dt>Cost</dt><dd>{!selectedChannel ? "—" : selectedChannel === "email" ? "Included" : `${estimatedCost} credits`}</dd></div>{selectedChannel === "sms" && <div><dt>Balance after</dt><dd className={balanceAfterSend < 0 ? "marketing-negative" : undefined}>{balanceAfterSend} credits</dd></div>}</dl>
                {selectedChannel && <div className="marketing-preview"><span>Preview</span>{!message.trim() && !emailSubject.trim() ? <p>{selectedChannel === "email" ? "Subject line preview and email body will render here as you type." : "Your message will appear here as you type."}</p> : <>{selectedChannel === "email" && <strong>{previewSubject || "Add a subject line…"}</strong>}<p>{selectedChannel === "email" ? renderEmailPreview(previewBody) : previewBody}</p><small>Personalisation shown with sample customer details.</small></>}</div>}
                {selectedChannel && !sendResult && <div className="marketing-send-notices">{[...blockedPreflightItems, ...warningPreflightItems].filter(item => !["message", "test"].includes(item.id)).map(item => <p key={item.id} className={item.status === "blocked" ? "marketing-negative" : ""}>{item.detail}</p>)}{smsCountryMismatchRecipients.length > 0 && audienceMode === "group" && <button type="button" className="marketing-text-button" onClick={removeSmsCountryMismatches}>Remove mismatched numbers</button>}</div>}
                <button type="button" className="marketing-button primary marketing-send" onClick={handleSendBroadcast} disabled={!canSendBroadcast}>{isSubmitting && <Loader2 size={14} className="animate-spin" />}{isSubmitting ? "Sending…" : sendResult ? "Broadcast sent" : (mobilePreviewOpen ? "Send message" : `Send to ${summaryCount} customer${summaryCount === 1 ? "" : "s"}`)}</button>
                {isSubmitting && <Progress value={submitProgress} className="mt-3 h-1" />}
                {selectedChannel === "sms" && balanceAfterSend < 0 && <button type="button" className="marketing-button marketing-buy-more" onClick={() => setCreditPurchaseDialogOpen(true)}>Buy SMS Credits</button>}
              </aside>
  );

  return (
    <SalonSidebar>
      <MobileQuickActionEffect action={mobileQuickAction} />
      <div className="marketing-page">
        <div className="marketing-heading">
          <div>
            <h1>Marketing</h1>
            <p>Send announcements and reminders by email and SMS. This is broadcast messaging — not a live chat with customers.</p>
          </div>
          <div className="marketing-actions">
            <button type="button" className="marketing-button" onClick={() => setHowItWorksOpen(true)}><Info size={13} />How it works</button>
            <button type="button" className="marketing-button primary" onClick={() => setCreditPurchaseDialogOpen(true)}><Plus size={14} />Buy SMS Credits</button>
          </div>
        </div>

        <div className="marketing-metrics" aria-busy={creditsLoading}>
          <div className="marketing-metric"><span className="marketing-metric-icon"><Phone size={18} /></span><div><strong>{creditsLoading ? "…" : creditsError ? "—" : stats.creditsRemaining.toLocaleString()}</strong><p>SMS credits left</p></div></div>
          <div className="marketing-metric"><span className="marketing-metric-icon email"><Mail size={18} /></span><div><strong>{creditsLoading ? "…" : creditsError ? "—" : stats.emailsSentThisMonth.toLocaleString()}</strong><p>Emails sent this month · unlimited</p></div></div>
          <div className="marketing-metric unavailable"><span className="marketing-metric-icon"><MessageCircle size={18} /></span><div><p>WhatsApp</p><span className="marketing-badge">Coming soon</span></div></div>
        </div>
        {(customersError || segmentsError || creditsError) && <div role="alert" className="marketing-notice">Some marketing data couldn’t be loaded. Refresh the page before sending a broadcast.</div>}

        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as MarketingTab)}>
          <TabsList className="marketing-tabs" data-tour-id="tour-messaging-tabs">
            <TabsTrigger value="send-broadcast">Send Broadcast</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="delivery-history">Delivery History</TabsTrigger>
          </TabsList>
          <TabsContent value="send-broadcast" className="marketing-tab-content">
            {activeDraft && !sendResult && <div className="marketing-notice"><span>Your saved draft is ready. Available until {format(new Date(activeDraft.expires_at), "MMM d, h:mm a")}.</span><button type="button" className="marketing-button" onClick={() => setOpenStep(3)}>Resume draft</button></div>}
            {sendResult && <div role="status" className={`marketing-confirmation ${sendResult.failed ? "partial" : ""}`}>
              <span className="marketing-confirmation-icon">{sendResult.failed ? <AlertCircle size={20} /> : <Check size={20} />}</span>
              <div><h2>{sendResult.sent > 0 ? `Sent to ${sendResult.sent} customer${sendResult.sent === 1 ? "" : "s"}` : "Broadcast wasn’t sent"}</h2><p>via {effectiveChannel === "email" ? "Email" : "SMS"} · {sendResult.creditsUsed ? `${sendResult.creditsUsed} credits used` : "no credits used"}{sendResult.failed > 0 ? ` · ${sendResult.failed} failed — see Delivery History` : ""}</p></div>
              <div className="marketing-confirmation-actions"><button type="button" className="marketing-button" onClick={() => setSaveReusable({ open: true, name: "" })} disabled={reusableTemplates.length >= 3}>Save to reuse</button><button type="button" className="marketing-button primary" onClick={resetBroadcastFlow}>Send another</button></div>
            </div>}

            <div className="marketing-compose-layout">
              <fieldset className="marketing-steps" disabled={isSubmitting || !!sendResult}>
                <MarketingStep number={1} title="Who are you sending to?" summary={isAudienceComplete ? audienceLabel : undefined} open={openStep === 1} onToggle={() => toggleStep(1)}>
                  <div className="marketing-chips marketing-audience-modes">
                    <button type="button" className="marketing-chip" aria-pressed={audienceMode === "single"} data-tour-id="tour-message-single" onClick={() => { setAudienceMode("single"); setAudienceChosen(false); setSelectedChannel(null); }}>One specific customer</button>
                    <button type="button" className="marketing-chip" aria-pressed={audienceMode === "group"} data-tour-id="tour-message-group" onClick={() => { setAudienceMode("group"); setAudienceChosen(false); setSelectedChannel(null); setSingleCustomerId(""); }}>A group of customers</button>
                  </div>
                  {customersLoading || segmentsLoading ? <p className="marketing-empty">Loading your customers…</p> : audienceMode === "single" ? <div className="marketing-customer-search">
                    <label className="sr-only" htmlFor="marketing-customer">Find a customer</label>
                    <input id="marketing-customer" className="marketing-input" placeholder="Search by name, email or phone…" value={singleCustomerSearch} onChange={event => setSingleCustomerSearch(event.target.value)} autoComplete="off" />
                    {singleCustomerSearch.trim() && <div className="marketing-search-results">{filteredSingleCustomers.length ? filteredSingleCustomers.map(customer => <button type="button" key={customer.id} onClick={() => { setSingleCustomerId(customer.id); setSingleCustomerSearch(""); setSelectedChannel(null); }}><span>{customer.full_name}</span><small>{customer.email || customer.phone || "No contact details"}</small></button>) : <p>No customers found.</p>}</div>}
                    {singleCustomerData && <div className="marketing-selected-customer"><span>Selected: {singleCustomerData.full_name}</span><button type="button" className="marketing-text-button" onClick={() => setOpenStep(2)}>Continue <span aria-hidden="true">→</span></button></div>}
                  </div> : <>
                    <div className="marketing-chips">
                      {audienceDefinitions
                        .slice()
                        .sort((left, right) => Number(left.customerIds.length === 0) - Number(right.customerIds.length === 0))
                        .filter((_, index) => showMoreAudiences || index < 6)
                        .map(audience => {
                        const isEmpty = audience.customerIds.length === 0;
                        return <button
                          type="button"
                          className={`marketing-chip${isEmpty ? " marketing-chip-disabled" : ""}`}
                          key={audience.id}
                          title={isEmpty ? `${audience.label} has no customers` : audience.helper}
                          aria-pressed={audienceChosen && selectedAudience === audience.id}
                          disabled={isEmpty}
                          onClick={() => { setSelectedAudience(audience.id); setSelectedCustomerOverrides([]); setAudienceChosen(true); setOpenStep(2); }}
                        >{audience.id === "vip_customers" ? "VIP" : audience.label} <span>· {audience.customerIds.length}</span></button>;
                        })}
                    </div>
                    <div className="marketing-audience-tools">
                      <button type="button" className="marketing-text-button" onClick={() => setShowMoreAudiences(!showMoreAudiences)}>{showMoreAudiences ? "Fewer groups" : "More groups"}</button>
                      {audienceChosen && <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}><PopoverTrigger asChild><button type="button" className="marketing-text-button">Choose specific customers{selectedCustomerOverrides.length ? ` (${selectedCustomerOverrides.length})` : ""}</button></PopoverTrigger><PopoverContent className="w-[min(360px,90vw)] p-0"><Command><CommandInput value={customerSearch} onValueChange={setCustomerSearch} placeholder="Search this audience" /><CommandList><CommandEmpty>No matching customers.</CommandEmpty>{filteredAudienceCustomers.map(customer => <CommandItem key={customer.id} value={`${customer.full_name} ${customer.phone} ${customer.email}`} onSelect={() => toggleCustomerOverride(customer.id)}><span className="flex-1">{customer.full_name}</span>{selectedCustomerOverrides.includes(customer.id) && <Check size={14} />}</CommandItem>)}</CommandList><div className="border-t p-2"><Button variant="ghost" size="sm" onClick={() => setSelectedCustomerOverrides([])}>Use everyone</Button></div></Command></PopoverContent></Popover>}
                    </div>
                  </>}
                </MarketingStep>

                {isAudienceComplete && <MarketingStep number={2} title="How should we reach them?" summary={selectedChannel ? selectedChannel === "email" ? "Email" : "SMS" : undefined} open={openStep === 2} onToggle={() => toggleStep(2)}>
                  {isChainPlan && <div className="marketing-chips marketing-sender"><span>Sending as:</span><button type="button" className="marketing-chip" aria-pressed={senderScope === "branch"} onClick={() => setSenderScope("branch")}>{activeLocation?.name || "This branch"}</button><button type="button" className="marketing-chip" aria-pressed={senderScope === "business"} onClick={() => setSenderScope("business")}>{currentTenant?.name || "The business"}</button></div>}
                  <div className="marketing-channels">
                    <button type="button" aria-pressed={selectedChannel === "email"} onClick={() => { setSelectedChannel("email"); setSelectedTemplateId(""); setOpenStep(3); }}><Mail size={18} /><strong>Email</strong><span>Included with your plan</span></button>
                    <button type="button" aria-pressed={selectedChannel === "sms"} onClick={() => { setSelectedChannel("sms"); setSelectedTemplateId(""); setOpenStep(3); }}><Phone size={18} /><strong>SMS</strong><span>Uses credits</span></button>
                    <button type="button" disabled><MessageCircle size={18} /><strong>WhatsApp</strong><span>Coming soon</span></button>
                  </div>
                </MarketingStep>}

                {isAudienceComplete && selectedChannel && <MarketingStep number={3} title="What would you like to say?" open={openStep === 3} onToggle={() => toggleStep(3)}>
                  <div className="marketing-chips marketing-starters">{currentTemplatePool.map(template => <button type="button" key={template.id} className="marketing-chip" aria-pressed={selectedTemplateId === template.id} onClick={() => handlePickTemplate(template.id)}>{template.title}{template.isReusable ? " · saved" : ""}</button>)}</div>
                  {selectedChannel === "email" && <><label htmlFor="marketing-subject" className="sr-only">Subject line</label><input ref={subjectRef} id="marketing-subject" className="marketing-input" placeholder="Subject line…" value={emailSubject} onChange={event => setEmailSubject(event.target.value)} /></>}
                  <label htmlFor="marketing-message" className="sr-only">Message</label>
                  <textarea ref={composerRef} id="marketing-message" className="marketing-input marketing-message" placeholder="Write your message…" value={message} onChange={event => setMessage(event.target.value)} />
                  <div className="marketing-composer-footer"><span>{messageCharacterCount.toLocaleString()} characters{selectedChannel === "sms" ? ` · ${smsSegments} SMS segment${smsSegments === 1 ? "" : "s"}` : ""}</span><button type="button" className="marketing-button" onClick={handleSaveDraft} disabled={!message.trim()}>Save draft</button></div>
                  <details className="marketing-personalise"><summary>Personalise & format</summary><div className="marketing-chips">{availableVariables.map(chip => <button type="button" className="marketing-chip" key={chip.token} onClick={() => insertVariable(chip.token)}>+ {chip.label}</button>)}</div>{selectedChannel === "email" && <div className="marketing-editor-tools"><button type="button" aria-label="Bold" onClick={() => applyEmailFormat("**")}><Bold size={15} /></button><button type="button" aria-label="Italic" onClick={() => applyEmailFormat("_")}><Italic size={15} /></button><button type="button" aria-label="Add link" onClick={() => applyEmailFormat("[", "](https://)")}><Link2 size={15} /></button><button type="button" onClick={() => insertVariable("{{customer_name}}", "subject")}>Add customer’s name to subject</button></div>}</details>
                </MarketingStep>}
              </fieldset>

              <div className="marketing-desktop-summary">{renderSendSummary()}</div>
              {isAudienceComplete && selectedChannel && !sendResult && <button type="button" className="marketing-button primary marketing-mobile-preview" onClick={() => setMobilePreviewOpen(true)} disabled={isSubmitting || !message.trim() || (selectedChannel === "email" && !emailSubject.trim())}>Preview</button>}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="marketing-tab-content">
            <div className="marketing-template-heading"><div><h2>Automated messages</h2><p>Sent automatically when something happens — a booking, a reminder, a cancellation.</p></div><div className="marketing-chips"><button type="button" className="marketing-chip" aria-pressed={templateChannel === "email"} onClick={() => setTemplateChannel("email")}>Email</button><button type="button" className="marketing-chip" aria-pressed={templateChannel === "sms"} onClick={() => setTemplateChannel("sms")}>SMS</button></div></div>
            <div className="marketing-list">{(templateChannel === "email" ? emailTemplatesLoading : smsTemplatesLoading) ? <p className="marketing-empty">Loading templates…</p> : templateChannel === "email" ? SALON_EMAIL_TEMPLATE_TYPES.map(type => {
              const template = emailTemplates.find(item => item.template_type === type);
              return <button type="button" className="marketing-template-row" key={type} onClick={() => setEditingEmailTemplate(type)} aria-label={`Edit ${templateTypeLabels[type]} email template`}><span><strong>{templateTypeLabels[type]}</strong><small>{templateDescriptions[type]}</small></span><span className={`marketing-badge ${template ? "customized" : ""}`}>{template ? "Customized" : "Default"}</span><Pencil size={14} /></button>;
            }) : SALON_SMS_TEMPLATE_TYPES.map(type => {
              const template = smsTemplates.find(item => item.template_type === type);
              return <button type="button" className="marketing-template-row" key={type} onClick={() => setEditingSmsTemplate(type)} aria-label={`Edit ${smsTemplateTypeLabels[type]} SMS template`}><span><strong>{smsTemplateTypeLabels[type]}</strong><small>{templateDescriptions[type]}</small></span><span className={`marketing-badge ${template ? "customized" : ""}`}>{template ? "Customized" : "Default"}</span><Pencil size={14} /></button>;
            })}</div>
            <div className="marketing-template-heading marketing-saved-heading"><div><h2>Saved broadcasts</h2><p>Your own reusable campaigns — up to 3. Reuse them from the compose screen.</p></div></div>
            <div className="marketing-saved-broadcasts">{reusableTemplatesLoading ? <p className="marketing-empty">Loading saved broadcasts…</p> : reusableTemplates.length === 0 ? <p className="marketing-empty">After sending a broadcast, choose “Save to reuse” to keep it here.</p> : reusableTemplates.map(template => <button type="button" key={template.id} onClick={() => { resetBroadcastFlow(); setSelectedChannel(template.channel); setMessage(template.body); setEmailSubject(template.subject || ""); setSelectedTemplateId(`saved-${template.id}`); setActiveTab("send-broadcast"); }}><strong>{template.name}</strong><span>{template.channel === "email" ? "Email" : "SMS"} · {template.body}</span></button>)}</div>
          </TabsContent>

          <TabsContent value="delivery-history" className="marketing-tab-content">
            <div className="marketing-history-filters">
              <label><span className="sr-only">Channel filter</span><select value={historyChannelFilter} onChange={event => setHistoryChannelFilter(event.target.value as HistoryChannelFilter)}><option value="all">All channels</option><option value="sms">SMS</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
              <label><span className="sr-only">Status filter</span><select value={historyStatusFilter} onChange={event => setHistoryStatusFilter(event.target.value as HistoryStatusFilter)}><option value="all">All statuses</option><option value="delivered">Delivered</option><option value="sent">Sent</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label>
            </div>
            <div className="marketing-list">{creditsLoading ? <p className="marketing-empty">Loading delivery history…</p> : filteredHistory.length === 0 ? <p className="marketing-empty">No messages match the current filters.</p> : filteredHistory.map(log => <div key={log.id} className="marketing-history-row"><span className="marketing-badge">{log.channel === "email" ? "Email" : log.channel.toUpperCase()}</span><div><strong>{log.subject || (log.template_type ? toTitleCase(log.template_type) : "Custom message")}</strong><p>{customers.find(customer => customer.id === log.customer_id)?.full_name || log.recipient} · {format(new Date(log.created_at), "MMM d, h:mm a")}</p>{log.status === "failed" && log.error_message && <p className="marketing-negative">{log.error_message}</p>}</div><span className={`marketing-badge ${log.status}`}>{toTitleCase(log.status)}</span></div>)}</div>
          </TabsContent>
        </Tabs>

        <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
          <DialogContent className="marketing-preview-dialog">
            <DialogHeader><DialogTitle>Preview your message</DialogTitle><DialogDescription>Review the recipients, message and cost before sending.</DialogDescription></DialogHeader>
            <div className="marketing-preview-dialog-body">{renderSendSummary()}</div>
          </DialogContent>
        </Dialog>

        <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>How marketing works</DialogTitle>
              <DialogDescription>
                Send a message to one customer or a whole group in just a few clicks.
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "space-y-4 text-sm text-muted-foreground")}>
              <div className="rounded-2xl border bg-muted/20 p-3.5">
                <div className="font-medium text-foreground">Pick who should receive this</div>
                <div className="mt-1">Choose one specific customer or a group segment like VIPs, inactive customers, or everyone.</div>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-3.5">
                <div className="font-medium text-foreground">Choose how to reach them</div>
                <div className="mt-1">Pick email (always free) or SMS (uses credits). WhatsApp is coming soon.</div>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-3.5">
                <div className="font-medium text-foreground">Write and send</div>
                <div className="mt-1">Compose your message, preview exactly how it will look to customers, and send when you are ready.</div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={saveReusable.open} onOpenChange={(open) => setSaveReusable((current) => ({ ...current, open }))}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Save this broadcast to reuse</DialogTitle>
              <DialogDescription>
                Each salon can keep up to 3 reusable broadcast templates.
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "space-y-2")}>
              <Label htmlFor="reusable-template-name">Template name</Label>
              <Input
                id="reusable-template-name"
                value={saveReusable.name}
                onChange={(event) => setSaveReusable((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Reactivation offer"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveReusable({ open: false, name: "" })}>
                Cancel
              </Button>
              <Button onClick={handleSaveReusableTemplate} disabled={reusableTemplates.length >= 3}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <EditTemplateDialog
          open={!!editingEmailTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEmailTemplate(null);
              refetchEmailTemplates();
            }
          }}
          templateType={editingEmailTemplate}
        />

        <EditSMSTemplateDialog
          open={!!editingSmsTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingSmsTemplate(null);
              refetchSMSTemplates();
            }
          }}
          templateType={editingSmsTemplate}
        />

        <CreditPurchaseDialog
          open={creditPurchaseDialogOpen}
          onOpenChange={setCreditPurchaseDialogOpen}
        />

        <PaymentSuccessModal
          open={creditPurchaseSuccessOpen}
          onClose={() => setCreditPurchaseSuccessOpen(false)}
          title="Credits added!"
          description="Your messaging credits have been topped up and are ready to use."
        />
      </div>
    </SalonSidebar>
  );
}
