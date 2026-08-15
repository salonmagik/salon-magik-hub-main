import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
import { Textarea } from "@ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { toast } from "sonner";
import { ShieldCheck, Percent } from "lucide-react";
import { format } from "date-fns";

interface PaymentFeeSettings {
  default_platform_service_charge_percentage: number;
  customer_facing_fee_percentage: number;
}

const mapWriteError = (error: any) => {
  const message = String(error?.message || "");
  if (message.includes("STEP_UP_REQUIRED")) return "Fresh 2FA verification is required.";
  if (message.includes("BACKOFFICE_SUPER_ADMIN_REQUIRED")) return "Only super admins can update fee settings.";
  if (message.includes("INVALID_PERCENTAGE")) return "Percentages must be between 0 and 20.";
  if (message.includes("REASON_REQUIRED")) return "Reason is required for audit logging.";
  return message || "Action failed";
};

export default function FeesMarginsPage() {
  const queryClient = useQueryClient();
  const { backofficeUser, session } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pscInput, setPscInput] = useState("");
  const [cffInput, setCffInput] = useState("");
  const [reason, setReason] = useState("");
  const [securityToken, setSecurityToken] = useState("");
  const [securityError, setSecurityError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings", "payment_fee_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("id, value, updated_at")
        .eq("key", "payment_fee_settings")
        .single();
      if (error) throw error;
      return data as unknown as { id: string; value: PaymentFeeSettings; updated_at: string };
    },
  });

  const settings = data?.value;

  const updateSettings = useMutation({
    mutationFn: async ({
      defaultPsc,
      cff,
      challengeId,
      writeReason,
    }: {
      defaultPsc: number;
      cff: number;
      challengeId: string;
      writeReason: string;
    }) => {
      const { error } = await (supabase.rpc as any)("backoffice_update_payment_fee_settings", {
        p_default_platform_service_charge_percentage: defaultPsc,
        p_customer_facing_fee_percentage: cff,
        p_reason: writeReason,
        p_challenge_id: challengeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "payment_fee_settings"] });
      toast.success("Fee settings updated");
    },
    onError: (error: any) => {
      setSecurityError(mapWriteError(error));
    },
  });

  const openDialog = () => {
    setPscInput(String(settings?.default_platform_service_charge_percentage ?? ""));
    setCffInput(String(settings?.customer_facing_fee_percentage ?? ""));
    setReason("");
    setSecurityToken("");
    setSecurityError("");
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (!session?.access_token || !data?.id) {
      setSecurityError("Session expired. Please sign in again.");
      return;
    }
    const psc = Number(pscInput);
    const cff = Number(cffInput);
    if (!Number.isFinite(psc) || psc < 0 || psc > 20 || !Number.isFinite(cff) || cff < 0 || cff > 20) {
      setSecurityError("Enter valid percentages between 0 and 20.");
      return;
    }
    if (securityToken.trim().length !== 6) {
      setSecurityError("Enter your 6-digit 2FA code.");
      return;
    }
    if (!reason.trim()) {
      setSecurityError("Reason is required for audit logging.");
      return;
    }

    const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
      body: {
        token: securityToken.trim(),
        action: "payment_fee_settings_write",
        resourceId: data.id,
        accessToken: session.access_token,
      },
    });

    if (verify.error || !verify.data?.valid || !verify.data?.challengeId) {
      setSecurityError(verify.data?.error || verify.error?.message || "2FA verification failed");
      return;
    }

    await updateSettings.mutateAsync({
      defaultPsc: psc,
      cff,
      challengeId: verify.data.challengeId,
      writeReason: reason.trim(),
    });

    setDialogOpen(false);
  };

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fees & Margins</h1>
            <p className="text-muted-foreground">
              The two percentages that determine how much of a booking payment the salon keeps vs. Salon Magik.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            2FA required for writes
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Booking Payment Fees</CardTitle>
            <CardDescription>
              Applied to every Paystack-split booking and invoice payment. Paystack's own card-processing fee is separate
              and always billed to the customer automatically — nothing to configure here for that part.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <p className="py-6 text-center text-muted-foreground">Loading...</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Percent className="h-4 w-4" />
                    Default Platform Service Charge
                  </div>
                  <p className="text-2xl font-semibold">
                    {settings?.default_platform_service_charge_percentage ?? "—"}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Used when a new salon's payout subaccount is created. Normally deducted from the salon's share; a
                    salon can flip a Business Settings toggle to push it onto the customer instead.
                  </p>
                </div>
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Percent className="h-4 w-4" />
                    Customer-Facing Fee
                  </div>
                  <p className="text-2xl font-semibold">{settings?.customer_facing_fee_percentage ?? "—"}%</p>
                  <p className="text-xs text-muted-foreground">
                    Charged to every customer on every booking payment, regardless of the salon's service-charge choice.
                    Goes entirely to Salon Magik.
                  </p>
                </div>
              </div>
            )}
            {data?.updated_at && (
              <p className="text-xs text-muted-foreground">
                Last updated {format(new Date(data.updated_at), "MMM d, yyyy HH:mm")}
              </p>
            )}
            <Button onClick={openDialog} disabled={!isSuperAdmin || isLoading}>
              Edit fee settings
            </Button>
            {!isSuperAdmin && (
              <p className="text-xs text-muted-foreground">Only super admins can edit fee settings.</p>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Fee Settings</DialogTitle>
              <DialogDescription>
                This changes platform-wide defaults. Existing salon subaccounts already created keep their own stored
                percentage unless separately edited.
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
              <div className="space-y-2">
                <Label htmlFor="psc-input">Default Platform Service Charge (%)</Label>
                <Input
                  id="psc-input"
                  type="number"
                  min={0}
                  max={20}
                  step="0.1"
                  value={pscInput}
                  onChange={(event) => setPscInput(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cff-input">Customer-Facing Fee (%)</Label>
                <Input
                  id="cff-input"
                  type="number"
                  min={0}
                  max={20}
                  step="0.1"
                  value={cffInput}
                  onChange={(event) => setCffInput(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee-reason">Reason</Label>
                <Textarea
                  id="fee-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why are you changing this?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee-token">2FA Token</Label>
                <input
                  id="fee-token"
                  value={securityToken}
                  onChange={(event) => setSecurityToken(event.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                />
              </div>
              {securityError ? <p className="text-sm text-destructive">{securityError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={updateSettings.isPending}>
                {updateSettings.isPending ? "Saving..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
