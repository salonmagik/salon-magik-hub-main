import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Plus, Loader2, Check } from "lucide-react";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { AppointmentNotesInput } from "@/components/notes/AppointmentNotesInput";
import { useCustomers } from "@/hooks/useCustomers";
import { useServices } from "@/hooks/useServices";
import { useStaff } from "@/hooks/useStaff";
import { useLocations } from "@/hooks/useLocations";
import { useAppointmentActions } from "@/hooks/useAppointments";
import { cn } from "@/lib/utils";

interface WalkInDialogProps {
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

export function WalkInDialog({ open, onOpenChange, onSuccess }: WalkInDialogProps) {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [noteAttachments, setNoteAttachments] = useState<Array<{
    id: string;
    fileName: string;
    fileType: string;
    dataUrl: string;
    isDrawing: boolean;
  }>>([]);
  const [formData, setFormData] = useState({
    customerId: "",
    staffId: "",
    notes: "",
  });
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const { customers, isLoading: customersLoading, refetch: refetchCustomers } = useCustomers();
  const { services, isLoading: servicesLoading } = useServices();
  const { staff, isLoading: staffLoading } = useStaff();
  const { defaultLocation } = useLocations();
  const { createAppointment, isSubmitting } = useAppointmentActions();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        customerId: "",
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

    if (!defaultLocation?.id) {
      return;
    }

    if (selectedServices.length === 0) {
      return;
    }

    const result = await createAppointment({
      customerId: formData.customerId,
      services: selectedServices.map((s) => ({
        serviceId: s.id,
        serviceName: s.name,
        price: s.price,
        duration: s.duration,
      })),
      locationId: defaultLocation.id,
      staffId: formData.staffId && formData.staffId !== "_none" ? formData.staffId : undefined,
      notes: formData.notes || undefined,
      isWalkIn: true,
      isUnscheduled: true,
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
          <DialogHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/20">
              <Users className="w-5 h-5 text-warning-foreground" />
            </div>
            <div>
              <DialogTitle className="text-xl">Walk-in Customer</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Quickly add a walk-in and start the service immediately
              </p>
            </div>
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
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, customerId: v }))
                  }
                  disabled={customersLoading}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={customersLoading ? "Loading..." : "Select or add customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={() => setCustomerDialogOpen(true)}
                  size="icon"
                  variant="outline"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Service Selection */}
            <div className="space-y-2">
              <Label>
                Services <span className="text-destructive">*</span>
              </Label>
              <ScrollArea className="h-48 rounded-md border p-2">
                {servicesLoading ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Loading services...
                  </div>
                ) : services.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No services available.
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
                            {/* Non-interactive indicator (avoids nested Radix button/refs) */}
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

            {/* Staff Assignment */}
            <div className="space-y-2">
              <Label>Assigned Staff</Label>
              <Select
                value={formData.staffId}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, staffId: v }))
                }
                disabled={staffLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? "Loading..." : "Select staff (optional)"} />
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
              rows={2}
              disabled={isSubmitting}
            />

            <DialogFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-success flex-shrink-0" />
                <span className="whitespace-nowrap">Service will start immediately</span>
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
                  Start Walk-in
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nested Customer Dialog */}
      <AddCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onSuccess={handleCustomerCreated}
      />
    </>
  );
}
