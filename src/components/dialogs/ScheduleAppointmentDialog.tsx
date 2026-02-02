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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Plus, Check, Loader2 } from "lucide-react";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { AddServiceDialog } from "./AddServiceDialog";
import { useCustomers } from "@/hooks/useCustomers";
import { useServices } from "@/hooks/useServices";
import { useStaff } from "@/hooks/useStaff";
import { useLocations } from "@/hooks/useLocations";
import { useAppointmentActions } from "@/hooks/useAppointments";

interface ScheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ScheduleAppointmentDialog({
  open,
  onOpenChange,
  onSuccess,
}: ScheduleAppointmentDialogProps) {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    customerId: "",
    serviceId: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    duration: "60",
    staffId: "",
    notes: "",
  });

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
        serviceId: "",
        date: new Date().toISOString().split("T")[0],
        startTime: "09:00",
        duration: "60",
        staffId: "",
        notes: "",
      });
    }
  }, [open]);

  const handleCustomerCreated = () => {
    refetchCustomers();
  };

  const handleServiceCreated = () => {
    refetchServices();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!defaultLocation?.id) {
      return;
    }

    const selectedService = services.find((s) => s.id === formData.serviceId);
    if (!selectedService) return;

    const scheduledStart = `${formData.date}T${formData.startTime}:00`;
    const durationMs = parseInt(formData.duration) * 60 * 1000;
    const scheduledEnd = new Date(new Date(scheduledStart).getTime() + durationMs).toISOString();

    const result = await createAppointment({
      customerId: formData.customerId,
      services: [
        {
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          price: Number(selectedService.price),
          duration: selectedService.duration_minutes,
        },
      ],
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Schedule appointment</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Fill in the details below to add a new booking to your calendar.
            </p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Customer & Service Row */}
            <div className="grid grid-cols-2 gap-4">
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
                  <Button
                    type="button"
                    onClick={() => setCustomerDialogOpen(true)}
                    className="gap-1"
                    size="icon"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Service <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.serviceId}
                    onValueChange={(v) => {
                      const service = services.find((s) => s.id === v);
                      setFormData((prev) => ({
                        ...prev,
                        serviceId: v,
                        duration: service?.duration_minutes.toString() || prev.duration,
                      }));
                    }}
                    disabled={servicesLoading}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={servicesLoading ? "Loading..." : "Select service"} />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => setServiceDialogOpen(true)}
                    className="gap-1"
                    size="icon"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Date, Time, Duration Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, date: e.target.value }))
                  }
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Start time <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, startTime: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (mins)</Label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, duration: e.target.value }))
                  }
                  min="15"
                  step="15"
                />
              </div>
            </div>

            {/* Staff Row */}
            <div className="space-y-2">
              <Label>Assigned staff</Label>
              <Select
                value={formData.staffId}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, staffId: v }))
                }
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

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add any special instructions or reminders..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
              />
            </div>

            <DialogFooter className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-success" />
                <span>
                  Client notifications will be sent automatically.
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !formData.customerId || !formData.serviceId}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save appointment
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
      <AddServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        onSuccess={handleServiceCreated}
      />
    </>
  );
}
