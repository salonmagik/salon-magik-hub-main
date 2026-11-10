import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
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
import { ShieldCheck } from "lucide-react";

type MarketingToggle = {
  id: string;
  feature_key: "waitlist_enabled" | "other_countries_interest_enabled";
  display_name: string;
  description: string | null;
  master_enabled: boolean;
  updated_at: string;
};

type PendingToggle = {
  id: string;
  featureKey: MarketingToggle["feature_key"];
  title: string;
  nextValue: boolean;
};

const MARKETING_KEYS = ["waitlist_enabled", "other_countries_interest_enabled"] as const;

const mapFeatureFlagWriteError = (error: any) => {
  const message = String(error?.message || "");
  if (message.includes("STEP_UP_REQUIRED")) return "Fresh 2FA verification is required.";
  if (message.includes("BACKOFFICE_SUPER_ADMIN_REQUIRED")) return "Only super admins can update feature toggles.";
  if (message.includes("FEATURE_NOT_FOUND")) return "Feature key was not found.";
  return message || "Action failed";
};

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const { backofficeUser, session } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [securityToken, setSecurityToken] = useState("");
  const [reason, setReason] = useState("");
  const [securityError, setSecurityError] = useState("");

  const { data: toggles = [], isLoading } = useQuery({
    queryKey: ["marketing-master-toggles"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("platform_features" as any)
        .select("id, feature_key, display_name, description, master_enabled, updated_at")
        .in("feature_key", [...MARKETING_KEYS])
        .order("feature_key", { ascending: true }) as any);
      if (error) throw error;
      return (data || []) as MarketingToggle[];
    },
  });

  const keyedToggles = useMemo(() => {
    const map = new Map<string, MarketingToggle>();
    toggles.forEach((toggle) => map.set(toggle.feature_key, toggle));
    return map;
  }, [toggles]);

  const waitlistToggle = keyedToggles.get("waitlist_enabled");
  const geoToggle = keyedToggles.get("other_countries_interest_enabled");

  const updateToggle = useMutation({
    mutationFn: async ({
      featureKey,
      nextValue,
      challengeId,
      writeReason,
    }: {
      featureKey: MarketingToggle["feature_key"];
      nextValue: boolean;
      challengeId: string;
      writeReason: string;
    }) => {
      const { error } = await (supabase.rpc as any)("backoffice_set_marketing_feature_toggle", {
        p_feature_key: featureKey,
        p_enabled: nextValue,
        p_reason: writeReason,
        p_challenge_id: challengeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-master-toggles"] });
      toast.success("Marketing feature toggle updated");
    },
    onError: (error: any) => {
      setSecurityError(mapFeatureFlagWriteError(error));
    },
  });

  const openToggleDialog = (toggle: MarketingToggle, nextValue: boolean) => {
    setPendingToggle({
      id: toggle.id,
      featureKey: toggle.feature_key,
      title: toggle.display_name,
      nextValue,
    });
    setReason("");
    setSecurityToken("");
    setSecurityError("");
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (!pendingToggle) return;
    if (!session?.access_token) {
      setSecurityError("Session expired. Please sign in again.");
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
        action: "feature_flag_write",
        resourceId: pendingToggle.id,
        accessToken: session.access_token,
      },
    });

    if (verify.error || !verify.data?.valid || !verify.data?.challengeId) {
      setSecurityError(verify.data?.error || verify.error?.message || "2FA verification failed");
      return;
    }

    await updateToggle.mutateAsync({
      featureKey: pendingToggle.featureKey,
      nextValue: pendingToggle.nextValue,
      challengeId: verify.data.challengeId,
      writeReason: reason.trim(),
    });

    setDialogOpen(false);
    setPendingToggle(null);
    setSecurityToken("");
    setReason("");
    setSecurityError("");
  };

  const rows = [waitlistToggle, geoToggle].filter(Boolean) as MarketingToggle[];

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="flex items-center justify-between max-w-[900px]">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight">Feature flags</h1>
            <p className="mt-[3px] text-[12.5px] text-muted-foreground">
              Platform-wide toggles that ship or hide a feature across every tenant — not tenant-specific entitlements, which live on the tenant's own plan.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            2FA required for writes
          </Badge>
        </div>

        <div className="backoffice-panel max-w-[900px] overflow-hidden">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading toggles...</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No feature flags configured yet.</p>
          ) : (
            rows.map((toggle, index) => (
              <div
                key={toggle.id}
                className={`flex items-center gap-3.5 px-5 py-4 ${index < rows.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold">{toggle.display_name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{toggle.description || "No description"}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    toggle.master_enabled ? "bg-success-bg text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {toggle.master_enabled ? "Live" : "Off"}
                </span>
                <Switch
                  checked={toggle.master_enabled}
                  disabled={!isSuperAdmin}
                  onCheckedChange={(checked) => openToggleDialog(toggle, checked)}
                />
              </div>
            ))
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Toggle Update</DialogTitle>
              <DialogDescription>
                {pendingToggle
                  ? `${pendingToggle.title} will be ${pendingToggle.nextValue ? "enabled" : "disabled"}.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
              <div className="space-y-2">
                <Label htmlFor="toggle-reason">Reason</Label>
                <Textarea
                  id="toggle-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why are you changing this toggle?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="toggle-token">2FA Token</Label>
                <input
                  id="toggle-token"
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
              <Button onClick={handleConfirm} disabled={updateToggle.isPending}>
                {updateToggle.isPending ? "Saving..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
