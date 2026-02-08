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
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle className="text-destructive">
              {itemCount > 1
                ? `Permanently Delete ${itemCount} Items?`
                : `Permanently Delete "${itemName}"?`}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {description ||
              "This action cannot be undone. The item(s) will be permanently removed from your catalog and all historical data."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-2">
          <Label htmlFor="confirm">
            Type{" "}
            <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">
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
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmed || isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete Permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
