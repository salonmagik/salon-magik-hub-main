import { useState } from "react";
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
import { User, Plus, Check } from "lucide-react";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { AddServiceDialog } from "./AddServiceDialog";

interface ScheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleAppointmentDialog({
  open,
  onOpenChange,
}: ScheduleAppointmentDialogProps) {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer: "",
    service: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    duration: "60",
    staff: "",
    status: "confirmed",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Save appointment
    onOpenChange(false);
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
                    value={formData.customer}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, customer: v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <User className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sarah">Sarah Johnson</SelectItem>
                      <SelectItem value="mike">Mike Chen</SelectItem>
                      <SelectItem value="emily">Emily Davis</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => setCustomerDialogOpen(true)}
                    className="gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    New
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Service <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.service}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, service: v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <User className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="haircut">Hair Cut & Style</SelectItem>
                      <SelectItem value="color">Color Treatment</SelectItem>
                      <SelectItem value="waxing">Full Body Waxing</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => setServiceDialogOpen(true)}
                    className="gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    New
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
                />
              </div>
            </div>

            {/* Staff & Status Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assigned staff</Label>
                <Select
                  value={formData.staff}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, staff: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No staff assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No staff assigned</SelectItem>
                    <SelectItem value="agatha">Agatha Ambrose</SelectItem>
                    <SelectItem value="john">John Smith</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  Client and staff notifications will be sent automatically based
                  on your settings.
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save appointment</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nested Dialogs */}
      <AddCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
      />
      <AddServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
      />
    </>
  );
}
