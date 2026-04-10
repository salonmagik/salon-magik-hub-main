import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription } from "@ui/alert";
import {
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
  Mail,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";

interface SetSenderNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSenderId: string | null;
  currentStatus: "not_set" | "pending" | "approved" | "rejected";
  onStatusChange?: () => void;
}

export function SetSenderNameDialog({
  open,
  onOpenChange,
  currentSenderId,
  currentStatus,
  onStatusChange,
}: SetSenderNameDialogProps) {
  const { currentTenant } = useAuth();
  const [senderId, setSenderId] = useState(currentSenderId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const canEdit = currentStatus === "not_set" || currentStatus === "rejected";
  const charCount = senderId.length;
  const isValidLength = charCount >= 3 && charCount <= 11;
  const isAlphanumeric = /^[a-zA-Z0-9]*$/.test(senderId);
  const isValid = isValidLength && isAlphanumeric && senderId.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid sender name (3-11 alphanumeric characters)",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-termii-sender-id/request", {
        body: {
          senderId: senderId.trim(),
        },
      });

      if (error) {
        console.error("Error submitting sender ID:", error);
        toast({
          title: "Submission Failed",
          description: error.message || "Failed to submit sender ID request",
          variant: "destructive",
        });
        return;
      }

      if (data?.error) {
        toast({
          title: "Submission Failed",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sender ID Submitted",
        description: "Your sender ID has been submitted for approval. This usually takes 1-2 business days.",
      });

      // Trigger refetch
      if (onStatusChange) {
        onStatusChange();
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Error:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-termii-sender-id/status");

      if (error) {
        console.error("Error checking status:", error);
        toast({
          title: "Status Check Failed",
          description: error.message || "Failed to check sender ID status",
          variant: "destructive",
        });
        return;
      }

      if (data?.error) {
        toast({
          title: "Status Check Failed",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const statusMessage =
        data.status === "approved"
          ? "Your sender ID has been approved and is now active!"
          : data.status === "pending"
          ? "Your sender ID is still pending approval"
          : data.status === "rejected"
          ? "Your sender ID was rejected. You can submit a new request."
          : "Status unknown";

      toast({
        title: "Status Updated",
        description: statusMessage,
        variant: data.status === "approved" ? "default" : "destructive",
      });

      // Trigger refetch
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (err) {
      console.error("Error:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>SMS Sender Name Configuration</DialogTitle>
          <DialogDescription>
            Configure your business name that appears as the sender of SMS messages
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Display */}
          {currentStatus === "pending" && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Pending Approval</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your sender ID <strong>{currentSenderId}</strong> is awaiting approval from
                      Termii. This usually takes 1-2 business days.
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {currentStatus === "approved" && (
            <Alert className="bg-success/10 border-success/20">
              <CheckCircle className="h-4 w-4 text-success" />
              <AlertDescription>
                <p className="font-medium text-success">Sender ID Approved</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your sender name is set to <strong>{currentSenderId}</strong> and cannot be
                  changed.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  To change your sender name, please contact{" "}
                  <a
                    href="mailto:support@salonmagik.com"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    support@salonmagik.com
                    <Mail className="h-3 w-3" />
                  </a>
                </p>
              </AlertDescription>
            </Alert>
          )}

          {currentStatus === "rejected" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Sender ID Rejected</p>
                <p className="text-sm mt-1">
                  Your previous sender ID <strong>{currentSenderId}</strong> was rejected. You can
                  submit a new request below.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Form - Only show if can edit */}
          {canEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="senderId">
                  Sender Name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="senderId"
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value.toUpperCase())}
                    placeholder="e.g., MYSHOP"
                    maxLength={11}
                    className={
                      senderId && !isValid ? "border-destructive focus-visible:ring-destructive" : ""
                    }
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {charCount}/11
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>Must be 3-11 alphanumeric characters (no spaces or special characters)</p>
                    {!isAlphanumeric && senderId && (
                      <p className="text-destructive mt-1">
                        Only letters and numbers are allowed
                      </p>
                    )}
                    {!isValidLength && senderId && (
                      <p className="text-destructive mt-1">
                        Must be between 3 and 11 characters
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Important:</strong> Once approved, your sender name cannot be changed.
                  Choose carefully!
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!isValid || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit for Approval
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {/* Actions for pending status */}
          {currentStatus === "pending" && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleCheckStatus}
                disabled={isCheckingStatus}
                variant="outline"
                className="flex-1"
              >
                {isCheckingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Check Status
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}

          {/* Actions for approved status */}
          {currentStatus === "approved" && (
            <div className="flex justify-end pt-2">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}

          {/* Documentation link */}
          <div className="pt-2 border-t">
            <a
              href="https://developer.termii.com/sender-id"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Learn more about Termii Sender IDs
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
