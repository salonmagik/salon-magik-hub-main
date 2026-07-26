import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Textarea } from "@ui/textarea";
import { Label } from "@ui/label";
import { CheckCircle2, Loader2, RotateCcw, TriangleAlert, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Stage = "reason" | "confirm" | "submitting" | "success" | "error";

export function RejectRefundDialog({
  open,
  onOpenChange,
  requestId,
  customerName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  customerName?: string;
  onSuccess?: (requestId: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("reason");
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setStage("reason");
    setReason("");
    setErrorMessage("");
  }, [open, requestId]);

  const reject = async () => {
    if (!requestId || !reason.trim()) return;
    setStage("submitting");
    const { error } = await supabase.rpc("reject_transaction_refund" as never, {
      p_request_id: requestId,
      p_reason: reason.trim(),
    } as never);
    if (error) {
      setErrorMessage(error.message);
      setStage("error");
      return;
    }
    setStage("success");
    onSuccess?.(requestId);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => stage !== "submitting" && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {stage === "success" || stage === "error" ? (
          <div className="py-8 text-center">
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${stage === "success" ? "bg-success/10" : "bg-destructive/10"}`}>
              {stage === "success"
                ? <CheckCircle2 className="h-7 w-7 text-success" />
                : <TriangleAlert className="h-7 w-7 text-destructive" />}
            </div>
            <DialogTitle>{stage === "success" ? "Request rejected" : "Request wasn’t rejected"}</DialogTitle>
            <DialogDescription className="mt-2">
              {stage === "success"
                ? `${customerName || "The requester"} can see the updated refund status.`
                : errorMessage}
            </DialogDescription>
            <div className="mt-6 flex gap-2">
              {stage === "error" && (
                <Button variant="outline" className="flex-1" onClick={() => setStage("reason")}>
                  <RotateCcw className="mr-2 h-4 w-4" />Try again
                </Button>
              )}
              <Button className="flex-1" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : stage === "submitting" ? (
          <div className="flex flex-col items-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Rejecting request…</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle>{stage === "confirm" ? "Confirm rejection" : "Reject refund request"}</DialogTitle>
              <DialogDescription>
                {stage === "confirm"
                  ? "The reserved refund amount will become available for another request."
                  : "Give the staff member and customer a clear reason for this decision."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {stage === "reason" ? (
                <div className="space-y-2">
                  <Label htmlFor="refund-rejection-reason">Reason</Label>
                  <Textarea
                    id="refund-rejection-reason"
                    rows={4}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is this request being rejected?"
                  />
                </div>
              ) : (
                <div className="rounded-xl border bg-surface p-4 text-sm">{reason}</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => stage === "confirm" ? setStage("reason") : onOpenChange(false)}>
                {stage === "confirm" ? "Back" : "Cancel"}
              </Button>
              <Button
                variant="destructive"
                disabled={!reason.trim()}
                onClick={() => stage === "confirm" ? void reject() : setStage("confirm")}
              >
                {stage === "confirm" ? "Reject request" : "Continue"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
