import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Banknote, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { toast } from "@ui/ui/use-toast";
import { formatCurrency } from "@shared/currency";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLocationScope } from "@/hooks/useLocationScope";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  appointmentId?: string;
}

interface PayableAppointment {
  id: string;
  scheduled_start: string;
  total_amount: number;
  amount_paid: number;
  booking_reference: string | null;
  customer: { full_name: string } | null;
  services: { service_name: string }[];
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  appointmentId,
}: RecordPaymentDialogProps) {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [appointments, setAppointments] = useState<PayableAppointment[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(appointmentId || "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !currentTenant?.id) return;
    let cancelled = false;

    const loadAppointments = async () => {
      setIsLoading(true);
      let query = supabase
        .from("appointments")
        .select("id, scheduled_start, total_amount, amount_paid, booking_reference, customer:customers!appointments_customer_id_fkey(full_name), services:appointment_services(service_name)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_unscheduled", false)
        .not("scheduled_start", "is", null)
        .neq("status", "cancelled")
        .order("scheduled_start", { ascending: false })
        .limit(150);

      if (hasScope) query = query.in("location_id", scopedLocationIds);
      const { data, error } = await query;
      if (!cancelled) {
        if (error) {
          toast({ title: "Could not load appointments", description: error.message, variant: "destructive" });
          setAppointments([]);
        } else {
          const payable = (data || []).filter(
            (item) => Number(item.total_amount) > Number(item.amount_paid),
          ) as unknown as PayableAppointment[];
          setAppointments(payable);
        }
        setIsLoading(false);
      }
    };

    void loadAppointments();
    return () => { cancelled = true; };
  }, [open, currentTenant?.id, hasScope, scopedLocationIds]);

  useEffect(() => {
    if (open) setSelectedAppointmentId(appointmentId || "");
  }, [open, appointmentId]);

  const selectedAppointment = useMemo(
    () => appointments.find((item) => item.id === selectedAppointmentId),
    [appointments, selectedAppointmentId],
  );
  const balance = selectedAppointment
    ? Math.max(Number(selectedAppointment.total_amount) - Number(selectedAppointment.amount_paid), 0)
    : 0;

  useEffect(() => {
    if (selectedAppointment) setAmount(balance.toFixed(2));
  }, [selectedAppointmentId, balance, selectedAppointment]);

  const reset = () => {
    setSelectedAppointmentId(appointmentId || "");
    setAmount("");
    setReference("");
    setNotes("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!selectedAppointmentId || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > balance) {
      toast({
        title: "Check the payment",
        description: !selectedAppointmentId
          ? "Select the booked appointment this cash payment belongs to."
          : `Enter an amount between 0.01 and ${formatCurrency(balance, currentTenant?.currency)}.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.rpc("record_offline_cash_payment", {
      p_appointment_id: selectedAppointmentId,
      p_amount: numericAmount,
      p_reference: reference.trim() || undefined,
      p_notes: notes.trim() || undefined,
    });
    setIsSubmitting(false);

    if (error) {
      toast({ title: "Cash payment was not recorded", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Cash payment recorded", description: "The appointment is now marked as paid offline." });
    reset();
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && !isSubmitting) reset();
      onOpenChange(next);
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Banknote className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Record cash payment</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Link an offline cash payment to its booked appointment.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Booked appointment <span className="text-destructive">*</span></Label>
            <Select
              value={selectedAppointmentId}
              onValueChange={setSelectedAppointmentId}
              disabled={isLoading || Boolean(appointmentId)}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading appointments…" : "Select appointment"} />
              </SelectTrigger>
              <SelectContent>
                {appointments.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.customer?.full_name || "Unknown customer"} · {format(new Date(item.scheduled_start), "d MMM, h:mm a")}
                    {item.booking_reference ? ` · ${item.booking_reference}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && appointments.length === 0 && (
              <p className="text-xs text-muted-foreground">There are no booked appointments with an outstanding balance.</p>
            )}
          </div>

          {selectedAppointment && (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{selectedAppointment.services[0]?.service_name || "Appointment"}</p>
              <p className="mt-1 text-muted-foreground">
                Paid {formatCurrency(Number(selectedAppointment.amount_paid), currentTenant?.currency)} · Balance {formatCurrency(balance, currentTenant?.currency)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cash-amount">Cash amount <span className="text-destructive">*</span></Label>
            <Input
              id="cash-amount"
              type="number"
              min="0.01"
              max={balance || undefined}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={!selectedAppointment}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-reference">Receipt or reference</Label>
            <Input id="cash-reference" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-notes">Note</Label>
            <Textarea id="cash-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !selectedAppointment}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record cash payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
