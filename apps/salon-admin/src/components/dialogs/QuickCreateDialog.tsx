import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import {
  Calendar,
  Users,
  Scissors,
  CreditCard,
  UserPlus,
  UserCog,
  Package,
  Gift,
} from "lucide-react";
import { cn } from "@shared/utils";
import { ScheduleAppointmentDialog } from "./ScheduleAppointmentDialog";
import { WalkInDialog } from "./WalkInDialog";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { AddServiceDialog } from "./AddServiceDialog";
import { AddProductDialog } from "./AddProductDialog";
import { AddPackageDialog } from "./AddPackageDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { InviteStaffDialog } from "./InviteStaffDialog";

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalType = 
  | "appointment" 
  | "walkin" 
  | "customer" 
  | "service" 
  | "product" 
  | "package" 
  | "payment" 
  | "staff" 
  | null;

interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  modal: ModalType;
}

export function QuickCreateDialog({ open, onOpenChange }: QuickCreateDialogProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const actions: QuickAction[] = [
    {
      icon: Calendar,
      label: "New Appointment",
      description: "Schedule a new appointment",
      color: "text-primary",
      bgColor: "bg-primary/10 hover:bg-primary/20",
      modal: "appointment",
    },
    {
      icon: Users,
      label: "Walk-in",
      description: "Add a walk-in customer",
      color: "text-amber-600",
      bgColor: "bg-amber-50 hover:bg-amber-100",
      modal: "walkin",
    },
    {
      icon: UserPlus,
      label: "Add Customer",
      description: "Create a new customer profile",
      color: "text-success",
      bgColor: "bg-success/10 hover:bg-success/20",
      modal: "customer",
    },
    {
      icon: Scissors,
      label: "New Service",
      description: "Add a new service to your catalog",
      color: "text-purple-600",
      bgColor: "bg-purple-50 hover:bg-purple-100",
      modal: "service",
    },
    {
      icon: Package,
      label: "New Product",
      description: "Add a product to inventory",
      color: "text-blue-600",
      bgColor: "bg-blue-50 hover:bg-blue-100",
      modal: "product",
    },
    {
      icon: Gift,
      label: "Create Package",
      description: "Bundle services together",
      color: "text-pink-600",
      bgColor: "bg-pink-50 hover:bg-pink-100",
      modal: "package",
    },
    {
      icon: CreditCard,
      label: "Record Payment",
      description: "Log a payment transaction",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 hover:bg-emerald-100",
      modal: "payment",
    },
    {
      icon: UserCog,
      label: "Add Staff Member",
      description: "Invite a new team member",
      color: "text-rose-600",
      bgColor: "bg-rose-50 hover:bg-rose-100",
      modal: "staff",
    },
  ];

  const handleActionClick = (modal: ModalType) => {
    onOpenChange(false);
    // Small delay to let the main dialog close first
    setTimeout(() => {
      setActiveModal(modal);
    }, 100);
  };

  const handleModalClose = (modalOpen: boolean) => {
    if (!modalOpen) {
      setActiveModal(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Quick Create</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose what you would like to create next.
            </p>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 mt-4">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => handleActionClick(action.modal)}
                  className={cn(
                    "flex flex-col items-start p-4 rounded-lg border transition-all duration-200",
                    action.bgColor,
                    "text-left"
                  )}
                >
                  <div className={cn("p-2 rounded-lg mb-2", action.bgColor)}>
                    <Icon className={cn("w-5 h-5", action.color)} />
                  </div>
                  <span className="font-medium text-sm">{action.label}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {action.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t flex items-center justify-center text-xs text-muted-foreground">
            <span>Tip: Press</span>
            <kbd className="mx-1 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="mx-1 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              N
            </kbd>
            <span>from anywhere to reopen this menu.</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* All modal dialogs */}
      <ScheduleAppointmentDialog
        open={activeModal === "appointment"}
        onOpenChange={() => handleModalClose(false)}
      />
      <WalkInDialog
        open={activeModal === "walkin"}
        onOpenChange={() => handleModalClose(false)}
      />
      <AddCustomerDialog
        open={activeModal === "customer"}
        onOpenChange={() => handleModalClose(false)}
      />
      <AddServiceDialog
        open={activeModal === "service"}
        onOpenChange={() => handleModalClose(false)}
      />
      <AddProductDialog
        open={activeModal === "product"}
        onOpenChange={() => handleModalClose(false)}
      />
      <AddPackageDialog
        open={activeModal === "package"}
        onOpenChange={() => handleModalClose(false)}
      />
      <RecordPaymentDialog
        open={activeModal === "payment"}
        onOpenChange={() => handleModalClose(false)}
      />
      <InviteStaffDialog
        open={activeModal === "staff"}
        onOpenChange={() => handleModalClose(false)}
      />
    </>
  );
}
