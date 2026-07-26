import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { UserPlus, Mail, User, Loader2, Send } from "lucide-react";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface InviteStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const roleOptions = [
  { value: "manager", label: "Manager", description: "Full access except billing" },
  { value: "supervisor", label: "Supervisor", description: "Manage appointments, customers and services" },
  { value: "receptionist", label: "Receptionist", description: "Book and manage appointments" },
  { value: "staff", label: "Staff", description: "View assigned appointments only" },
] as const;

export function InviteStaffDialog({ open, onOpenChange, onSuccess }: InviteStaffDialogProps) {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "staff" as typeof roleOptions[number]["value"],
  });

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      role: "staff",
    });
  };

  const { data: seatGate } = useQuery({
    queryKey: ["invite-staff-seat-gate", currentTenant?.id, open],
    enabled: Boolean(open && currentTenant?.id),
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const { data, error } = await (supabase.rpc as any)("assert_tenant_can_add_staff", {
        p_tenant_id: currentTenant.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row || null;
    },
    staleTime: 1000 * 15,
  });

  const isSeatBlocked = seatGate?.can_add === false;
  const seatMessage = isSeatBlocked
    ? String(seatGate?.required_plan || "").toLowerCase() === "studio"
      ? "Your next active team member requires a Studio upgrade."
      : "No staff seats are available right now. Add more seats from Subscription."
    : currentTenant?.id && seatGate
      ? `Seats used: ${seatGate.used}/${seatGate.allowed}`
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSeatBlocked) return;
    setIsSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("send-staff-invitation", {
        body: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          role: formData.role,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send invitation");
      }

      toast({
        title: "Invitation Sent",
        description: `An invitation has been sent to ${formData.email}`,
      });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Error inviting staff:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[22px] border-0 p-5 shadow-2xl sm:max-w-[520px] sm:p-8 sm:px-[34px]">
        <DialogHeader className="flex flex-row items-center gap-3.5 pr-8 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#f7e5e5]">
            <UserPlus className="h-5 w-5 text-[#a23b3b]" />
          </div>
          <div>
            <DialogTitle className="font-serif text-[19px] font-medium tracking-[-0.3px]">
              Invite staff member
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground">
              Send an invitation to join your team
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-[18px]">
          {seatMessage && (
            <div
              className={`rounded-[14px] px-[18px] py-3.5 text-sm ${
                isSeatBlocked
                  ? "border border-amber-300 bg-amber-50 text-amber-900"
                  : "bg-[#f1ece3] text-muted-foreground"
              }`}
            >
              <p>{seatMessage}</p>
              {isSeatBlocked && (
                <Button
                  type="button"
                  variant="link"
                  className="mt-1 h-auto p-0 text-amber-900"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/salon/settings?tab=subscription");
                  }}
                >
                  Go to Subscription
                </Button>
              )}
            </div>
          )}

          {/* Name Row */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-staff-first-name" className="text-[13.5px] font-normal text-muted-foreground">
                First name <span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="invite-staff-first-name"
                  placeholder="First name"
                  className="h-12 rounded-lg border-black/10 pl-10 text-[14.5px] focus-visible:ring-primary/15"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-staff-last-name" className="text-[13.5px] font-normal text-muted-foreground">
                Last name <span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="invite-staff-last-name"
                  placeholder="Last name"
                  className="h-12 rounded-lg border-black/10 pl-10 text-[14.5px] focus-visible:ring-primary/15"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-staff-email" className="text-[13.5px] font-normal text-muted-foreground">
              Email address <span className="text-primary">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                id="invite-staff-email"
                type="email"
                placeholder="email@example.com"
                className="h-12 rounded-lg border-black/10 pl-10 text-[14.5px] focus-visible:ring-primary/15"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-staff-role" className="text-[13.5px] font-normal text-muted-foreground">
              Role
            </Label>
            <Select
              value={formData.role}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, role: v as typeof formData.role }))
              }
            >
              <SelectTrigger
                id="invite-staff-role"
                className="h-12 rounded-lg border-black/10 px-3.5 text-[14.5px] focus:ring-primary/15"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex flex-col">
                      <span>{role.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="pt-1 text-[12.5px] text-muted-foreground/70">
              {roleOptions.find((r) => r.value === formData.role)?.description}
            </p>
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-11 w-full rounded-full border-black/10 px-5 sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 w-full gap-2 rounded-full px-5 sm:w-auto"
              disabled={isSubmitting || isSeatBlocked}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
