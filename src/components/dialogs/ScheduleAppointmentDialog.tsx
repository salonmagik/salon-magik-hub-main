import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DatePicker, dateToString, stringToDate } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { User, Plus, Check, Loader2 } from "lucide-react";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { AddServiceDialog } from "./AddServiceDialog";
import { AppointmentNotesInput } from "@/components/notes/AppointmentNotesInput";
import { useCustomers } from "@/hooks/useCustomers";
import { useServices } from "@/hooks/useServices";
import { useStaff } from "@/hooks/useStaff";
import { useLocations } from "@/hooks/useLocations";
import { useAppointmentActions } from "@/hooks/useAppointments";
import { cn } from "@/lib/utils";

interface ScheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface SelectedService {
  id: string;
  name: string;
  price: number;
  duration: number;
}

export function ScheduleAppointmentDialog({ open, onOpenChange, onSuccess }: ScheduleAppointmentDialogProps) {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [noteAttachments, setNoteAttachments] = useState<
    Array<{
      id: string;
      fileName: string;
      fileType: string;
      dataUrl: string;
      isDrawing: boolean;
    }>
  >([]);
  const [formData, setFormData] = useState({
    customerId: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    staffId: "",
    notes: "",
  });
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const { customers, isLoading: customersLoading, refetch: refetchCustomers } = useCustomers();
  const { services, isLoading: servicesLoading, refetch: refetchServices } = useServices();
  const { staff, isLoading: staffLoading } = useStaff();
  const { defaultLocation } = useLocations();
  const { createAppointment, isSubmitting } = useAppointmentActions();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        customerId: "",
        date: new Date().toISOString().split("T")[0],
        startTime: "09:00",
        staffId: "",
        notes: "",
      });
      setSelectedServices([]);
      setNoteAttachments([]);
    }
  }, [open]);

  const handleCustomerCreated = () => {
    refetchCustomers();
  };

  const handleServiceCreated = () => {
    refetchServices();
  };

  const toggleService = (service: { id: string; name: string; price: number; duration_minutes: number }) => {
    const exists = selectedServices.find((s) => s.id === service.id);
    if (exists) {
      setSelectedServices((prev) => prev.filter((s) => s.id !== service.id));
    } else {
      setSelectedServices((prev) => [
        ...prev,
        { id: service.id, name: service.name, price: Number(service.price), duration: service.duration_minutes },
      ]);
    }
  };

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!defaultLocation?.id || selectedServices.length === 0) {
      return;
    }

    const scheduledStart = `${formData.date}T${formData.startTime}:00`;
    const scheduledEnd = new Date(
      new Date(scheduledStart).getTime() + totalDuration * 60 * 1000
    ).toISOString();

    const result = await createAppointment({
      customerId: formData.customerId,
      services: selectedServices.map((s) => ({
        serviceId: s.id,
        serviceName: s.name,
        price: s.price,
        duration: s.duration,
      })),
      scheduledStart,
      scheduledEnd,
      locationId: defaultLocation.id,
      staffId: formData.staffId && formData.staffId !== "_none" ? formData.staffId : undefined,
      notes: formData.notes || undefined,
    });

    if (result) {
      onOpenChange(false);
      onSuccess?.();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Schedule appointment</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Fill in the details below to add a new booking to your calendar.
            </p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label>
                Customer <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select
                  value={formData.customerId}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, customerId: v }))}
                  disabled={customersLoading}
                >
                  <SelectTrigger className="flex-1">
                    <User className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder={customersLoading ? "Loading..." : "Select customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={() => setCustomerDialogOpen(true)} className="gap-1" size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Service Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Services <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setServiceDialogOpen(true)}
                  className="h-auto py-1 px-2 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Service
                </Button>
              </div>
              <ScrollArea className="h-48 rounded-md border p-2">
                {servicesLoading ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Loading services...
                  </div>
                ) : services.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No services available. Create one first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {services.map((service) => {
                      const selected = selectedServices.find((s) => s.id === service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service)}
                          aria-pressed={!!selected}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
                            selected
                              ? "bg-primary/5 border-primary"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              aria-hidden="true"
                              className={cn(
                                "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background flex items-center justify-center",
                                selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-transparent"
                              )}
                            >
                              <Check className="h-3 w-3" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{service.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {service.duration_minutes} mins
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold text-sm">
                            ${Number(service.price).toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Summary */}
            {selectedServices.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Services selected</span>
                  <span className="font-medium">{selectedServices.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total duration</span>
                  <span className="font-medium">{totalDuration} mins</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Date & Time Row - 2 columns even on mobile for compact sizing */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  value={stringToDate(formData.date)}
                  onChange={(date) => setFormData((prev) => ({ ...prev, date: dateToString(date) }))}
                  minDate={new Date()}
                  placeholder="Select date"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Start time <span className="text-destructive">*</span>
                </Label>
                <TimePicker
                  value={formData.startTime}
                  onChange={(time) => setFormData((prev) => ({ ...prev, startTime: time }))}
                  placeholder="Select time"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Staff Row */}
            <div className="space-y-2">
              <Label>Assigned staff</Label>
              <Select
                value={formData.staffId}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, staffId: v }))}
                disabled={staffLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? "Loading..." : "No staff assigned"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No staff assigned</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.profile?.full_name || "Unknown"} ({member.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes with Attachments/Drawing */}
            <AppointmentNotesInput
              value={formData.notes}
              onChange={(notes) => setFormData((prev) => ({ ...prev, notes }))}
              attachments={noteAttachments}
              onAttachmentsChange={setNoteAttachments}
              disabled={isSubmitting}
            />

            <DialogFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-success flex-shrink-0" />
                <span className="whitespace-nowrap">Client notifications will be sent automatically.</span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-initial"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !formData.customerId || selectedServices.length === 0}
                  className="flex-1 sm:flex-initial"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nested Dialogs */}
      <AddCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onSuccess={handleCustomerCreated}
      />
      <AddServiceDialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen} onSuccess={handleServiceCreated} />
    </>
  );
}
