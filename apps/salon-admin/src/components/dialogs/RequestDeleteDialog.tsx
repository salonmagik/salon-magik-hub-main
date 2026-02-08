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
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@ui/alert";

interface RequestDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{ id: string; name: string; type: string }>;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
}

export function RequestDeleteDialog({
  open,
  onOpenChange,
  items,
  onSubmit,
  isLoading = false,
}: RequestDeleteDialogProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    onSubmit(reason);
    setReason("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setReason("");
    onOpenChange(open);
  };

  const isDisabled = !reason.trim();

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Request Deletion</AlertDialogTitle>
          <AlertDialogDescription>
            You're requesting deletion of {items.length} item{items.length !== 1 ? "s" : ""}:
          </AlertDialogDescription>
        </AlertDialogHeader>

        {items.length > 0 && (
          <div className="my-2 max-h-32 overflow-y-auto">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id}>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground ml-1">({item.type})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="py-4 space-y-2">
          <Label htmlFor="reason">
            Reason for deletion <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reason"
            placeholder="e.g., No longer offered at this location..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <Alert variant="default" className="border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription>
            An owner must approve this request before the items are removed.
          </AlertDescription>
        </Alert>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={isDisabled || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit Request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
