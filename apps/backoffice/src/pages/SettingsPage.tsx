import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { toast } from "sonner";
import { AlertTriangle, Globe2, Lock, Power, ShieldAlert } from "lucide-react";
import type { Json } from "@/lib/supabase";

type LegalStatus = "planned" | "legal_approved" | "active" | "paused";

interface MarketCountry {
  country_code: string;
  country_name: string;
  is_selectable: boolean;
  legal_status: LegalStatus;
  go_live_at: string | null;
  notes: string | null;
  updated_at: string;
}

interface MarketCountryCurrency {
  id: string;
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_enabled: boolean;
}

interface KillSwitchValue {
  enabled: boolean;
  reason: string | null;
  enabled_at: string | null;
  enabled_by: string | null;
}

const LEGAL_STATUS_OPTIONS: { value: LegalStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "legal_approved", label: "Legal Approved" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
];

const COMMON_CURRENCIES = ["USD", "GHS", "NGN", "KES", "ZAR", "GBP", "EUR"];

function parseKillSwitch(value: Json | null): KillSwitchValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false, reason: null, enabled_at: null, enabled_by: null };
  }
  const obj = value as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    reason: typeof obj.reason === "string" ? obj.reason : null,
    enabled_at: typeof obj.enabled_at === "string" ? obj.enabled_at : null,
    enabled_by: typeof obj.enabled_by === "string" ? obj.enabled_by : null,
  };
}

async function writeAuditLog(action: string, actorId: string | undefined, metadata: Record<string, unknown>) {
  const { error } = await supabase.from("audit_logs").insert({
    action,
    entity_type: "platform_settings",
    entity_id: null,
    actor_user_id: actorId,
    metadata,
  });

  if (error) throw error;
}

export default function BackofficeSettingsPage() {
  const queryClient = useQueryClient();
  const { backofficeUser, profile } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [killSwitchDialogOpen, setKillSwitchDialogOpen] = useState(false);
  const [killSwitchReason, setKillSwitchReason] = useState("");
  const [pendingKillSwitchState, setPendingKillSwitchState] = useState(false);

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("GH");
  const [newCurrencyCode, setNewCurrencyCode] = useState("USD");
  const [notesDraft, setNotesDraft] = useState("");
  const [trialDaysDraft, setTrialDaysDraft] = useState(14);

  const { data: killSwitch, isLoading: killSwitchLoading } = useQuery({
    queryKey: ["platform-settings", "kill_switch"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("key", "kill_switch")
        .single();
      if (error) throw error;
      return parseKillSwitch(data?.value ?? null);
    },
  });

  const { data: marketCountries = [], isLoading: marketsLoading } = useQuery({
    queryKey: ["market-countries-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_countries" as any)
        .select("*")
        .order("country_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MarketCountry[];
    },
  });

  const { data: defaultTrialDays } = useQuery({
    queryKey: ["platform-settings", "default_trial_days"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "default_trial_days")
        .maybeSingle();
      if (error) throw error;
      const parsed = Number((data?.value as any)?.days);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 14;
    },
  });

  useEffect(() => {
    if (typeof defaultTrialDays === "number") {
      setTrialDaysDraft(defaultTrialDays);
    }
  }, [defaultTrialDays]);

  const { data: marketCurrencies = [], isLoading: currenciesLoading } = useQuery({
    queryKey: ["market-country-currencies-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_country_currency" as any)
        .select("*")
        .order("country_code", { ascending: true })
        .order("currency_code", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MarketCountryCurrency[];
    },
  });

  const selectedCountry = useMemo(
    () => marketCountries.find((country) => country.country_code === selectedCountryCode) || null,
    [marketCountries, selectedCountryCode]
  );

  const selectedCountryCurrencies = useMemo(
    () => marketCurrencies.filter((currency) => currency.country_code === selectedCountryCode),
    [marketCurrencies, selectedCountryCode]
  );

  const selectableCountries = useMemo(
    () => marketCountries.filter((country) => country.is_selectable).length,
    [marketCountries]
  );

  const toggleKillSwitchMutation = useMutation({
    mutationFn: async ({ enabled, reason }: { enabled: boolean; reason: string }) => {
      const newValue: Record<string, Json> = {
        enabled,
        reason: enabled ? reason : null,
        enabled_at: enabled ? new Date().toISOString() : null,
        enabled_by: enabled ? profile?.full_name || backofficeUser?.user_id || null : null,
      };

      const { error } = await supabase
        .from("platform_settings")
        .update({
          value: newValue,
          updated_by_id: backofficeUser?.user_id,
        })
        .eq("key", "kill_switch");

      if (error) throw error;

      await writeAuditLog(enabled ? "kill_switch_enabled" : "kill_switch_disabled", backofficeUser?.user_id, {
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "kill_switch"] });
      toast.success(
        pendingKillSwitchState
          ? "Kill switch enabled - platform is now in read-only mode"
          : "Kill switch disabled - platform is back to normal"
      );
      setKillSwitchDialogOpen(false);
      setKillSwitchReason("");
    },
    onError: (error: Error) => {
      toast.error("Failed to toggle kill switch: " + error.message);
    },
  });

  const updateDefaultTrialDaysMutation = useMutation({
    mutationFn: async (days: number) => {
      const safeDays = Math.max(0, Math.floor(days));
      const { error } = await supabase
        .from("platform_settings")
        .upsert(
          {
            key: "default_trial_days",
            value: { days: safeDays } as Json,
            description: "Global default trial period in days",
            updated_by_id: backofficeUser?.user_id,
          } as any,
          { onConflict: "key" }
        );
      if (error) throw error;

      await writeAuditLog("default_trial_days_updated", backofficeUser?.user_id, { days: safeDays });
      return safeDays;
    },
    onSuccess: (days) => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "default_trial_days"] });
      setTrialDaysDraft(days);
      toast.success("Default trial period updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update default trial period"),
  });

  const updateCountryMutation = useMutation({
    mutationFn: async ({
      countryCode,
      isSelectable,
      legalStatus,
      notes,
    }: {
      countryCode: string;
      isSelectable: boolean;
      legalStatus: LegalStatus;
      notes: string;
    }) => {
      const goLiveAt = legalStatus === "active" && selectedCountry?.go_live_at == null ? new Date().toISOString() : selectedCountry?.go_live_at;
      const { error } = await supabase
        .from("market_countries" as any)
        .update({
          is_selectable: isSelectable,
          legal_status: legalStatus,
          go_live_at: goLiveAt,
          notes: notes.trim() || null,
        } as any)
        .eq("country_code", countryCode);
      if (error) throw error;

      await writeAuditLog("market_country_updated", backofficeUser?.user_id, {
        country_code: countryCode,
        is_selectable: isSelectable,
        legal_status: legalStatus,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-countries-admin"] });
      toast.success("Market updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update market"),
  });

  const upsertCurrencyMutation = useMutation({
    mutationFn: async ({ countryCode, currencyCode }: { countryCode: string; currencyCode: string }) => {
      const normalizedCode = currencyCode.trim().toUpperCase();
      if (!normalizedCode) throw new Error("Currency code is required");

      const { error } = await supabase
        .from("market_country_currency" as any)
        .upsert(
          {
            country_code: countryCode,
            currency_code: normalizedCode,
            is_enabled: true,
            is_default: false,
          } as any,
          { onConflict: "country_code,currency_code" }
        );

      if (error) throw error;

      await writeAuditLog("market_currency_upserted", backofficeUser?.user_id, {
        country_code: countryCode,
        currency_code: normalizedCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Currency added");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to add currency"),
  });

  const setDefaultCurrencyMutation = useMutation({
    mutationFn: async ({ countryCode, currencyCode }: { countryCode: string; currencyCode: string }) => {
      const { error: resetError } = await supabase
        .from("market_country_currency" as any)
        .update({ is_default: false } as any)
        .eq("country_code", countryCode);
      if (resetError) throw resetError;

      const { error: setError } = await supabase
        .from("market_country_currency" as any)
        .update({ is_default: true, is_enabled: true } as any)
        .eq("country_code", countryCode)
        .eq("currency_code", currencyCode);

      if (setError) throw setError;

      await writeAuditLog("market_default_currency_updated", backofficeUser?.user_id, {
        country_code: countryCode,
        currency_code: currencyCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Default currency updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to set default currency"),
  });

  const toggleCurrencyMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { data, error } = await supabase
        .from("market_country_currency" as any)
        .update({ is_enabled: isEnabled } as any)
        .eq("id", id)
        .select("country_code,currency_code")
        .single();

      if (error) throw error;

      await writeAuditLog("market_currency_toggled", backofficeUser?.user_id, {
        country_code: data.country_code,
        currency_code: data.currency_code,
        is_enabled: isEnabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Currency updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update currency"),
  });

  const handleKillSwitchToggle = (checked: boolean) => {
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can control the kill switch");
      return;
    }
    setPendingKillSwitchState(checked);
    setKillSwitchDialogOpen(true);
  };

  const confirmKillSwitch = () => {
    if (pendingKillSwitchState && !killSwitchReason.trim()) {
      toast.error("A reason is required to enable the kill switch");
      return;
    }
    toggleKillSwitchMutation.mutate({
      enabled: pendingKillSwitchState,
      reason: killSwitchReason,
    });
  };

  const saveMarketDetails = () => {
    if (!selectedCountry) return;
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can update markets");
      return;
    }
    updateCountryMutation.mutate({
      countryCode: selectedCountry.country_code,
      isSelectable: selectedCountry.is_selectable,
      legalStatus: selectedCountry.legal_status,
      notes: notesDraft,
    });
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Platform-wide controls, markets, and environment governance.</p>
        </div>

        <Tabs defaultValue="operations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="markets">Markets</TabsTrigger>
          </TabsList>

          <TabsContent value="operations" className="space-y-6">
            {killSwitch?.enabled && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Kill Switch Active</AlertTitle>
                <AlertDescription>
                  The platform is currently in read-only mode.
                  {killSwitch.reason && <span className="mt-1 block">Reason: {killSwitch.reason}</span>}
                  {killSwitch.enabled_at && (
                    <span className="mt-1 block text-xs">
                      Enabled on {new Date(killSwitch.enabled_at).toLocaleString()}
                      {killSwitch.enabled_by && ` by ${killSwitch.enabled_by}`}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Card className={killSwitch?.enabled ? "border-destructive" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${
                        killSwitch?.enabled ? "bg-destructive/10 text-destructive" : "bg-muted"
                      }`}
                    >
                      <Power className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>Kill Switch</CardTitle>
                      <CardDescription>Emergency read-only mode for the entire platform</CardDescription>
                    </div>
                  </div>
                  <Badge variant={killSwitch?.enabled ? "destructive" : "secondary"}>
                    {killSwitch?.enabled ? "ACTIVE" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Enable Kill Switch</p>
                    <p className="text-sm text-muted-foreground">
                      When enabled, all write operations are blocked platform-wide.
                    </p>
                  </div>
                  {isSuperAdmin ? (
                    <Switch
                      checked={killSwitch?.enabled || false}
                      onCheckedChange={handleKillSwitchToggle}
                      disabled={killSwitchLoading}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm">Super Admin only</span>
                    </div>
                  )}
                </div>

                {!isSuperAdmin && (
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertDescription>Only Super Admins can enable or disable the kill switch.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Access</CardTitle>
                <CardDescription>Your Backoffice role and permissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{profile?.full_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Role</Label>
                    <p className="font-medium capitalize">{backofficeUser?.role?.replace("_", " ") || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Domain</Label>
                    <p className="font-medium">{backofficeUser?.email_domain || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">2FA Status</Label>
                    <div className="font-medium">
                      {backofficeUser?.totp_enabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Global Trial Period</CardTitle>
                <CardDescription>
                  Controls the default trial period used when tenant-specific overrides are not set.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Default trial days</Label>
                  <Input
                    type="number"
                    min={0}
                    value={trialDaysDraft}
                    onChange={(event) => setTrialDaysDraft(Number(event.target.value || 0))}
                    className="w-40"
                    disabled={!isSuperAdmin}
                  />
                </div>
                <Button
                  onClick={() => updateDefaultTrialDaysMutation.mutate(trialDaysDraft)}
                  disabled={!isSuperAdmin || updateDefaultTrialDaysMutation.isPending}
                >
                  Save Trial Days
                </Button>
                <p className="text-sm text-muted-foreground">
                  Current: {defaultTrialDays ?? 14} day(s)
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="markets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5" />
                  Market Activation
                </CardTitle>
                <CardDescription>
                  Control legal go-live, selectable countries, and currency policy. {selectableCountries} countries are selectable.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Select
                      value={selectedCountryCode}
                      onValueChange={(value) => {
                        setSelectedCountryCode(value);
                        const country = marketCountries.find((row) => row.country_code === value);
                        setNotesDraft(country?.notes || "");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {marketCountries.map((country) => (
                          <SelectItem key={country.country_code} value={country.country_code}>
                            {country.country_name} ({country.country_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCountry && (
                    <div className="space-y-4 rounded-md border p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Legal Status</Label>
                          <Select
                            value={selectedCountry.legal_status}
                            onValueChange={(value) => {
                              const legalStatus = value as LegalStatus;
                              queryClient.setQueryData(["market-countries-admin"], (current: MarketCountry[] | undefined) => {
                                if (!current) return current;
                                return current.map((row) =>
                                  row.country_code === selectedCountry.country_code ? { ...row, legal_status: legalStatus } : row
                                );
                              });
                            }}
                            disabled={!isSuperAdmin}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEGAL_STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div>
                            <Label>Selectable in product forms</Label>
                            <p className="text-xs text-muted-foreground">Country appears in onboarding/signup selectors.</p>
                          </div>
                          <Switch
                            checked={selectedCountry.is_selectable}
                            onCheckedChange={(checked) => {
                              queryClient.setQueryData(["market-countries-admin"], (current: MarketCountry[] | undefined) => {
                                if (!current) return current;
                                return current.map((row) =>
                                  row.country_code === selectedCountry.country_code ? { ...row, is_selectable: checked } : row
                                );
                              });
                            }}
                            disabled={!isSuperAdmin}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          value={notesDraft}
                          onChange={(event) => setNotesDraft(event.target.value)}
                          placeholder="Legal/compliance notes for this market"
                          disabled={!isSuperAdmin}
                        />
                      </div>

                      <Button
                        onClick={saveMarketDetails}
                        disabled={!isSuperAdmin || updateCountryMutation.isPending || marketsLoading}
                      >
                        Save Market Changes
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Country Currency Policy</CardTitle>
                <CardDescription>
                  Set one default currency per market and optional enabled overrides (USD fallback supported).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currenciesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading currencies...</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-2">
                        <Label>Add Currency</Label>
                        <Select value={newCurrencyCode} onValueChange={setNewCurrencyCode}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_CURRENCIES.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          upsertCurrencyMutation.mutate({
                            countryCode: selectedCountryCode,
                            currencyCode: newCurrencyCode,
                          })
                        }
                        disabled={!isSuperAdmin || upsertCurrencyMutation.isPending}
                      >
                        Add
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {selectedCountryCurrencies.length === 0 && (
                        <p className="text-sm text-muted-foreground">No currencies configured for this country yet.</p>
                      )}

                      {selectedCountryCurrencies.map((currency) => (
                        <div key={currency.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div>
                            <p className="font-medium">{currency.currency_code}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{currency.is_enabled ? "Enabled" : "Disabled"}</span>
                              {currency.is_default && <Badge variant="secondary">Default</Badge>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setDefaultCurrencyMutation.mutate({
                                  countryCode: currency.country_code,
                                  currencyCode: currency.currency_code,
                                })
                              }
                              disabled={!isSuperAdmin || setDefaultCurrencyMutation.isPending}
                            >
                              Set Default
                            </Button>
                            <Switch
                              checked={currency.is_enabled}
                              onCheckedChange={(checked) =>
                                toggleCurrencyMutation.mutate({ id: currency.id, isEnabled: checked })
                              }
                              disabled={!isSuperAdmin || toggleCurrencyMutation.isPending}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={killSwitchDialogOpen} onOpenChange={setKillSwitchDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {pendingKillSwitchState ? "Enable Kill Switch" : "Disable Kill Switch"}
              </DialogTitle>
              <DialogDescription>
                {pendingKillSwitchState
                  ? "This will put the entire platform into read-only mode. All write operations will be blocked."
                  : "This will restore normal platform operations."}
              </DialogDescription>
            </DialogHeader>

            {pendingKillSwitchState && (
              <div className="py-4">
                <Label>Reason (required)</Label>
                <Textarea
                  value={killSwitchReason}
                  onChange={(event) => setKillSwitchReason(event.target.value)}
                  placeholder="e.g., Emergency maintenance, security incident..."
                  className="mt-2"
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setKillSwitchDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={pendingKillSwitchState ? "destructive" : "default"}
                onClick={confirmKillSwitch}
                disabled={toggleKillSwitchMutation.isPending}
              >
                {pendingKillSwitchState ? "Enable Kill Switch" : "Disable Kill Switch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
