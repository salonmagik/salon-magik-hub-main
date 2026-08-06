import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { format, subDays } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { useAuth } from "@/hooks/useAuth";
import { useCustomers } from "@/hooks/useCustomers";
import { useCustomerSegments } from "@/hooks/useCustomerSegments";
import { useEmailTemplates, templateTypeLabels, type TemplateType } from "@/hooks/useEmailTemplates";
import { useSMSTemplates, smsTemplateTypeLabels, type SMSTemplateType } from "@/hooks/useSMSTemplates";
import { useMessagingCredits, type MessageLog } from "@/hooks/useMessagingCredits";
import { supabase } from "@/lib/supabase";
import { EditTemplateDialog } from "@/components/dialogs/EditTemplateDialog";
import { EditSMSTemplateDialog } from "@/components/messaging/EditSMSTemplateDialog";
import { CreditPurchaseDialog } from "@/components/billing/CreditPurchaseDialog";
import { PaymentSuccessModal } from "@/components/PaymentSuccessModal";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Alert, AlertDescription } from "@ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@ui/command";
import { Progress } from "@ui/progress";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import {
  AlertCircle,
  Bold,
  Building2,
  CalendarClock,
  Check,
  CheckCircle,
  CreditCard,
  Eye,
  Filter,
  Info,
  Italic,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Save,
  Send,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { wrapSelection } from "@/components/messaging/templateEditorUtils";

type MessagingTab = "send-broadcast" | "templates" | "delivery-history" | "settings";
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

// Tailwind classes must appear in source so they're included in the CSS bundle
const VAR_CHIP_CLASSES =
  "inline-flex items-center bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium mx-0.5 align-middle select-none cursor-default";

// Zero-width space used as cursor guards adjacent to contenteditable=false chip spans.
// Without these, browsers can't position the cursor before/after a chip.
const ZWS = "\u200b";

function messageToHtml(msg: string, chips: VariableChip[]): string {
  const escaped = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withChips = escaped.replace(/\{\{(\w+)\}\}/g, (match) => {
    const chip = chips.find((c) => c.token === match);
    const label = chip?.label ?? match.slice(2, -2).replace(/_/g, " ");
    // ZWS guards on both sides let the cursor navigate to/from the chip
    return `${ZWS}<span data-token="${match}" contenteditable="false" class="${VAR_CHIP_CLASSES}">${label}</span>${ZWS}`;
  });
  return withChips.replace(/\n/g, "<br>");
}

function domToMessage(el: HTMLElement): string {
  let result = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip ZWS cursor guards — they're visual aids, not part of the message
      result += (node.textContent ?? "").replace(/\u200b/g, "");
    } else if (node instanceof HTMLElement) {
      const token = node.dataset.token;
      if (token) {
        result += token;
      } else if (node.tagName === "BR") {
        result += "\n";
      } else if (node.tagName === "DIV" || node.tagName === "P") {
        if (result.length > 0 && !result.endsWith("\n")) result += "\n";
        result += domToMessage(node);
      } else {
        result += domToMessage(node);
      }
    }
  }
  return result;
}

const variableChips: VariableChip[] = [
  { label: "Customer's name", token: "{{customer_name}}", channels: ["sms", "email"] },
  { label: "Appointment date", token: "{{appointment_date}}", channels: ["sms", "email"] },
  { label: "Appointment time", token: "{{appointment_time}}", channels: ["sms", "email"] },
  { label: "Salon name", token: "{{salon_name}}", channels: ["sms", "email"] },
  { label: "Booking link", token: "{{booking_link}}", channels: ["sms", "email"] },
  { label: "Service name", token: "{{service_name}}", channels: ["sms", "email"] },
  { label: "Amount", token: "{{amount}}", channels: ["sms", "email"] },
];

const starterMessages: StarterMessage[] = [
  {
    id: "we_miss_you_sms",
    title: "We miss you",
    channel: "sms",
    body:
      "Hi {{customer_name}}, we haven't seen you in a while. Book your next appointment with {{salon_name}} here: {{booking_link}}",
  },
  {
    id: "appointment_reminder_sms",
    title: "Appointment reminder",
    channel: "sms",
    body:
      "Hi {{customer_name}}, this is a reminder from {{salon_name}} about your appointment on {{appointment_date}} at {{appointment_time}}.",
  },
  {
    id: "promo_sms",
    title: "Promo message",
    channel: "sms",
    body:
      "Hi {{customer_name}}, {{salon_name}} has a special offer for you this week. Book now here: {{booking_link}}",
  },
  {
    id: "we_miss_you_email",
    title: "We miss you",
    channel: "email",
    subject: "We miss you at {{salon_name}}",
    body:
      "Hi {{customer_name}},\n\nWe haven't seen you in a while and we'd love to welcome you back to {{salon_name}}. You can book your next appointment here: {{booking_link}}.\n\nSee you soon.",
  },
  {
    id: "appointment_reminder_email",
    title: "Appointment reminder",
    channel: "email",
    subject: "Reminder: your appointment at {{salon_name}}",
    body:
      "Hi {{customer_name}},\n\nThis is a reminder about your appointment at {{salon_name}} on {{appointment_date}} at {{appointment_time}}.\n\nWe look forward to seeing you.",
  },
  {
    id: "vip_offer_email",
    title: "VIP offer",
    channel: "email",
    subject: "A special offer for you from {{salon_name}}",
    body:
      "Hi {{customer_name}},\n\nAs one of our valued customers, we wanted to share a special offer with you from {{salon_name}}.\n\nBook here: {{booking_link}}",
  },
];

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

const statusStyles: Record<string, { bg: string; text: string }> = {
  delivered: { bg: "bg-success/10", text: "text-success" },
  sent: { bg: "bg-success/10", text: "text-success" },
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
};

const compactMetricCardClass =
  "min-w-[140px] flex-shrink-0 border-border bg-muted";
const compactTintedMetricCardClass = {
  primary: "min-w-[140px] flex-shrink-0 border-primary/20 bg-primary/5",
  success: "min-w-[140px] flex-shrink-0 border-success/20 bg-success/5",
  muted: "min-w-[140px] flex-shrink-0 border-border bg-muted",
} as const;

function normalizeCountry(country?: string | null) {
  return String(country || "").trim().toUpperCase();
}

function getMarketLabel(country?: string | null) {
  const normalized = normalizeCountry(country);
  if (normalized === "GH") return "Ghana";
  if (normalized === "NG") return "Nigeria";
  return normalized || "Unknown market";
}

export default function MessagingPage() {
  useWalkthroughAutoTrigger("messaging");
  const { currentTenant, user, activeContextType, activeLocationId } = useAuth();
  const queryClient = useQueryClient();
  const { customers: rawCustomers } = useCustomers();
  const { segments } = useCustomerSegments();
  const customers = rawCustomers as CustomerListItem[];
  const { credits, messageLogs, stats, isLoading: creditsLoading, refetch: refetchCredits } = useMessagingCredits();
  const { templates: emailTemplates, isLoading: emailTemplatesLoading, refetch: refetchEmailTemplates } = useEmailTemplates();
  const { templates: smsTemplates, isLoading: smsTemplatesLoading, refetch: refetchSMSTemplates } = useSMSTemplates();

  const [activeTab, setActiveTab] = useState<MessagingTab>("send-broadcast");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>(null);
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
  const composerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageFromDom = useRef<string>("");
  const subjectRef = useRef<HTMLDivElement | null>(null);
  const lastSubjectFromDom = useRef<string>("");
  const channelSectionRef = useRef<HTMLDivElement>(null);
  const composeSectionRef = useRef<HTMLDivElement>(null);

  const scrollToRef = (ref: React.RefObject<HTMLDivElement>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

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
  }, [searchParams.get("purchase")]);

  useEffect(() => {
    if (!activeDraft || sendResult) return;
    setAudienceMode("group");
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
    setAudienceMode("group");
    setSelectedAudience("no_appointment_60");
    setSelectedCustomerOverrides(state.lapsedClientIds);
  }, []);

  // Sync external message state changes (template load, draft load, reset) to the DOM editor
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    if (message === lastMessageFromDom.current) return;
    lastMessageFromDom.current = message;
    el.innerHTML = messageToHtml(message, variableChips);
  }, [message]);

  // Sync external emailSubject state to the subject contenteditable editor
  useEffect(() => {
    const el = subjectRef.current;
    if (!el) return;
    if (emailSubject === lastSubjectFromDom.current) return;
    lastSubjectFromDom.current = emailSubject;
    el.innerHTML = messageToHtml(emailSubject, variableChips);
  }, [emailSubject]);

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
    if (audienceMode === "single") {
      const customer = activeCustomers.find((c) => c.id === singleCustomerId);
      if (!customer) return [];
      const hasContact = effectiveChannel === "sms" ? Boolean(customer.phone) : Boolean(customer.email);
      return hasContact ? [customer] : [];
    }
    if (!selectedChannel) return [];
    return effectiveAudienceCustomers.filter((customer) =>
      effectiveChannel === "sms" ? Boolean(customer.phone) : Boolean(customer.email),
    );
  }, [audienceMode, singleCustomerId, activeCustomers, selectedChannel, effectiveAudienceCustomers]);

  const contactExcludedCount = effectiveAudienceCustomers.length - eligibleRecipients.length;
  const selectedRecipientIds = eligibleRecipients.map((customer) => customer.id);
  const selectedRecipientCount = selectedRecipientIds.length;
  const selectedRecipientLabel = selectedCustomerOverrides.length
    ? `${selectedRecipientCount} selected customer${selectedRecipientCount === 1 ? "" : "s"}`
    : `${selectedRecipientCount} recipient${selectedRecipientCount === 1 ? "" : "s"}`;

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

  useEffect(() => {
    if (!currentTemplatePool.length) {
      setSelectedTemplateId("");
      return;
    }
    if (!selectedTemplateId || !currentTemplatePool.some((template) => template.id === selectedTemplateId)) {
      const first = currentTemplatePool[0];
      setSelectedTemplateId(first.id);
      setMessage(first.body);
      if (effectiveChannel === "email") setEmailSubject(first.subject || "");
    }
  }, [currentTemplatePool, selectedTemplateId, selectedChannel]);

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
      .select("id, name")
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
  const isGhanaTenant = tenantCountry === "GH";
  const isNigeriaTenant = tenantCountry === "NG";
  const smsMarketSupported = isGhanaTenant || isNigeriaTenant;
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
                : `SMS is not configured for ${getMarketLabel(currentTenant?.country)} yet.`,
      },
    ];

    if (contactExcludedCount > 0) {
      items.push({
        id: "skipped",
        label: "Skipped customers",
        status: "warning",
        detail: `${contactExcludedCount} customer${contactExcludedCount === 1 ? "" : "s"} will be skipped because they do not have a ${effectiveChannel === "sms" ? "phone number" : "valid email address"} on file.`,
      });
    }

    if (selectedRecipientCount > 5) {
      items.push({
        id: "test",
        label: "Test recommendation",
        status: "warning",
        detail: "For a safe live test, first use the customer filter to send to a very small group.",
      });
    }

    return items;
  }, [
    balanceAfterSend,
    contactExcludedCount,
    currentTenant?.country,
    currentTenant?.id,
    currentTenant?.name,
    estimatedCost,
    hasCreditWallet,
    hasEligibleRecipients,
    hasEnoughSmsCredits,
    hasRequiredMessage,
    hasRequiredSubject,
    isGhanaTenant,
    isNigeriaTenant,
    providerReady,
    selectedChannel,
    selectedRecipientCount,
    smsMarketSupported,
  ]);

  const blockedPreflightItems = preflightItems.filter((item) => item.status === "blocked");
  const warningPreflightItems = preflightItems.filter((item) => item.status === "warning");
  const canSendBroadcast =
    blockedPreflightItems.length === 0 &&
    !isSubmitting;

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

  const makeChipSpan = useCallback((token: string, label: string): HTMLSpanElement => {
    const span = document.createElement("span");
    span.dataset.token = token;
    span.contentEditable = "false";
    span.className = VAR_CHIP_CLASSES;
    span.textContent = label;
    return span;
  }, []);

  const insertChipIntoEditor = useCallback((
    el: HTMLElement,
    token: string,
    label: string,
    onSync: (value: string) => void,
  ) => {
    el.focus();
    const sel = window.getSelection();
    const span = makeChipSpan(token, label);
    const zwsBefore = document.createTextNode(ZWS);
    const zwsAfter = document.createTextNode(ZWS);

    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      // Insert in reverse order (each insertNode goes before the previous)
      range.insertNode(zwsAfter);
      range.insertNode(span);
      range.insertNode(zwsBefore);
      range.setStartAfter(zwsAfter);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(zwsBefore);
      el.appendChild(span);
      el.appendChild(zwsAfter);
    }
    onSync(domToMessage(el));
  }, [makeChipSpan]);

  const insertVariableChip = useCallback((token: string) => {
    const el = composerRef.current;
    const chip = variableChips.find((c) => c.token === token);
    if (!el || !chip) return;
    insertChipIntoEditor(el, token, chip.label, (value) => {
      lastMessageFromDom.current = value;
      setMessage(value);
    });
  }, [insertChipIntoEditor]);

  const insertSubjectChip = useCallback((token: string) => {
    const el = subjectRef.current;
    const chip = variableChips.find((c) => c.token === token);
    if (!el || !chip) return;
    insertChipIntoEditor(el, token, chip.label, (value) => {
      lastSubjectFromDom.current = value;
      setEmailSubject(value);
    });
  }, [insertChipIntoEditor]);

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
          selected_customer_ids: selectedCustomerOverrides,
          subject: effectiveChannel === "email" ? emailSubject || null : null,
          body: message,
          current_step: 1,
        },
        { onConflict: "tenant_id,user_id" },
      );
      if (error) throw error;
      toast({ title: "Draft saved", description: "You can resume this broadcast for the next 48 hours." });
      refetchDraft();
    } catch (error: any) {
      toast({ title: "Could not save draft", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleSendBroadcast = async () => {
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

    setIsSubmitting(true);
    setSubmitProgress(18);
    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-message", {
        body: {
          customerIds: selectedRecipientIds,
          channel: effectiveChannel,
          message,
          subject: effectiveChannel === "email" ? emailSubject : undefined,
          senderContext: {
            senderDisplayName,
          },
        },
      });
      if (error) throw error;

      const result = data as { sent: number; failed: number; creditsUsed: number };
      setSendResult(result);
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
    } catch (error: any) {
      toast({
        title: "Broadcast failed",
        description: error.message || "We could not send this message right now.",
        variant: "destructive",
      });
    } finally {
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
      toast({ title: "Saved to reuse", description: "Your broadcast template is now available in Step 2." });
      setSaveReusable({ open: false, name: "" });
      refetchReusableTemplates();
    } catch (error: any) {
      toast({ title: "Could not save template", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const resetBroadcastFlow = () => {
    setSendResult(null);
    setSelectedCustomerOverrides([]);
    setAudienceMode(null);
    setSingleCustomerId("");
    setSingleCustomerSearch("");
    setSelectedChannel(null);
    setMessage("");
    setEmailSubject("");
  };

  const applyEmailFormat = (before: string, after = before) => {
    const el = composerRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const selectedText = range.toString();
    const textNode = document.createTextNode(`${before}${selectedText}${after}`);
    range.deleteContents();
    range.insertNode(textNode);
    const cursorPos = selectedText.length > 0 ? textNode.length : before.length;
    const newRange = document.createRange();
    newRange.setStart(textNode, cursorPos);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    const value = domToMessage(el);
    lastMessageFromDom.current = value;
    setMessage(value);
  };

  const renderEmailPreview = (body: string) =>
    body
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, "<br />");

  const isAudienceComplete =
    audienceMode === "single" ? Boolean(singleCustomerId) : audienceMode === "group";

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

  return (
    <SalonSidebar>
      <div className="space-y-6">
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Messaging</h1>
            <p className="mt-1 text-muted-foreground">
              Reach your customers the way they prefer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <Button variant="outline" onClick={() => setHowItWorksOpen(true)}>
              How it works
            </Button>
            <Button onClick={() => setCreditPurchaseDialogOpen(true)} className="hidden lg:inline-flex gap-2">
              <Plus className="h-4 w-4" />
              Buy SMS Credits
            </Button>
          </div>
        </div>

        <div className="scrollbar-hide flex gap-3 overflow-x-auto overscroll-x-contain snap-x pb-1 [&>*]:shrink-0 [&>*]:snap-start [&>*]:min-w-[220px] sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0">
          <Card className={compactTintedMetricCardClass.primary}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-muted-foreground">SMS Credits</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-xs">
                      Your plan's monthly free SMS allocation. Once used up, further texts are billed against purchased credits.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="mt-1 text-3xl font-semibold">
                  {stats.smsCreditsUsedThisMonth}
                  <span className="text-lg font-normal text-muted-foreground">/{stats.freeAllocation}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{stats.creditsRemaining} remaining this month</p>
              </div>
              <div className="rounded-xl bg-primary/10 p-2.5">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className={compactTintedMetricCardClass.success}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-muted-foreground">Email This Month</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-xs">
                      Your plan includes unlimited emails every month — broadcasts, booking reminders, and all automated customer communication.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="mt-1 text-3xl font-semibold">
                  {stats.emailsSentThisMonth}
                  <span className="text-lg font-normal text-muted-foreground">/∞</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Unlimited emails included.</p>
              </div>
              <div className="rounded-xl bg-success/10 p-2.5">
                <Mail className="h-5 w-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className={compactTintedMetricCardClass.muted}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">WhatsApp</p>
                <p className="mt-1 text-3xl font-semibold">Soon</p>
                <p className="mt-1 text-xs text-muted-foreground">Stay tuned for updates!</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-2.5">
                <MessageCircle className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MessagingTab)}>
          <TabsList className="h-auto w-full gap-2 rounded-2xl bg-muted/60 p-2 sm:w-auto">
            <TabsTrigger value="send-broadcast" className="rounded-xl px-5 py-2.5">
              Send Broadcast
            </TabsTrigger>
            <TabsTrigger value="templates" className="rounded-xl px-5 py-2.5">
              Templates
            </TabsTrigger>
            <TabsTrigger value="delivery-history" className="rounded-xl px-5 py-2.5">
              Delivery History
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-xl px-5 py-2.5">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send-broadcast" className="mt-5 space-y-5">
            {activeDraft && !sendResult ? (
              <Card className="border-warning/30 bg-warning-bg/40">
                <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-medium">Resume your saved draft</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Saved until {format(new Date(activeDraft.expires_at), "MMM d, yyyy 'at' h:mm a")}.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleSaveDraft}>
                      Update draft
                    </Button>
                    <Button onClick={() => scrollToRef(composeSectionRef)}>
                      Resume draft
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {sendResult ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Broadcast complete</CardTitle>
                  <CardDescription>
                    {sendResult.failed > 0
                      ? `${sendResult.sent} messages were sent and ${sendResult.failed} failed.`
                      : `${sendResult.sent} messages were sent successfully.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border bg-muted/40 p-3">
                      <div className="text-sm text-muted-foreground">Channel</div>
                      <div className="mt-1 font-medium">{effectiveChannel.toUpperCase()}</div>
                    </div>
                    <div className="rounded-2xl border bg-success/5 p-3">
                      <div className="text-sm text-muted-foreground">Sent</div>
                      <div className="mt-1 font-medium">{sendResult.sent}</div>
                    </div>
                    <div className="rounded-2xl border bg-primary/5 p-3">
                      <div className="text-sm text-muted-foreground">Credits used</div>
                      <div className="mt-1 font-medium">{sendResult.creditsUsed}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSaveReusable({ open: true, name: "" })}
                      disabled={reusableTemplates.length >= 3}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Save to reuse
                    </Button>
                    <Button onClick={resetBroadcastFlow}>Send another broadcast</Button>
                  </div>
                  {reusableTemplates.length >= 3 ? (
                    <p className="text-sm text-muted-foreground">
                      This salon already has 3 reusable broadcast templates.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {!sendResult ? (
              <div className="space-y-4">
                {/* Section 1: WHO */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Who are you sending to?</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {audienceMode === null ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setAudienceMode("single")}
                          data-tour-id="tour-message-single"
                          className="flex items-start gap-3 rounded-2xl border bg-background p-4 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className="mt-0.5 rounded-xl bg-muted p-2.5">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium">One specific customer</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Send a personal message to a single person.
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAudienceMode("group");
                            scrollToRef(channelSectionRef);
                          }}
                          data-tour-id="tour-message-group"
                          className="flex items-start gap-3 rounded-2xl border bg-background p-4 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className="mt-0.5 rounded-xl bg-muted p-2.5">
                            <Users className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium">A group of customers</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Broadcast to a segment like VIPs or inactive customers.
                            </p>
                          </div>
                        </button>
                      </div>
                    ) : null}

                    {audienceMode === "single" ? (
                      <div className="space-y-3">
                        {singleCustomerId && singleCustomerData ? (
                          <div className="flex items-center justify-between rounded-2xl border bg-muted/30 px-3.5 py-3">
                            <div>
                              <div className="font-medium">{singleCustomerData.full_name}</div>
                              <div className="text-sm text-muted-foreground">
                                {singleCustomerData.email || singleCustomerData.phone || "No contact info"}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSingleCustomerId("");
                                setSingleCustomerSearch("");
                                setSelectedChannel(null);
                              }}
                            >
                              Change
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Input
                              placeholder="Search by name, email, or phone..."
                              value={singleCustomerSearch}
                              onChange={(e) => setSingleCustomerSearch(e.target.value)}
                              autoFocus
                            />
                            {filteredSingleCustomers.length > 0 ? (
                              <div className="max-h-48 overflow-y-auto rounded-2xl border bg-background shadow-sm">
                                {filteredSingleCustomers.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60"
                                    onClick={() => {
                                      setSingleCustomerId(c.id);
                                      setSingleCustomerSearch("");
                                      scrollToRef(channelSectionRef);
                                    }}
                                  >
                                    <div>
                                      <div className="font-medium">{c.full_name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {c.email || c.phone || "No contact info"}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : singleCustomerSearch.trim() ? (
                              <p className="text-sm text-muted-foreground">No customers found.</p>
                            ) : null}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => {
                            setAudienceMode(null);
                            setSingleCustomerId("");
                            setSingleCustomerSearch("");
                            setSelectedChannel(null);
                          }}
                        >
                          Send to a group instead
                        </Button>
                      </div>
                    ) : null}

                    {audienceMode === "group" ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {audienceDefinitions.map((audience) => {
                            const isSelected = audience.id === selectedAudience;
                            return (
                              <button
                                key={audience.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAudience(audience.id);
                                  setSelectedCustomerOverrides([]);
                                }}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border bg-background hover:bg-muted/60",
                                )}
                              >
                                {audience.label}{" "}
                                <span className="text-muted-foreground">{audience.customerIds.length}</span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedAudienceDefinition?.helper}</p>

                        <div className="rounded-2xl border bg-muted/20 p-3.5">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="text-sm font-medium">Audience summary</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {audienceCustomers.length} customer{audienceCustomers.length === 1 ? "" : "s"} match this group.
                              </div>
                            </div>
                            <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <Filter className="h-4 w-4" />
                                  Add filter
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[360px] p-0" align="end">
                                <Command>
                                  <CommandInput
                                    value={customerSearch}
                                    onValueChange={setCustomerSearch}
                                    placeholder="Search by name or phone"
                                  />
                                  <CommandList>
                                    <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                                      Start typing to pick specific customers from this audience.
                                    </div>
                                    <CommandEmpty>No matching customers.</CommandEmpty>
                                    {filteredAudienceCustomers.map((customer) => {
                                      const selected = selectedCustomerOverrides.includes(customer.id);
                                      return (
                                        <CommandItem
                                          key={customer.id}
                                          value={`${customer.full_name} ${customer.phone || ""} ${customer.email || ""}`}
                                          onSelect={() => toggleCustomerOverride(customer.id)}
                                          className="flex items-center justify-between gap-3"
                                        >
                                          <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">{customer.full_name}</div>
                                            <div className="truncate text-xs text-muted-foreground">
                                              {customer.phone || customer.email || "No direct contact"}
                                            </div>
                                          </div>
                                          {selected ? <CheckCircle className="h-4 w-4 text-primary" /> : null}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandList>
                                  <div className="flex items-center justify-between border-t px-3 py-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedCustomerOverrides([])}
                                    >
                                      Use everyone
                                    </Button>
                                    <div className="text-xs text-muted-foreground">
                                      {selectedCustomerOverrides.length || audienceCustomers.length} selected
                                    </div>
                                  </div>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          {selectedCustomerOverrides.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {effectiveAudienceCustomers.slice(0, 8).map((customer) => (
                                <Badge key={customer.id} variant="secondary" className="rounded-full px-3 py-1">
                                  {customer.full_name}
                                </Badge>
                              ))}
                              {effectiveAudienceCustomers.length > 8 ? (
                                <Badge variant="secondary" className="rounded-full px-3 py-1">
                                  +{effectiveAudienceCustomers.length - 8} more
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => {
                            setAudienceMode(null);
                            setSelectedChannel(null);
                          }}
                        >
                          Send to one customer instead
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Section 2: HOW */}
                {isAudienceComplete ? (
                  <div ref={channelSectionRef}>
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">How should we reach them?</CardTitle>
                        {isChainPlan ? (
                          <div className="mt-3">
                            <p className="mb-2 text-sm text-muted-foreground">Sending as:</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSenderScope("branch")}
                                className={cn(
                                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                                  senderScope === "branch"
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border bg-background hover:bg-muted/40",
                                )}
                              >
                                <Phone className="h-3.5 w-3.5" />
                                {activeLocation?.name || "This branch"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setSenderScope("business")}
                                className={cn(
                                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                                  senderScope === "business"
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border bg-background hover:bg-muted/40",
                                )}
                              >
                                <Building2 className="h-3.5 w-3.5" />
                                {currentTenant?.name || "The business"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          {[
                            {
                              id: "email" as const,
                              title: "Email",
                              helper: "Included with your plan",
                              description: "Best for longer updates and richer content.",
                              icon: Mail,
                              disabled: false,
                            },
                            {
                              id: "sms" as const,
                              title: "SMS",
                              helper: "Uses credits",
                              description: "Best for quick reminders and short offers.",
                              icon: Phone,
                              disabled: false,
                            },
                            {
                              id: "whatsapp",
                              title: "WhatsApp",
                              helper: "Coming soon",
                              description: "Stay tuned for updates!",
                              icon: MessageCircle,
                              disabled: true,
                            },
                          ].map((ch) => {
                            const Icon = ch.icon;
                            const isSelected = ch.id === selectedChannel;
                            return (
                              <button
                                key={ch.id}
                                type="button"
                                disabled={ch.disabled}
                                onClick={() => {
                                  if (ch.disabled) return;
                                  setSelectedChannel(ch.id as BroadcastChannel);
                                  scrollToRef(composeSectionRef);
                                }}
                                className={cn(
                                  "rounded-2xl border p-3.5 text-left transition-colors",
                                  isSelected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
                                  ch.disabled && "cursor-not-allowed opacity-60",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className={cn("rounded-xl p-2", isSelected ? "bg-primary/10" : "bg-muted")}>
                                    <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                                  </div>
                                  {isSelected ? <CheckCircle className="h-4 w-4 text-primary" /> : null}
                                </div>
                                <div className="mt-2.5 text-sm font-semibold">{ch.title}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{ch.helper}</div>
                                <p className="mt-1.5 text-xs text-muted-foreground">{ch.description}</p>
                              </button>
                            );
                          })}
                        </div>

                        {selectedChannel ? (
                          <div className="rounded-2xl border bg-background p-3.5 text-sm">
                            <div className="font-medium">{selectedRecipientLabel}</div>
                            <div className="mt-1 text-muted-foreground">
                              {contactExcludedCount > 0
                                ? `${contactExcludedCount} customer${contactExcludedCount === 1 ? "" : "s"} cannot receive ${effectiveChannel.toUpperCase()} and will be skipped.`
                                : `Everyone selected can receive ${effectiveChannel.toUpperCase()}.`}
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                ) : null}

                {/* Section 3: COMPOSE + SEND */}
                {selectedChannel ? (
                  <div ref={composeSectionRef} className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">What would you like to say?</CardTitle>
                        <CardDescription>
                          {selectedChannel === "email"
                            ? "Write your email below. Use the toolbar to add formatting."
                            : "Write a short message your customers will receive as a text."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        {selectedChannel === "email" ? (
                          <div className="flex gap-1.5 rounded-2xl border bg-muted/20 p-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5"
                              title="Bold"
                              onClick={() => applyEmailFormat("**", "**")}
                            >
                              <Bold className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5"
                              title="Italic"
                              onClick={() => applyEmailFormat("_", "_")}
                            >
                              <Italic className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5"
                              title="Add link"
                              onClick={() => applyEmailFormat("[", "](url)")}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}

                        {selectedChannel === "email" ? (
                          <div className="space-y-2">
                            <Label>Subject line</Label>
                            <div className="relative">
                              {emailSubject === "" && (
                                <div
                                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                                  aria-hidden
                                >
                                  The subject your customers will see in their inbox
                                </div>
                              )}
                              <div
                                ref={subjectRef}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={() => {
                                  const el = subjectRef.current;
                                  if (!el) return;
                                  const value = domToMessage(el);
                                  lastSubjectFromDom.current = value;
                                  setEmailSubject(value);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.preventDefault();
                                }}
                                onPaste={(e) => {
                                  e.preventDefault();
                                  const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
                                  document.execCommand("insertText", false, text);
                                }}
                                className="min-h-[38px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-tight outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>span]:align-middle"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground font-medium">Add to subject:</span>
                              {[
                                variableChips.find((c) => c.token === "{{customer_name}}"),
                                variableChips.find((c) => c.token === "{{salon_name}}"),
                                variableChips.find((c) => c.token === "{{appointment_date}}"),
                              ].filter(Boolean).map((chip) => (
                                <button
                                  key={chip!.token}
                                  type="button"
                                  onClick={() => insertSubjectChip(chip!.token)}
                                  className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                >
                                  + {chip!.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {currentTemplatePool.length > 0 ? (
                          <div className="space-y-2.5">
                            <Label>Start from a template</Label>
                            <div className="grid gap-3 md:grid-cols-2">
                              {currentTemplatePool.map((template) => {
                                const selected = template.id === selectedTemplateId;
                                return (
                                  <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => handlePickTemplate(template.id)}
                                    className={cn(
                                      "rounded-2xl border p-3.5 text-left transition-colors",
                                      selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-sm font-semibold">{template.title}</div>
                                      {template.isReusable ? (
                                        <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">Saved</Badge>
                                      ) : null}
                                    </div>
                                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{template.body}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <Label>Your message</Label>
                          <div className="relative">
                            {message === "" && (
                              <div
                                className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground"
                                aria-hidden
                              >
                                {selectedChannel === "sms"
                                  ? "Hi [Customer's name], just a quick message from [Salon name]..."
                                  : "Write your email here..."}
                              </div>
                            )}
                            <div
                              ref={composerRef}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={() => {
                                const el = composerRef.current;
                                if (!el) return;
                                const value = domToMessage(el);
                                lastMessageFromDom.current = value;
                                setMessage(value);
                              }}
                              className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 empty:before:text-muted-foreground"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/20 p-2.5">
                            <div className="mr-1 text-xs font-medium text-muted-foreground">Personalise:</div>
                            {availableVariables.map((chip) => (
                              <button
                                key={chip.token}
                                type="button"
                                onClick={() => insertVariableChip(chip.token)}
                                className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                + {chip.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                            <span>
                              {messageCharacterCount} character{messageCharacterCount === 1 ? "" : "s"}
                              {selectedChannel === "sms" ? ` · ${smsSegments} SMS part${smsSegments === 1 ? "" : "s"}` : ""}
                            </span>
                            {selectedChannel === "sms" ? (
                              <span>{estimatedCost} credit{estimatedCost === 1 ? "" : "s"} estimated</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-end border-t pt-4">
                          <Button variant="outline" onClick={handleSaveDraft} className="gap-2">
                            <Save className="h-4 w-4" />
                            Save draft
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            <Eye className="mr-2 inline h-4 w-4" />
                            What customers see
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedChannel === "email" ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Subject</div>
                                <div className="mt-1 text-sm font-semibold">{previewSubject || "No subject yet"}</div>
                              </div>
                              <div
                                className="max-h-48 overflow-y-auto rounded-xl border bg-white p-3.5 text-sm leading-7 text-gray-800"
                                dangerouslySetInnerHTML={{
                                  __html: previewBody ? renderEmailPreview(previewBody) : "Your email will appear here.",
                                }}
                              />
                            </div>
                          ) : (
                            <div className="rounded-2xl bg-slate-950 px-4 py-3.5 text-sm leading-7 text-white">
                              {previewBody || "Your SMS will appear here."}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Send summary</CardTitle>
                            <Badge className={cn(blockedPreflightItems.length === 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                              {blockedPreflightItems.length === 0 ? "Ready" : "Not ready"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Audience</span>
                              <span className="font-medium">
                                {audienceMode === "single"
                                  ? singleCustomerData?.full_name || "1 customer"
                                  : selectedAudienceDefinition?.label}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Recipients</span>
                              <span className="font-medium">{selectedRecipientCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Channel</span>
                              <span className="font-medium">{effectiveChannel.toUpperCase()}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Cost</span>
                              <span className="font-medium">{selectedChannel === "sms" ? `${estimatedCost} credits` : "Free"}</span>
                            </div>
                            {selectedChannel === "sms" ? (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Balance after</span>
                                <span className={cn("font-medium", balanceAfterSend < 0 && "text-destructive")}>{balanceAfterSend}</span>
                              </div>
                            ) : null}
                          </div>

                          {isChainPlan ? (
                            <div className="rounded-xl border bg-muted/20 px-3 py-2 text-sm">
                              <span className="text-muted-foreground">Sending as: </span>
                              <span className="font-medium">{senderDisplayName}</span>
                            </div>
                          ) : null}

                          {blockedPreflightItems.length > 0 || warningPreflightItems.length > 0 ? (
                            <div className="space-y-2">
                              {[...blockedPreflightItems, ...warningPreflightItems].map((item) => (
                                <div key={item.id} className="rounded-xl border bg-background p-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-medium">{item.label}</div>
                                    <Badge
                                      className={cn(
                                        "text-[10px]",
                                        item.status === "warning" && "bg-amber-500/10 text-amber-700",
                                        item.status === "blocked" && "bg-destructive/10 text-destructive",
                                      )}
                                    >
                                      {item.status === "warning" ? "Check" : "Blocked"}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground">{item.detail}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {selectedChannel === "sms" && balanceAfterSend < 0 ? (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                You need {Math.abs(balanceAfterSend)} more credits.
                              </AlertDescription>
                            </Alert>
                          ) : null}

                          <div className="space-y-2">
                            <Button onClick={handleSendBroadcast} disabled={!canSendBroadcast} className="w-full gap-2">
                              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              {isSubmitting
                                ? "Sending..."
                                : `Send to ${selectedRecipientCount} customer${selectedRecipientCount === 1 ? "" : "s"}`}
                            </Button>
                            {isSubmitting ? <Progress value={submitProgress} className="h-1.5" /> : null}
                            {selectedChannel === "sms" && balanceAfterSend < 0 ? (
                              <Button variant="outline" className="w-full" onClick={() => setCreditPurchaseDialogOpen(true)}>
                                Buy SMS Credits
                              </Button>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="templates" className="mt-6 space-y-6">
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Email templates</CardTitle>
                  <CardDescription>Customer-facing appointment emails your salon can personalise.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {emailTemplatesLoading ? (
                    <div className="text-sm text-muted-foreground">Loading templates...</div>
                  ) : (
                    SALON_EMAIL_TEMPLATE_TYPES.map((type) => {
                      const template = emailTemplates.find((item) => item.template_type === type);
                      return (
                        <div key={type} className="rounded-2xl border bg-muted/20 p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{templateTypeLabels[type]}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {template?.subject || "Using the suggested subject line."}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={template ? "default" : "secondary"}>
                                {template ? "Customized" : "Default"}
                              </Badge>
                              <Button variant="outline" size="sm" onClick={() => setEditingEmailTemplate(type)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">SMS templates</CardTitle>
                  <CardDescription>Short appointment texts your salon can make sound like your brand.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {smsTemplatesLoading ? (
                    <div className="text-sm text-muted-foreground">Loading templates...</div>
                  ) : (
                    SALON_SMS_TEMPLATE_TYPES.map((type) => {
                      const template = smsTemplates.find((item) => item.template_type === type);
                      return (
                        <div key={type} className="rounded-2xl border bg-muted/20 p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{smsTemplateTypeLabels[type]}</div>
                              <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                {template?.message || "Using the suggested text message."}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={template?.is_active ? "default" : "secondary"}>
                                {template?.is_active ? "Active" : "Default"}
                              </Badge>
                              <Button variant="outline" size="sm" onClick={() => setEditingSmsTemplate(type)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="delivery-history" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-xl">Delivery history</CardTitle>
                  <CardDescription>Review past sends without overthinking the log.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={historyChannelFilter} onValueChange={(value) => setHistoryChannelFilter(value as HistoryChannelFilter)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All channels</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={historyStatusFilter} onValueChange={(value) => setHistoryStatusFilter(value as HistoryStatusFilter)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {creditsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading delivery history...</div>
                ) : filteredHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                    No messages match the current filters.
                  </div>
                ) : (
                  filteredHistory.map((log) => {
                    const style = statusStyles[log.status] || statusStyles.sent;
                    return (
                      <div key={log.id} className="rounded-2xl border bg-muted/20 p-3.5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{log.channel.toUpperCase()}</Badge>
                              <Badge className={cn(style.bg, style.text)}>{toTitleCase(log.status)}</Badge>
                            </div>
                            <div className="font-medium">
                              {log.subject || (log.template_type ? toTitleCase(log.template_type) : "Custom message")}
                            </div>
                            <div className="text-sm text-muted-foreground">{log.recipient}</div>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </div>
                          </div>
                          <div className="rounded-xl bg-background px-3 py-2 text-sm text-muted-foreground">
                            Credits used: {log.credits_used}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Messaging settings</CardTitle>
                <CardDescription>Only active salon-facing messaging controls appear here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="font-medium">How your SMS messages appear</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    SMS messages are delivered through Salon Magik. Always mention your salon name inside
                    the message body so customers know exactly who it is from.
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white">
                    Hi Amara, your appointment at Glamour House is tomorrow at 2:30 PM. See you then!
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="font-medium">Email delivery</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Emails are sent on behalf of your salon and are included in your plan at no extra cost.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>How messaging works</DialogTitle>
              <DialogDescription>
                Send a message to one customer or a whole group in just a few clicks.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm text-muted-foreground">
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
            <div className="space-y-2">
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

        {/* Mobile buy-credits FAB */}
        <button
          type="button"
          aria-label="Buy SMS credits"
          onClick={() => setCreditPurchaseDialogOpen(true)}
          className="lg:hidden fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>

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
