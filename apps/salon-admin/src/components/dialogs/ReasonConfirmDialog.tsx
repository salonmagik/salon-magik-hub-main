import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ui/alert-dialog";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@shared/utils";

interface ReasonConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  variant?: "default" | "destructive";
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
  itemsList?: string[];
}

export function ReasonConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  reasonLabel = "Reason",
  reasonPlaceholder = "Enter a reason...",
  reasonRequired = true,
  variant = "default",
  onConfirm,
  isLoading = false,
  itemsList,
}: ReasonConfirmDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason);
    setReason("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setReason("");
    onOpenChange(open);
  };

  const isDisabled = reasonRequired && !reason.trim();

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {itemsList && itemsList.length > 0 && (
          <div className="my-2 max-h-32 overflow-y-auto">
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {itemsList.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="py-4 space-y-2">
          <Label htmlFor="reason">
            {reasonLabel}
            {reasonRequired && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Textarea
            id="reason"
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDisabled || isLoading}
            className={cn(
              variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
