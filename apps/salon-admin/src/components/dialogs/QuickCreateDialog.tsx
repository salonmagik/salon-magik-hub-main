import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
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
  modal: ModalType;
}

interface ActionGroup {
  label: string;
  items: QuickAction[];
}

const ACTION_GROUPS: ActionGroup[] = [
  {
    label: "BOOKINGS",
    items: [
      { icon: Calendar, label: "Book appointment", description: "Book a new appointment", modal: "appointment" },
      { icon: UserPlus, label: "Record walk-in", description: "Record a walk-in customer", modal: "walkin" },
    ],
  },
  {
    label: "MONEY",
    items: [
      { icon: CreditCard, label: "Record cash payment", description: "Link cash to a booking", modal: "payment" },
      { icon: Gift, label: "Create package", description: "Bundle services together", modal: "package" },
    ],
  },
  {
    label: "CATALOG & PEOPLE",
    items: [
      { icon: Scissors, label: "New service", description: "Add to your catalog", modal: "service" },
      { icon: Package, label: "New product", description: "Add to inventory", modal: "product" },
      { icon: Users, label: "Add customer", description: "Create a customer profile", modal: "customer" },
      { icon: UserCog, label: "Add staff member", description: "Invite a new team member", modal: "staff" },
    ],
  },
];

export function QuickCreateDialog({ open, onOpenChange }: QuickCreateDialogProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  const handleActionClick = (modal: ModalType) => {
    onOpenChange(false);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      setActiveModal(modal);
      transitionTimer.current = null;
    }, 100);
  };

  const handleModalClose = () => {
    setActiveModal(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-[580px] sm:p-7">
          {/* Header */}
          <div className="mb-5">
            <DialogTitle className="text-[28px] font-bold tracking-tight text-foreground leading-tight">
              Quick Create
            </DialogTitle>
            <p className="text-[14.5px] text-muted-foreground mt-1.5">
              Choose what you would like to create next.
            </p>
          </div>

          {/* Action groups */}
          <div className="space-y-4">
            {ACTION_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground/60 uppercase mb-2.5">
                  {group.label}
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {group.items.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        onClick={() => handleActionClick(action.modal)}
                        className={cn(
                          "group flex items-center gap-3.5 p-3.5 rounded-[14px] border border-border bg-white text-left",
                          "hover:border-primary hover:bg-primary/[0.04] transition-all duration-150"
                        )}
                      >
                        <div className={cn(
                          "w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-colors duration-150",
                          "bg-primary/[0.08] group-hover:bg-primary"
                        )}>
                          <Icon className="w-[18px] h-[18px] text-primary group-hover:text-accent transition-colors duration-150" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14.5px] font-semibold text-foreground leading-snug">
                            {action.label}
                          </p>
                          <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
                            {action.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Keyboard tip */}
          <div className="mt-5 pt-4 border-t flex items-center justify-center gap-1 text-[12.5px] text-muted-foreground/70 flex-wrap">
            <span>Tip: press</span>
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted border border-border text-[11px] font-mono font-medium mx-0.5">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted border border-border text-[11px] font-mono font-medium mx-0.5">
              N
            </kbd>
            <span>from anywhere to reopen this menu.</span>
          </div>
        </DialogContent>
      </Dialog>

      <ScheduleAppointmentDialog
        open={activeModal === "appointment"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <WalkInDialog
        open={activeModal === "walkin"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <AddCustomerDialog
        open={activeModal === "customer"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <AddServiceDialog
        open={activeModal === "service"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <AddProductDialog
        open={activeModal === "product"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <AddPackageDialog
        open={activeModal === "package"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <RecordPaymentDialog
        open={activeModal === "payment"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
      <InviteStaffDialog
        open={activeModal === "staff"}
        onOpenChange={(o) => !o && handleModalClose()}
      />
    </>
  );
}
