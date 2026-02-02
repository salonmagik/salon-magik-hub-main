import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Calendar, Pause, X } from "lucide-react";
import type { AppointmentWithDetails } from "@/hooks/useAppointments";

interface AppointmentActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: "pause" | "cancel" | "reschedule" | null;
  appointment: AppointmentWithDetails | null;
  onConfirm: (data: { reason?: string; newStart?: string; newEnd?: string }) => Promise<void>;
}

export function AppointmentActionsDialog({
  open,
  onOpenChange,
  actionType,
  appointment,
  onConfirm,
}: AppointmentActionsDialogProps) {
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (actionType === "reschedule") {
        const newStart = `${newDate}T${newTime}:00`;
        const durationMs = parseInt(duration) * 60 * 1000;
        const newEnd = new Date(new Date(newStart).getTime() + durationMs).toISOString();
        await onConfirm({ newStart, newEnd });
      } else {
        await onConfirm({ reason });
      }

      // Reset form
      setReason("");
      setNewDate("");
      setNewTime("");
      setDuration("60");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (actionType) {
      case "pause":
        return "Pause Appointment";
      case "cancel":
        return "Cancel Appointment";
      case "reschedule":
        return "Reschedule Appointment";
      default:
        return "";
    }
  };

  const getDescription = () => {
    switch (actionType) {
      case "pause":
        return "This will pause the appointment timer. You can resume it later.";
      case "cancel":
        return "This will cancel the appointment. This action cannot be undone.";
      case "reschedule":
        return "Choose a new date and time for this appointment.";
      default:
        return "";
    }
  };

  const getIcon = () => {
    switch (actionType) {
      case "pause":
        return <Pause className="w-5 h-5 text-warning-foreground" />;
      case "cancel":
        return <X className="w-5 h-5 text-destructive" />;
      case "reschedule":
        return <Calendar className="w-5 h-5 text-primary" />;
      default:
        return null;
    }
  };

  if (!actionType) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              actionType === "cancel" ? "bg-destructive/10" : 
              actionType === "pause" ? "bg-warning-bg" : "bg-primary/10"
            }`}>
              {getIcon()}
            </div>
            <div>
              <DialogTitle>{getTitle()}</DialogTitle>
              <DialogDescription className="mt-1">
                {getDescription()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Customer info */}
          {appointment && (
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm font-medium">{appointment.customer?.full_name || "Unknown Customer"}</p>
              <p className="text-xs text-muted-foreground">
                {appointment.services.map(s => s.service_name).join(", ") || "No services"}
              </p>
            </div>
          )}

          {/* Reason input for pause/cancel */}
          {(actionType === "pause" || actionType === "cancel") && (
            <div className="space-y-2">
              <Label>
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder={
                  actionType === "pause" 
                    ? "e.g., Customer stepped out, waiting for product..." 
                    : "e.g., Customer requested cancellation, no show..."
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
              />
            </div>
          )}

          {/* Date/time inputs for reschedule */}
          {actionType === "reschedule" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    New Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    New Time <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min="15"
                  step="15"
                />
              </div>
            </>
          )}

          {/* Warning for cancel */}
          {actionType === "cancel" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>Cancelling this appointment may trigger notifications to the customer.</p>
            </div>
          )}

          <DialogFooter>
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
              variant={actionType === "cancel" ? "destructive" : "default"}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing..." : actionType === "cancel" ? "Cancel Appointment" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
