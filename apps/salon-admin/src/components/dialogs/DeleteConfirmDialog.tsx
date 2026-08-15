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
import { Input } from "@ui/input";
import { Loader2, AlertTriangle } from "lucide-react";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemCount?: number;
  onConfirm: () => void;
  isLoading?: boolean;
  description?: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  itemCount = 1,
  onConfirm,
  isLoading = false,
  description,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");

  const confirmRequired = itemCount > 1 ? "DELETE" : itemName;
  const isConfirmed = confirmText === confirmRequired;

  const handleConfirm = () => {
    onConfirm();
    setConfirmText("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setConfirmText("");
    onOpenChange(open);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[calc(100%_-_1.5rem)] gap-0 rounded-[22px] border-0 sm:max-w-[480px]">
        <AlertDialogHeader className="space-y-0 text-left">
          <div className="mb-4 flex items-center gap-2.5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={1.8} />
            <AlertDialogTitle className="text-[19px] font-normal tracking-[-0.2px] text-destructive">
              {itemCount > 1
                ? `Delete ${itemCount} Items?`
                : `Delete "${itemName}"?`}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-[14.5px] leading-[1.6]">
            {description ||
              "The item(s) will be removed from your catalog and your booking site. You can still restore deleted item(s) from Bin."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className={DIALOG_BODY_PADDING}>
          <Label htmlFor="confirm" className="mb-2.5 block text-[14.5px] font-normal text-[#141014]">
            Type{" "}
            <span className="rounded-md bg-[#f1ece3] px-2 py-[3px] font-mono text-[13.5px] font-normal">
              {confirmRequired}
            </span>{" "}
            to confirm
          </Label>
          <Input
            id="confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmRequired}
            autoComplete="off"
            className="h-auto rounded-lg border-[#141014]/10 px-3.5 py-3 text-[14.5px] shadow-none focus-visible:border-[#2e1f4e] focus-visible:ring-[#f2eefa]"
          />
        </div>

        <AlertDialogFooter className="gap-2.5 sm:space-x-0">
          <AlertDialogCancel
            className="h-11 rounded-full px-6 text-[14.5px] font-normal"
            disabled={isLoading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmed || isLoading}
            className="h-11 rounded-full bg-destructive px-[22px] text-[14.5px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:bg-white/10 disabled:text-white/40 disabled:opacity-100"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
