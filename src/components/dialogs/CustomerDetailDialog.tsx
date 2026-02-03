import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useCustomerPurse } from "@/hooks/useCustomerPurse";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

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
  const { purse, fetchPurseTransactions, isLoading: purseLoading } = useCustomerPurse(customer?.id || undefined);
  const { appointments, isLoading: appointmentsLoading } = useAppointments();
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (customer?.id && open) {
      fetchPurseTransactions().then(setTransactions);
    }
  }, [customer?.id, open]);

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
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
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
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
