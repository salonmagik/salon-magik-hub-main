import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
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
  DialogTrigger,
} from "@ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { toast } from "sonner";
import { Clock, Plus, Trash2, WandSparkles } from "lucide-react";
import { format } from "date-fns";
import type { Database } from "@/lib/supabase";

type FeatureFlag = Database["public"]["Tables"]["feature_flags"]["Row"];
type FeatureFlagScope = Database["public"]["Enums"]["feature_flag_scope"];

type PlatformFeature = {
  id: string;
  feature_key: string;
  display_name: string;
  description: string | null;
  status: string;
  app_scope: string;
  default_enabled: boolean;
};

type FeatureFlagRule = {
  id: string;
  feature_id: string;
  environment: "dev" | "staging" | "prod";
  app_name: string;
  version_range: string | null;
  country_codes: string[] | null;
  priority: number;
  schedule_start: string | null;
  schedule_end: string | null;
  is_enabled: boolean;
  reason: string | null;
  created_at: string;
  feature?: PlatformFeature;
};

const SCOPE_LABELS: Record<FeatureFlagScope, string> = {
  platform: "Platform",
  app: "App",
  tenant: "Tenant",
  feature: "Feature",
};

const ENVIRONMENTS = ["dev", "staging", "prod"] as const;
const APPS = ["platform", "marketing", "salon_admin", "backoffice", "public_booking", "client_portal"];

interface FlagFormData {
  feature_id: string;
  scope: FeatureFlagScope;
  is_enabled: boolean;
  reason: string;
  schedule_start: string;
  schedule_end: string;
}

interface RuleFormData {
  feature_id: string;
  environment: "dev" | "staging" | "prod";
  app_name: string;
  version_range: string;
  country_codes: string;
  priority: number;
  is_enabled: boolean;
  reason: string;
  schedule_start: string;
  schedule_end: string;
}

const initialFlagForm: FlagFormData = {
  feature_id: "",
  scope: "feature",
  is_enabled: false,
  reason: "",
  schedule_start: "",
  schedule_end: "",
};

const initialRuleForm: RuleFormData = {
  feature_id: "",
  environment: "prod",
  app_name: "platform",
  version_range: "",
  country_codes: "",
  priority: 100,
  is_enabled: false,
  reason: "",
  schedule_start: "",
  schedule_end: "",
};

interface SecureActionState {
  title: string;
  description: string;
  resourceId: string;
  run: (challengeId: string) => Promise<void>;
}

const mapFeatureFlagWriteError = (error: any) => {
  const message = String(error?.message || "");
  if (message.includes("FEATURE_FLAG_CONFLICT")) {
    const detail = String(error?.details || error?.hint || "").trim();
    return detail
      ? `Conflicting feature is active (${detail}). Disable it first.`
      : "Conflicting feature is active. Disable it first.";
  }
  if (message.includes("STEP_UP_REQUIRED")) return "Fresh 2FA verification is required.";
  return message || "Action failed";
};

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const { backofficeUser, session } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [flagForm, setFlagForm] = useState<FlagFormData>(initialFlagForm);
  const [ruleForm, setRuleForm] = useState<RuleFormData>(initialRuleForm);
  const [evaluation, setEvaluation] = useState({
    featureKey: "",
    environment: "prod",
    appName: "platform",
    version: "",
    countryCode: "",
    tenantId: "",
    userId: "",
  });
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false);
  const [securityToken, setSecurityToken] = useState("");
  const [securityAction, setSecurityAction] = useState<SecureActionState | null>(null);
  const [securityError, setSecurityError] = useState("");
  const [isSecuritySubmitting, setIsSecuritySubmitting] = useState(false);

  const { data: features = [], isLoading: loadingFeatures } = useQuery({
    queryKey: ["platform-features"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_features" as any)
        .select("*")
        .neq("status", "deprecated")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data || []) as PlatformFeature[];
    },
  });

  const { data: flags = [], isLoading: loadingFlags } = useQuery({
    queryKey: ["backoffice-feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .order("scope", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as FeatureFlag[];
    },
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ["feature-flag-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flag_rules" as any)
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rulesData = (data || []) as FeatureFlagRule[];
      const featureById = new Map(features.map((feature) => [feature.id, feature]));
      return rulesData.map((rule) => ({ ...rule, feature: featureById.get(rule.feature_id) }));
    },
    enabled: features.length > 0,
  });

  const featureById = useMemo(() => new Map(features.map((feature) => [feature.id, feature])), [features]);
  const masterFlagByFeatureId = useMemo(() => {
    const map = new Map<string, FeatureFlag>();
    flags.forEach((flag) => {
      if (flag.feature_id) map.set(String(flag.feature_id), flag);
    });
    return map;
  }, [flags]);
  const hasAnyMasterEnabled = useMemo(
    () => flags.some((flag) => Boolean(flag.feature_id) && flag.is_enabled),
    [flags],
  );
  const selectedRuleFeatureMaster = ruleForm.feature_id ? masterFlagByFeatureId.get(ruleForm.feature_id) : null;
  const selectedRuleFeatureMasterEnabled = Boolean(selectedRuleFeatureMaster?.is_enabled);
  const isFlagFormValid = Boolean(flagForm.feature_id && flagForm.reason.trim());
  const isRuleFormValid = Boolean(
    ruleForm.feature_id &&
      ruleForm.app_name &&
      ruleForm.environment &&
      ruleForm.reason.trim(),
  );

  const openSecureAction = (action: SecureActionState) => {
    setSecurityAction(action);
    setSecurityToken("");
    setSecurityError("");
    setSecurityDialogOpen(true);
  };

  const handleSecurityConfirm = async () => {
    if (!securityAction) return;
    if (!session?.access_token) {
      setSecurityError("Session expired. Please sign in again.");
      return;
    }
    if (securityToken.trim().length !== 6) {
      setSecurityError("Enter your 6-digit TOTP code.");
      return;
    }

    setIsSecuritySubmitting(true);
    setSecurityError("");
    try {
      const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
        body: {
          token: securityToken.trim(),
          action: "feature_flag_write",
          resourceId: securityAction.resourceId,
          accessToken: session.access_token,
        },
      });

      if (verify.error || !verify.data?.valid || !verify.data?.challengeId) {
        throw new Error(verify.data?.error || verify.error?.message || "2FA verification failed");
      }

      await securityAction.run(verify.data.challengeId);
      setSecurityDialogOpen(false);
      setSecurityAction(null);
      setSecurityToken("");
    } catch (error: any) {
      setSecurityError(mapFeatureFlagWriteError(error));
    } finally {
      setIsSecuritySubmitting(false);
    }
  };

  const createFlag = useMutation({
    mutationFn: async (challengeId: string) => {
      const feature = featureById.get(flagForm.feature_id);
      if (!feature) throw new Error("Select a feature first.");

      const { error } = await (supabase.rpc as any)("backoffice_upsert_feature_master_toggle", {
        p_feature_id: feature.id,
        p_scope: flagForm.scope,
        p_is_enabled: flagForm.is_enabled,
        p_reason: flagForm.reason || null,
        p_schedule_start: flagForm.schedule_start || null,
        p_schedule_end: flagForm.schedule_end || null,
        p_challenge_id: challengeId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] });
      toast.success("Master toggle saved");
      setFlagForm(initialFlagForm);
      setFlagDialogOpen(false);
    },
    onError: (error: any) => toast.error(mapFeatureFlagWriteError(error)),
  });

  const createRule = useMutation({
    mutationFn: async (challengeId: string) => {
      if (!selectedRuleFeatureMasterEnabled) {
        throw new Error("Turn on master toggle first before creating rollout rules.");
      }
      const payload = {
        p_feature_id: ruleForm.feature_id,
        p_environment: ruleForm.environment,
        p_app_name: ruleForm.app_name,
        p_version_range: ruleForm.version_range || null,
        p_country_codes: ruleForm.country_codes
          ? ruleForm.country_codes
              .split(",")
              .map((code) => code.trim().toUpperCase())
              .filter(Boolean)
          : null,
        p_priority: ruleForm.priority,
        p_is_enabled: ruleForm.is_enabled,
        p_reason: ruleForm.reason || null,
        p_schedule_start: ruleForm.schedule_start || null,
        p_schedule_end: ruleForm.schedule_end || null,
        p_challenge_id: challengeId,
      };
      const { error } = await (supabase.rpc as any)("backoffice_create_feature_rule", payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flag-rules"] });
      toast.success("Feature rule created");
      setRuleForm(initialRuleForm);
      setRuleDialogOpen(false);
    },
    onError: (error: any) => toast.error(mapFeatureFlagWriteError(error)),
  });

  const toggleFlag = useMutation({
    mutationFn: async ({
      featureId,
      enabled,
      scope,
      reason,
      scheduleStart,
      scheduleEnd,
      challengeId,
    }: {
      featureId: string;
      enabled: boolean;
      scope: FeatureFlagScope;
      reason: string | null;
      scheduleStart: string | null;
      scheduleEnd: string | null;
      challengeId: string;
    }) => {
      const { error } = await (supabase.rpc as any)("backoffice_upsert_feature_master_toggle", {
        p_feature_id: featureId,
        p_scope: scope,
        p_is_enabled: enabled,
        p_reason: reason,
        p_schedule_start: scheduleStart,
        p_schedule_end: scheduleEnd,
        p_challenge_id: challengeId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backoffice-feature-flags"] }),
    onError: (error: any) => toast.error(mapFeatureFlagWriteError(error)),
  });

  const deleteRule = useMutation({
    mutationFn: async ({ id, challengeId }: { id: string; challengeId: string }) => {
      const { error } = await (supabase.rpc as any)("backoffice_delete_feature_rule", {
        p_rule_id: id,
        p_challenge_id: challengeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flag-rules"] });
      toast.success("Rule deleted");
    },
    onError: (error: any) => toast.error(mapFeatureFlagWriteError(error)),
  });

  const evaluateRule = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("evaluate_feature_flag", {
        p_feature_key: evaluation.featureKey,
        p_environment: evaluation.environment,
        p_app_name: evaluation.appName,
        p_version: evaluation.version || null,
        p_country_code: evaluation.countryCode || null,
        p_tenant_id: evaluation.tenantId || null,
        p_user_id: evaluation.userId || null,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
  });

  const isLoading = loadingFeatures || loadingFlags || loadingRules;

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground">Master toggles control global ON/OFF. Rules handle targeted rollout.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>Use this sequence for every new feature.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>1. Add feature key in code and migration (`platform_features`).</p>
            <p>2. Create/enable the master toggle for that key.</p>
            <p>3. Add rollout rules only when you need scoped targeting.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Master Toggles</CardTitle>
              <CardDescription>Global ON/OFF controls mapped to known platform feature keys.</CardDescription>
            </div>
            <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!isSuperAdmin}>
                  <Plus className="mr-2 h-4 w-4" /> Add Master Toggle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Master Toggle</DialogTitle>
                  <DialogDescription>Choose a registered feature key and set global ON/OFF behavior.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Feature</Label>
                    <Select value={flagForm.feature_id} onValueChange={(value) => setFlagForm((prev) => ({ ...prev, feature_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select feature" />
                      </SelectTrigger>
                      <SelectContent>
                        {features.map((feature) => (
                          <SelectItem key={feature.id} value={feature.id}>
                            {feature.display_name} ({feature.feature_key})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Scope</Label>
                      <Select value={flagForm.scope} onValueChange={(value) => setFlagForm((prev) => ({ ...prev, scope: value as FeatureFlagScope }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3 pt-8">
                      <Switch checked={flagForm.is_enabled} onCheckedChange={(checked) => setFlagForm((prev) => ({ ...prev, is_enabled: checked }))} />
                      <Label>Enabled</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea value={flagForm.reason} onChange={(e) => setFlagForm((prev) => ({ ...prev, reason: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Schedule Start</Label>
                      <Input type="datetime-local" value={flagForm.schedule_start} onChange={(e) => setFlagForm((prev) => ({ ...prev, schedule_start: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Schedule End</Label>
                      <Input type="datetime-local" value={flagForm.schedule_end} onChange={(e) => setFlagForm((prev) => ({ ...prev, schedule_end: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFlagDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() =>
                      openSecureAction({
                        title: "Confirm master toggle update",
                        description: "Enter your 2FA code to save this feature master toggle.",
                        resourceId: flagForm.feature_id,
                        run: async (challengeId) => {
                          await createFlag.mutateAsync(challengeId);
                        },
                      })
                    }
                    disabled={createFlag.isPending || !isFlagFormValid}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-center text-muted-foreground">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Feature Key</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schedule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map((flag) => {
                    const feature = flag.feature_id ? featureById.get(flag.feature_id as unknown as string) : null;
                    return (
                      <TableRow key={flag.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{feature?.display_name || flag.name}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{feature?.feature_key || flag.name}</TableCell>
                        <TableCell><Badge variant="secondary">{SCOPE_LABELS[flag.scope]}</Badge></TableCell>
                        <TableCell>
                          <Switch
                            checked={flag.is_enabled}
                            onCheckedChange={(checked) =>
                              openSecureAction({
                                title: "Confirm feature toggle",
                                description: `Enter your 2FA code to ${checked ? "enable" : "disable"} this master toggle.`,
                                resourceId: String(flag.feature_id || flag.id),
                                run: async (challengeId) => {
                                  await toggleFlag.mutateAsync({
                                    featureId: String(flag.feature_id),
                                    enabled: checked,
                                    scope: flag.scope,
                                    reason: flag.reason,
                                    scheduleStart: flag.schedule_start,
                                    scheduleEnd: flag.schedule_end,
                                    challengeId,
                                  });
                                },
                              })
                            }
                            disabled={!isSuperAdmin || !flag.feature_id}
                          />
                        </TableCell>
                        <TableCell>
                          {flag.schedule_start || flag.schedule_end ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {flag.schedule_start ? format(new Date(flag.schedule_start), "MMM d, HH:mm") : "-"}
                              {" -> "}
                              {flag.schedule_end ? format(new Date(flag.schedule_end), "MMM d, HH:mm") : "-"}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No schedule</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Rollout Rules (Overrides)</CardTitle>
              <CardDescription>Targeted overrides for environment, app, country, version, and priority.</CardDescription>
            </div>
            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!isSuperAdmin || !hasAnyMasterEnabled}><Plus className="mr-2 h-4 w-4" /> Add Rule</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Rule</DialogTitle>
                  <DialogDescription>Most specific + highest priority rule wins when master toggle is ON.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  {!hasAnyMasterEnabled && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Turn on at least one master toggle before creating rollout rules.
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label>Feature</Label>
                    <Select value={ruleForm.feature_id} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, feature_id: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select feature" /></SelectTrigger>
                      <SelectContent>
                        {features.map((feature) => (
                          <SelectItem key={feature.id} value={feature.id}>{feature.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {ruleForm.feature_id && !selectedRuleFeatureMasterEnabled && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Turn on master toggle first for this feature before adding rollout rules.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Environment</Label>
                      <Select value={ruleForm.environment} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, environment: value as RuleFormData["environment"] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ENVIRONMENTS.map((env) => <SelectItem key={env} value={env}>{env}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>App</Label>
                      <Select value={ruleForm.app_name} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, app_name: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{APPS.map((app) => <SelectItem key={app} value={app}>{app}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Version Range</Label>
                      <Input placeholder=">=1.8.0 <2.0.0" value={ruleForm.version_range} onChange={(e) => setRuleForm((prev) => ({ ...prev, version_range: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Country Codes</Label>
                      <Input placeholder="GH,NG" value={ruleForm.country_codes} onChange={(e) => setRuleForm((prev) => ({ ...prev, country_codes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Input type="number" min={0} value={ruleForm.priority} onChange={(e) => setRuleForm((prev) => ({ ...prev, priority: Number(e.target.value || 0) }))} />
                    </div>
                    <div className="flex items-center gap-3 pt-8">
                      <Switch checked={ruleForm.is_enabled} onCheckedChange={(checked) => setRuleForm((prev) => ({ ...prev, is_enabled: checked }))} />
                      <Label>Enabled</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea value={ruleForm.reason} onChange={(e) => setRuleForm((prev) => ({ ...prev, reason: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() =>
                      openSecureAction({
                        title: "Confirm rollout rule creation",
                        description: "Enter your 2FA code to create this rollout rule.",
                        resourceId: ruleForm.feature_id,
                        run: async (challengeId) => {
                          await createRule.mutateAsync(challengeId);
                        },
                      })
                    }
                    disabled={createRule.isPending || !isRuleFormValid || !selectedRuleFeatureMasterEnabled}
                  >
                    Create Rule
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <p className="font-medium">{rule.feature?.display_name || rule.feature_id}</p>
                      <p className="text-xs text-muted-foreground">{rule.feature?.feature_key || ""}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{rule.environment} / {rule.app_name}</p>
                      <p className="text-xs text-muted-foreground">{rule.country_codes?.join(",") || "all countries"}</p>
                    </TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_enabled ? "default" : "secondary"}>{rule.is_enabled ? "Enabled" : "Disabled"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!isSuperAdmin || deleteRule.isPending}
                        onClick={() =>
                          openSecureAction({
                            title: "Confirm rule deletion",
                            description: "Enter your 2FA code to delete this rollout rule.",
                            resourceId: rule.id,
                            run: async (challengeId) => {
                              await deleteRule.mutateAsync({ id: rule.id, challengeId });
                            },
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WandSparkles className="h-5 w-5" />Rule Simulator</CardTitle>
            <CardDescription>Test which rule wins for a given app context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
              <Input placeholder="feature_key" value={evaluation.featureKey} onChange={(e) => setEvaluation((prev) => ({ ...prev, featureKey: e.target.value }))} />
              <Select value={evaluation.environment} onValueChange={(value) => setEvaluation((prev) => ({ ...prev, environment: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENVIRONMENTS.map((env) => <SelectItem key={env} value={env}>{env}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={evaluation.appName} onValueChange={(value) => setEvaluation((prev) => ({ ...prev, appName: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APPS.map((app) => <SelectItem key={app} value={app}>{app}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="version e.g. 1.8.2" value={evaluation.version} onChange={(e) => setEvaluation((prev) => ({ ...prev, version: e.target.value }))} />
              <Input placeholder="country e.g. GH" value={evaluation.countryCode} onChange={(e) => setEvaluation((prev) => ({ ...prev, countryCode: e.target.value.toUpperCase() }))} />
              <Input placeholder="tenant_id (optional)" value={evaluation.tenantId} onChange={(e) => setEvaluation((prev) => ({ ...prev, tenantId: e.target.value }))} />
              <Input placeholder="user_id (optional)" value={evaluation.userId} onChange={(e) => setEvaluation((prev) => ({ ...prev, userId: e.target.value }))} />
            </div>
            <Button onClick={() => evaluateRule.mutate()} disabled={evaluateRule.isPending || !evaluation.featureKey}>Evaluate</Button>
            {evaluateRule.data && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p><strong>Enabled:</strong> {String(evaluateRule.data.enabled)}</p>
                <p>
                  <strong>Source:</strong>{" "}
                  {evaluateRule.data.matched_reason === "feature_not_found"
                    ? "feature_not_found"
                    : evaluateRule.data.matched_reason === "master_disabled"
                      ? "master_disabled"
                      : evaluateRule.data.matched_rule_id
                        ? "rule_match"
                        : "default_fallback"}
                </p>
                <p><strong>Rule:</strong> {evaluateRule.data.matched_rule_id || "default"}</p>
                <p><strong>Priority:</strong> {evaluateRule.data.matched_priority ?? "-"}</p>
                <p><strong>Reason:</strong> {evaluateRule.data.matched_reason || "-"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={securityDialogOpen} onOpenChange={setSecurityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{securityAction?.title || "Confirm action"}</DialogTitle>
            <DialogDescription>
              {securityAction?.description || "Enter your 2FA code to continue."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="featureFlagTotp">2FA code</Label>
            <Input
              id="featureFlagTotp"
              value={securityToken}
              maxLength={6}
              onChange={(event) => setSecurityToken(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="123456"
            />
            {securityError && <p className="text-sm text-destructive">{securityError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSecurityConfirm} disabled={isSecuritySubmitting || securityToken.length !== 6}>
              {isSecuritySubmitting ? "Verifying..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
