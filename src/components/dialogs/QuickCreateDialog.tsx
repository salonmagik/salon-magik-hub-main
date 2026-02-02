import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Users,
  Scissors,
  CreditCard,
  UserPlus,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  onClick: () => void;
}

export function QuickCreateDialog({ open, onOpenChange }: QuickCreateDialogProps) {
  const actions: QuickAction[] = [
    {
      icon: Calendar,
      label: "New Appointment",
      description: "Schedule a new appointment",
      color: "text-primary",
      bgColor: "bg-primary/10 hover:bg-primary/20",
      onClick: () => {
        onOpenChange(false);
        // TODO: Open appointment modal
      },
    },
    {
      icon: Users,
      label: "Walk-in",
      description: "Add a walk-in customer",
      color: "text-warning-foreground",
      bgColor: "bg-warning-bg hover:bg-warning-bg/80",
      onClick: () => {
        onOpenChange(false);
        // TODO: Open walk-in modal
      },
    },
    {
      icon: UserPlus,
      label: "Add Customer",
      description: "Create a new customer profile",
      color: "text-success",
      bgColor: "bg-success/10 hover:bg-success/20",
      onClick: () => {
        onOpenChange(false);
        // TODO: Open customer modal
      },
    },
    {
      icon: Scissors,
      label: "New Service",
      description: "Add a new service to your catalog",
      color: "text-purple-600",
      bgColor: "bg-purple-50 hover:bg-purple-100",
      onClick: () => {
        onOpenChange(false);
        // TODO: Open service modal
      },
    },
    {
      icon: CreditCard,
      label: "Record Payment",
      description: "Log a payment transaction",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 hover:bg-emerald-100",
      onClick: () => {
        onOpenChange(false);
        // TODO: Open payment modal
      },
    },
    {
      icon: UserCog,
      label: "Add Staff Member",
      description: "Invite a new team member",
      color: "text-rose-600",
      bgColor: "bg-rose-50 hover:bg-rose-100",
      onClick: () => {
        onOpenChange(false);
        // TODO: Open staff modal
      },
    },
  ];

  return (
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
                onClick={action.onClick}
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
  );
}
