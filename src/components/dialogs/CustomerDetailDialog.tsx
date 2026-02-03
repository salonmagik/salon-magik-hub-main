import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Clock,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Pencil,
  Image as ImageIcon,
  Receipt,
  Search,
  Filter,
  X,
} from "lucide-react";
import { useCustomerPurse, type Transaction } from "@/hooks/useCustomerPurse";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;
type AppointmentAttachment = Tables<"appointment_attachments">;

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

export function CustomerDetailDialog({
  open,
  onOpenChange,
  customer,
}: CustomerDetailDialogProps) {
  const { currentTenant } = useAuth();
  const { purse, fetchPurseTransactions, fetchAllCustomerTransactions, isLoading: purseLoading } = useCustomerPurse(customer?.id || undefined);
  const { appointments, isLoading: appointmentsLoading } = useAppointments();
  const [purseTransactions, setPurseTransactions] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [appointmentNotes, setAppointmentNotes] = useState<AppointmentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  
  // Transaction filters
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txStartDate, setTxStartDate] = useState<Date | undefined>();
  const [txEndDate, setTxEndDate] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const fetchAppointmentNotes = useCallback(async () => {
    if (!customer?.id || !currentTenant?.id) return;

    setNotesLoading(true);
    try {
      // Fetch appointments for this customer that have notes or attachments
      const { data: customerAppts } = await supabase
        .from("appointments")
        .select("id, scheduled_start, notes")
        .eq("customer_id", customer.id)
        .eq("tenant_id", currentTenant.id)
        .order("scheduled_start", { ascending: false });

      if (!customerAppts?.length) {
        setAppointmentNotes([]);
        return;
      }

      const apptIds = customerAppts.map((a) => a.id);

      // Fetch attachments for these appointments
      const { data: attachments } = await supabase
        .from("appointment_attachments")
        .select("*")
        .in("appointment_id", apptIds)
        .order("created_at", { ascending: false });

      // Group by appointment
      const notes: AppointmentNote[] = customerAppts
        .filter((apt) => apt.notes || attachments?.some((a) => a.appointment_id === apt.id))
        .map((apt) => ({
          appointmentId: apt.id,
          appointmentDate: apt.scheduled_start,
          note: apt.notes,
          attachments: attachments?.filter((a) => a.appointment_id === apt.id) || [],
        }));

      setAppointmentNotes(notes);
    } catch (err) {
      console.error("Error fetching appointment notes:", err);
    } finally {
      setNotesLoading(false);
    }
  }, [customer?.id, currentTenant?.id]);

  const fetchTransactions = useCallback(async () => {
    if (!customer?.id || !currentTenant?.id) return;
    
    setTransactionsLoading(true);
    try {
      const [purseData, allData] = await Promise.all([
        fetchPurseTransactions(),
        fetchAllCustomerTransactions({
          startDate: txStartDate?.toISOString(),
          endDate: txEndDate?.toISOString(),
        }),
      ]);
      setPurseTransactions(purseData);
      setAllTransactions(allData);
    } catch (err) {
      console.error("Error loading transactions:", err);
    } finally {
      setTransactionsLoading(false);
    }
  }, [customer?.id, currentTenant?.id, fetchPurseTransactions, fetchAllCustomerTransactions, txStartDate, txEndDate]);

  // Fetch data when dialog opens with a customer
  useEffect(() => {
    if (customer?.id && open && currentTenant?.id) {
      fetchTransactions();
      fetchAppointmentNotes();
    }
  }, [customer?.id, open, currentTenant?.id]);
  
  // Re-fetch when date filters change
  useEffect(() => {
    if (customer?.id && open && currentTenant?.id && (txStartDate || txEndDate)) {
      fetchTransactions();
    }
  }, [txStartDate, txEndDate]);

  // Filter transactions by search query
  const filteredTransactions = allTransactions.filter((tx) => {
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

  if (!customer) return null;

  const customerAppointments = appointments.filter((a) => a.customer_id === customer.id);
  const currency = currentTenant?.currency || "USD";

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-semibold">
              {getInitials(customer.full_name)}
            </div>
            <div>
              <DialogTitle className="text-xl">{customer.full_name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="secondary"
                  className={
                    customer.status === "active"
                      ? "bg-success/10 text-success"
                      : customer.status === "vip"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {customer.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {customer.visit_count} visits
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="purse">Purse</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Contact Info */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Contact Information</h4>
                
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

            {/* Notes */}
            {customer.notes && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Notes</h4>
                  <p className="text-sm">{customer.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Purse Balance</p>
                  <p className="text-xl font-semibold">
                    {currency} {Number(purse?.balance || 0).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                  <p className="text-xl font-semibold">
                    {currency} {Number(customer.outstanding_balance).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appointments" className="mt-4">
            {appointmentsLoading ? (
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

          <TabsContent value="notes" className="mt-4">
            {notesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : appointmentNotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No notes from appointments yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-4 pr-4">
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
                        onClick={() => {
                          setTxStartDate(undefined);
                          setTxEndDate(undefined);
                          setTxSearchQuery("");
                        }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear Filters
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {transactionsLoading ? (
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
                  {filteredTransactions.map((tx) => (
                    <Card key={tx.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-lg ${
                                tx.type.includes("refund") || tx.type === "purse_topup"
                                  ? "bg-success/10"
                                  : "bg-primary/10"
                              }`}
                            >
                              <Receipt className={`w-4 h-4 ${
                                tx.type.includes("refund") || tx.type === "purse_topup"
                                  ? "text-success"
                                  : "text-primary"
                              }`} />
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
                              className={`text-xs ${
                                tx.status === "completed"
                                  ? "bg-success/10 text-success"
                                  : tx.status === "pending"
                                  ? "bg-warning/10 text-warning"
                                  : "bg-muted text-muted-foreground"
                              }`}
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
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="purse" className="mt-4">
            <Card className="mb-4">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
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

            {purseLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : purseTransactions.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No purse transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {purseTransactions.map((tx) => (
                  <Card key={tx.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            tx.type === "credit" || tx.type === "refund"
                              ? "bg-success/10"
                              : "bg-destructive/10"
                          }`}
                        >
                          {tx.type === "credit" || tx.type === "refund" ? (
                            <ArrowDownLeft className="w-4 h-4 text-success" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm capitalize">{tx.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`font-semibold ${
                          tx.type === "credit" || tx.type === "refund"
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {tx.type === "credit" || tx.type === "refund" ? "+" : "-"}
                        {currency} {Number(tx.amount).toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
