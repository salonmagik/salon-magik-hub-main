import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Card, CardContent } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { ScrollArea } from "@ui/scroll-area";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { DatePicker } from "@ui/date-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@ui/tooltip";
import {
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Clock,
  Plus,
  FileText,
  Pencil,
  Image as ImageIcon,
  Receipt,
  Search,
  Filter,
  X,
  MessageSquare,
  Send,
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  Scissors,
  Package,
  RotateCcw,
  Star,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { SendMessageDialog } from "@/components/messaging/SendMessageDialog";
import { MessageHistory } from "@/components/messaging/MessageHistory";
import { CreateInvoiceDialog } from "@/components/dialogs/CreateInvoiceDialog";
import { useInvoices } from "@/hooks/useInvoices";
import type { CustomerVisitedLocation, CustomerWithVisitSummary } from "@/hooks/useCustomers";
import type { Tables } from "@supabase-client";
import { getCurrencySymbol } from "@shared/currency";

type Customer = Partial<CustomerWithVisitSummary> & Tables<"customers">;
type AppointmentAttachment = Tables<"appointment_attachments">;
type CustomerTransaction = Tables<"transactions">;
type CustomerPurse = Tables<"customer_purses">;
type WalletLedgerEntry = Tables<"wallet_ledger_entries">;
type CustomerAppointment = Tables<"appointments"> & {
  location?: {
    id: string;
    name: string;
  } | null;
};
interface AppointmentNote {
  appointmentId: string;
  appointmentDate: string | null;
  note: string | null;
  attachments: AppointmentAttachment[];
}

interface CustomerDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-muted", text: "text-muted-foreground" },
  started: { bg: "bg-primary/10", text: "text-primary" },
  completed: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive" },
};

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getCustomerStatusBadgeClass(status: string): string {
  if (status === "active") {
    return "bg-success/10 text-success";
  }
  if (status === "vip") {
    return "bg-purple-100 text-purple-700";
  }
  return "bg-muted text-muted-foreground";
}

function getTransactionStatusBadgeClass(status: string): string {
  if (status === "completed") {
    return "bg-success/10 text-success";
  }
  if (status === "pending") {
    return "bg-warning/10 text-warning";
  }
  return "bg-muted text-muted-foreground";
}

function isTransactionCredit(type: string): boolean {
  return type.includes("refund") || type === "purse_topup";
}

function isPurseEntryCredit(entryType: string): boolean {
  return ["customer_purse_topup", "customer_purse_reversal"].includes(entryType);
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-[12px] border border-border/60 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f1eafa] text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}

export function CustomerDetailDialog({
  open,
  onOpenChange,
  customer,
}: CustomerDetailDialogProps) {
  const { currentTenant } = useAuth();
  const { invoices, isLoading: invoicesLoading, sendInvoice, refetch: refetchInvoices } = useInvoices();

  const [sendMessageDialogOpen, setSendMessageDialogOpen] = useState(false);
  const [createInvoiceDialogOpen, setCreateInvoiceDialogOpen] = useState(false);

  // Transaction filters
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txStartDate, setTxStartDate] = useState<Date | undefined>();
  const [txEndDate, setTxEndDate] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const customerId = customer?.id;
  const currency = currentTenant?.currency || "USD";
  const currencySymbol = getCurrencySymbol(currency);
  const { data: customerDetail, isLoading: customerDetailLoading } = useQuery({
    queryKey: ["customer-detail-dialog", currentTenant?.id, customerId, open],
    queryFn: async () => {
      if (!currentTenant?.id || !customerId) return null;

      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from("appointments")
        .select(`
          *,
          location:locations(id, name)
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("customer_id", customerId)
        .order("scheduled_start", { ascending: false });

      if (appointmentsError) throw appointmentsError;

      const customerAppointments = (appointmentsData as CustomerAppointment[] | null) || [];
      const appointmentIds = customerAppointments.map((appointment) => appointment.id);

      const [transactionsResult, purseResult, attachmentsResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("tenant_id", currentTenant.id)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_purses")
          .select("*")
          .eq("tenant_id", currentTenant.id)
          .eq("customer_id", customerId)
          .maybeSingle(),
        appointmentIds.length > 0
          ? supabase
              .from("appointment_attachments")
              .select("*")
              .in("appointment_id", appointmentIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (transactionsResult.error) throw transactionsResult.error;
      if (purseResult.error) throw purseResult.error;
      if (attachmentsResult.error) throw attachmentsResult.error;

      const transactions = (transactionsResult.data as CustomerTransaction[] | null) || [];
      const purse = (purseResult.data as CustomerPurse | null) || null;
      const attachments = (attachmentsResult.data as AppointmentAttachment[] | null) || [];

      let purseLedgerEntries: WalletLedgerEntry[] = [];
      if (purse?.id) {
        const { data: ledgerData, error: ledgerError } = await supabase
          .from("wallet_ledger_entries")
          .select("*")
          .eq("wallet_type", "customer")
          .eq("wallet_id", purse.id)
          .order("created_at", { ascending: false });

        if (ledgerError) throw ledgerError;
        purseLedgerEntries = (ledgerData as WalletLedgerEntry[] | null) || [];
      }

      const appointmentNotes: AppointmentNote[] = customerAppointments
        .filter((appointment) => appointment.notes || attachments.some((item) => item.appointment_id === appointment.id))
        .map((appointment) => ({
          appointmentId: appointment.id,
          appointmentDate: appointment.scheduled_start,
          note: appointment.notes,
          attachments: attachments.filter((item) => item.appointment_id === appointment.id),
        }));

      const visitsByLocation = new Map<string, CustomerVisitedLocation>();
      for (const appointment of customerAppointments) {
        const countsAsVisit =
          Boolean(appointment.actual_start) || ["started", "paused", "completed"].includes(appointment.status);

        if (!countsAsVisit || !appointment.location_id) continue;

        const existing = visitsByLocation.get(appointment.location_id);
        if (existing) {
          existing.visitCount += 1;
          continue;
        }

        visitsByLocation.set(appointment.location_id, {
          locationId: appointment.location_id,
          locationName: appointment.location?.name || "Unknown branch",
          visitCount: 1,
        });
      }

      const visitedLocations = Array.from(visitsByLocation.values()).sort(
        (a, b) => b.visitCount - a.visitCount || a.locationName.localeCompare(b.locationName),
      );

      const outstandingBalance = customerAppointments.reduce((sum, appointment) => {
        const paymentStatus = appointment.payment_status || "unpaid";
        const countsAsOutstanding =
          appointment.status !== "cancelled" &&
          !["fully_paid", "refunded_full"].includes(paymentStatus);

        if (!countsAsOutstanding) return sum;

        const due = Math.max(Number(appointment.total_amount || 0) - Number(appointment.amount_paid || 0), 0);
        return sum + due;
      }, 0);

      return {
        appointments: customerAppointments,
        transactions,
        purse,
        purseLedgerEntries,
        appointmentNotes,
        visitedLocations,
        visitCount: visitedLocations.reduce((sum, location) => sum + location.visitCount, 0),
        outstandingBalance,
        lastTransactionAt: transactions[0]?.created_at ?? null,
      };
    },
    enabled: Boolean(currentTenant?.id && customerId && open),
  });

  // Filter transactions by search query
  const filteredTransactions = (customerDetail?.transactions || []).filter((tx) => {
    const createdAt = new Date(tx.created_at);
    const matchesStartDate = !txStartDate || createdAt >= txStartDate;
    const matchesEndDate = !txEndDate || createdAt <= txEndDate;

    if (!matchesStartDate || !matchesEndDate) return false;
    if (!txSearchQuery) return true;
    const query = txSearchQuery.toLowerCase();
    return (
      tx.type.toLowerCase().includes(query) ||
      tx.method.toLowerCase().includes(query) ||
      tx.status.toLowerCase().includes(query) ||
      tx.appointment_id?.toLowerCase().includes(query) ||
      tx.amount.toString().includes(query)
    );
  });

  const { data: engagementSummary } = useQuery({
    queryKey: ["customer-engagement-summary", currentTenant?.id, customerId],
    queryFn: async () => {
      if (!currentTenant?.id || !customerId) return null;
      const { data, error } = await (supabase.rpc as any)("get_customer_engagement_summary", {
        p_tenant_id: currentTenant.id,
        p_customer_id: customerId,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data[0] ?? null) : data;
    },
    enabled: Boolean(currentTenant?.id && customerId && open),
  });

  if (!customer) return null;

  const customerAppointments = customerDetail?.appointments || [];
  const visitedLocations: CustomerVisitedLocation[] = customerDetail?.visitedLocations || customer.visitedLocations || [];
  const visitCount = customerDetail?.visitCount ?? customer.visit_count ?? 0;
  const outstandingBalance = customerDetail?.outstandingBalance ?? Number(customer.outstanding_balance ?? 0);
  const appointmentNotes = customerDetail?.appointmentNotes || [];
  const purse = customerDetail?.purse || null;
  const purseLedgerEntries = customerDetail?.purseLedgerEntries || [];
  const lastTransactionAt = customerDetail?.lastTransactionAt ?? null;

  // Filter invoices for this customer
  const customerInvoices = invoices.filter((inv) => inv.customer_id === customer.id);

  const canSendMessage = Boolean(customer.email || customer.phone);
  const sendMessageTooltip = canSendMessage
    ? "Send Email or SMS"
    : "Customer has no email or phone number";

  function clearFilters(): void {
    setTxStartDate(undefined);
    setTxEndDate(undefined);
    setTxSearchQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-x-hidden overflow-y-auto rounded-[24px] border-0 p-5 shadow-2xl sm:max-w-xl sm:p-8">
        <DialogHeader>
          <DialogDescription className="sr-only">
            Customer profile, engagement summary, appointments, notes, and transaction history.
          </DialogDescription>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f1eafa] font-serif text-xl font-semibold text-primary">
                {getInitials(customer.full_name)}
              </div>
              <div>
                <DialogTitle className="text-2xl font-medium flex items-center gap-2">
                  {customer.full_name}
                  {(customer as { is_starred?: boolean }).is_starred && (
                    <Star className="h-5 w-5 flex-shrink-0 fill-amber-400 text-amber-400" aria-label="VIP" />
                  )}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="secondary"
                    className={getCustomerStatusBadgeClass(customer.status)}
                  >
                    {customer.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {customer.visit_count} visits
                  </span>
                </div>
              </div>
            </div>

            {/* Send Message Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setSendMessageDialogOpen(true)}
                    disabled={!canSendMessage}
                    className="h-8 flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium"
                  >
                    <MessageSquare className="w-3 h-3 mr-2" />
                    Send Message
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sendMessageTooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </DialogHeader>

          <Tabs defaultValue="overview" className="mt-4 min-w-0">
            <TabsList className="scrollbar-hide h-auto w-full justify-start overflow-x-auto rounded-full bg-[#eee9e1] p-1">
              <TabsTrigger value="overview" className="h-10 shrink-0 rounded-full px-6">Overview</TabsTrigger>
              <TabsTrigger value="appointments" className="h-10 shrink-0 rounded-full px-6">Appointments</TabsTrigger>
              <TabsTrigger value="invoices" className="h-10 shrink-0 rounded-full px-6">Invoices</TabsTrigger>
              <TabsTrigger value="notes" className="h-10 shrink-0 rounded-full px-6">Notes</TabsTrigger>
              <TabsTrigger value="messages" className="h-10 shrink-0 rounded-full px-6">Messages</TabsTrigger>
              <TabsTrigger value="transactions" className="h-10 shrink-0 rounded-full px-6">Transactions</TabsTrigger>
              <TabsTrigger value="purse" className="h-10 shrink-0 rounded-full px-6">Store Credit</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Contact Info */}
              <Card className="rounded-[14px] border-border/60 shadow-none">
                <CardContent className="space-y-3 p-5">
                  {customer.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{customer.email}</span>
                    </div>
                  )}

                  {customer.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{customer.phone}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      Customer since {format(new Date(customer.created_at), "MMM d, yyyy")}
                    </span>
                  </div>

                  {customer.last_visit_at && (
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        Last visit: {format(new Date(customer.last_visit_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card className="rounded-[14px] border-border/60 shadow-none">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-muted-foreground">Store credit</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          This customer's combined salon balance — paid funds plus salon-issued credit, added together.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="mt-1 font-serif text-2xl font-semibold">
                      {currencySymbol}{Number(purse?.balance || 0).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-[14px] border-border/60 shadow-none">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-muted-foreground">Outstanding</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Unpaid balances from this customer's completed appointments.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="mt-1 font-serif text-2xl font-semibold text-[#8a6510]">
                      {currencySymbol}{outstandingBalance.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-[14px] border-border/60 shadow-none">
                <CardContent className="p-5">
                  <h4 className="mb-2 text-sm font-medium">Branches visited</h4>
                  {visitedLocations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No branch visits recorded yet. This customer will appear here once an appointment is completed.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {visitedLocations.map((location) => (
                        <div
                          key={location.locationId}
                          className="flex items-center justify-between rounded-[10px] border p-3"
                        >
                          <span className="text-sm font-medium">{location.locationName}</span>
                          <Badge variant="secondary">
                            {location.visitCount} {location.visitCount === 1 ? "visit" : "visits"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {customer.notes && (
                <Card className="rounded-[14px] border-border/60 shadow-none">
                  <CardContent className="p-5">
                    <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</h4>
                    <p className="text-sm">{customer.notes}</p>
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-[14px] border-border/60 shadow-none">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Preferences</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <SummaryTile
                        icon={Scissors}
                        label="Most ordered service"
                        value={engagementSummary?.most_ordered_service || "None yet"}
                      />
                      <SummaryTile
                        icon={Package}
                        label="Most ordered product"
                        value={engagementSummary?.most_ordered_product || "None yet"}
                      />
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Activity</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <SummaryTile icon={CheckCircle} label="Services completed" value={engagementSummary?.services_completed ?? 0} />
                      <SummaryTile icon={XCircle} label="Services cancelled" value={engagementSummary?.services_cancelled ?? 0} />
                      <SummaryTile icon={RotateCcw} label="Refunds" value={engagementSummary?.refunds_count ?? 0} />
                      <SummaryTile
                        icon={CreditCard}
                        label="Last transaction"
                        value={lastTransactionAt ? format(new Date(lastTransactionAt), "MMM d, yyyy") : "None yet"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appointments" className="mt-4">
              {customerDetailLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : customerAppointments.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">No appointments yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerAppointments.slice(0, 10).map((apt) => (
                    <Card key={apt.id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {apt.scheduled_start
                              ? format(new Date(apt.scheduled_start), "MMM d, yyyy 'at' h:mm a")
                              : "Unscheduled"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {currency} {Number(apt.total_amount).toFixed(2)}
                          </p>
                        </div>
                        <Badge
                          className={`${statusStyles[apt.status]?.bg || "bg-muted"} ${statusStyles[apt.status]?.text || "text-muted-foreground"}`}
                        >
                          {apt.status}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="invoices" className="mt-4">
              <div className="space-y-4">
                {/* Create Invoice Button */}
                <div className="flex justify-end">
                  <Button onClick={() => setCreateInvoiceDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Invoice
                  </Button>
                </div>

                {/* Invoices List */}
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : customerInvoices.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground mb-4">No invoices yet</p>
                    <Button onClick={() => setCreateInvoiceDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Invoice
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerInvoices.map((invoice) => (
                      <Card key={invoice.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-medium text-sm">{invoice.invoice_number}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(invoice.created_at), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                            <Badge
                              className={
                                invoice.status === "paid"
                                  ? "bg-success/10 text-success"
                                  : invoice.status === "sent"
                                    ? "bg-primary/10 text-primary"
                                    : invoice.status === "void"
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-muted text-muted-foreground"
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-muted-foreground">Total:</span>
                            <span className="font-semibold">
                              {currency} {Number(invoice.total).toFixed(2)}
                            </span>
                          </div>

                          {invoice.due_date && (
                            <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                              <span>Due date:</span>
                              <span>{format(new Date(invoice.due_date), "MMM d, yyyy")}</span>
                            </div>
                          )}

                          {invoice.notes && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                              {invoice.notes}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 flex-wrap">
                            {invoice.status === "draft" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  await sendInvoice(invoice.id);
                                  refetchInvoices();
                                }}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                Send to Customer
                              </Button>
                            )}
                            {invoice.payment_link && invoice.status !== "paid" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  window.open(invoice.payment_link!, "_blank");
                                }}
                              >
                                <LinkIcon className="w-3 h-3 mr-1" />
                                View Payment Link
                              </Button>
                            )}
                            {invoice.status === "paid" && (
                              <div className="flex items-center text-sm text-success">
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Paid {invoice.paid_at && `on ${format(new Date(invoice.paid_at), "MMM d, yyyy")}`}
                              </div>
                            )}
                            {invoice.status === "void" && (
                              <div className="flex items-center text-sm text-destructive">
                                <XCircle className="w-4 h-4 mr-1" />
                                Voided
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              {customerDetailLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : appointmentNotes.length === 0 && !customer.notes ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">No notes recorded yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-4 pr-4">
                    {customer.notes && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex gap-2">
                            <Pencil className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground font-medium mb-1">Customer profile note</p>
                              <p className="text-sm">{customer.notes}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {appointmentNotes.map((note) => (
                    <Card key={note.appointmentId}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {note.appointmentDate
                              ? format(new Date(note.appointmentDate), "MMM d, yyyy 'at' h:mm a")
                              : "Unscheduled appointment"}
                          </span>
                        </div>

                        {note.note && (
                          <div className="flex gap-2 mb-3">
                            <Pencil className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <p className="text-sm">{note.note}</p>
                          </div>
                        )}

                        {note.attachments.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground font-medium">Attachments</p>
                            <div className="grid grid-cols-2 gap-2">
                              {note.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={attachment.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                                >
                                  {attachment.is_drawing ? (
                                    <Pencil className="w-4 h-4 text-primary" />
                                  ) : (
                                    <ImageIcon className="w-4 h-4 text-primary" />
                                  )}
                                  <span className="text-xs truncate flex-1">
                                    {attachment.file_name}
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-4">
              <MessageHistory customerId={customer.id} />
            </TabsContent>

            <TabsContent value="transactions" className="mt-4">
              {/* Search and Filters */}
              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by type, method, status..."
                      value={txSearchQuery}
                      onChange={(e) => setTxSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowFilters(!showFilters)}
                    className={showFilters ? "bg-muted" : ""}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
                </div>

                {showFilters && (
                  <Card>
                    <CardContent className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Start Date</Label>
                          <DatePicker
                            value={txStartDate}
                            onChange={setTxStartDate}
                            placeholder="From"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">End Date</Label>
                          <DatePicker
                            value={txEndDate}
                            onChange={setTxEndDate}
                            placeholder="To"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearFilters}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Clear Filters
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {customerDetailLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">
                    {txSearchQuery || txStartDate || txEndDate
                      ? "No matching transactions found"
                      : "No transactions yet"}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2 pr-4">
                    {filteredTransactions.map((tx) => {
                      const isCredit = isTransactionCredit(tx.type);
                      const iconBgClass = isCredit ? "bg-success/10" : "bg-primary/10";
                      const iconColorClass = isCredit ? "text-success" : "text-primary";

                      return (
                        <Card key={tx.id}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${iconBgClass}`}>
                                  <Receipt className={`w-4 h-4 ${iconColorClass}`} />
                                </div>
                                <div>
                                  <p className="font-medium text-sm capitalize">
                                    {tx.type.replace(/_/g, " ")}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{format(new Date(tx.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                                    <span>•</span>
                                    <span className="capitalize">{tx.method.replace(/_/g, " ")}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">
                                  {currency} {Number(tx.amount).toFixed(2)}
                                </p>
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${getTransactionStatusBadgeClass(tx.status)}`}
                                >
                                  {tx.status}
                                </Badge>
                              </div>
                            </div>
                            {tx.appointment_id && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                <span className="font-medium">Booking: </span>
                                <span className="font-mono">{tx.appointment_id.slice(0, 8)}...</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="purse" className="mt-4">
              <Card className="mb-4">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-muted-foreground">Current Balance</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Combined balance — paid funds plus salon-issued credit, added together.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-2xl font-semibold">
                      {currency} {Number(purse?.balance || 0).toFixed(2)}
                    </p>
                  </div>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Top Up
                  </Button>
                </CardContent>
              </Card>

              {customerDetailLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : purseLedgerEntries.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">No salon balance activity yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {purseLedgerEntries.map((entry) => {
                    const isCredit = isPurseEntryCredit(entry.entry_type);
                    const entryLabel = entry.entry_type
                      .replace(/^customer_purse_/, "")
                      .replace(/_/g, " ");
                    const iconBgClass = isCredit ? "bg-success/10" : "bg-destructive/10";
                    const iconColorClass = isCredit ? "text-success" : "text-destructive";
                    const amountColorClass = isCredit ? "text-success" : "text-destructive";

                    return (
                      <Card key={entry.id}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${iconBgClass}`}>
                              <CreditCard className={`w-4 h-4 ${iconColorClass}`} />
                            </div>
                            <div>
                              <p className="font-medium text-sm capitalize">{entryLabel}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(entry.created_at), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                          <p className={`font-semibold ${amountColorClass}`}>
                            {isCredit ? "+" : "-"}
                            {currency} {Number(entry.amount).toFixed(2)}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>

        {/* Send Message Dialog */}
        <SendMessageDialog
          open={sendMessageDialogOpen}
          onOpenChange={setSendMessageDialogOpen}
          customerId={customer.id}
        />

        {/* Create Invoice Dialog */}
        <CreateInvoiceDialog
          open={createInvoiceDialogOpen}
          onOpenChange={setCreateInvoiceDialogOpen}
          customerId={customer.id}
          onSuccess={() => {
            refetchInvoices();
          }}
        />
      </Dialog>
    );
  }
