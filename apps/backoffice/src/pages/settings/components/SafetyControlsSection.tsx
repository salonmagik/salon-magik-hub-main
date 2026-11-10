import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Checkbox } from "@ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Calendar, Lock, Megaphone, Power, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import type { useSafetyControls } from "../hooks/useSafetyControls";

interface SafetyControlsSectionProps {
  isSuperAdmin: boolean;
  safety: ReturnType<typeof useSafetyControls>;
  profileFullName: string | null | undefined;
  role: string | null | undefined;
  emailDomain: string | null | undefined;
  totpEnabled: boolean | null | undefined;
}

export function SafetyControlsSection({
  isSuperAdmin,
  safety,
  profileFullName,
  role,
  emailDomain,
  totpEnabled,
}: SafetyControlsSectionProps) {
  const { killSwitch, killSwitchLoading, maintEnabled, otpLimitEnabled } = safety;

  return (
    <div className="space-y-6">
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

      <Card className={`rounded-2xl ${killSwitch?.enabled ? "border-destructive" : ""}`}>
        <CardHeader className="px-5 py-[18px] pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
                  killSwitch?.enabled ? "bg-destructive/10 text-destructive" : "bg-muted"
                }`}
              >
                <Power className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-[13.5px] font-bold">Kill Switch</CardTitle>
                <CardDescription className="text-xs">Emergency read-only mode for the entire platform</CardDescription>
              </div>
            </div>
            <Badge variant={killSwitch?.enabled ? "destructive" : "secondary"}>
              {killSwitch?.enabled ? "ACTIVE" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 pt-0">
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
                onCheckedChange={safety.handleKillSwitchToggle}
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

      {/* Maintenance Banner */}
      <Card className={`rounded-2xl ${maintEnabled ? "border-warning" : ""}`}>
        <CardHeader className="px-5 py-[18px] pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${maintEnabled ? "bg-warning-bg text-warning" : "bg-muted"}`}>
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-[13.5px] font-bold">Maintenance Banner</CardTitle>
                <CardDescription className="text-xs">
                  Show a dismissable banner on Salon Admin and/or Client Portal to inform users of maintenance.
                </CardDescription>
              </div>
            </div>
            <Badge variant={maintEnabled ? "warning" : "secondary"}>
              {maintEnabled ? "ACTIVE" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-5 pt-0">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium">Banner active</p>
              <p className="text-sm text-muted-foreground">When enabled, the banner is shown on the selected platforms. Save requires 2FA.</p>
            </div>
            {isSuperAdmin ? (
              <Switch
                checked={maintEnabled}
                onCheckedChange={safety.setMaintEnabled}
                disabled={safety.saveMaintenanceBannerMutation.isPending}
              />
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span className="text-sm">Super Admin only</span>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-4">
            {/* Platform targeting */}
            <div className="space-y-2">
              <Label>Target platforms</Label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={safety.maintPlatforms.includes("salon_admin")}
                    onCheckedChange={(checked) =>
                      safety.setMaintPlatforms((prev) =>
                        checked
                          ? [...prev, "salon_admin"]
                          : prev.filter((p) => p !== "salon_admin")
                      )
                    }
                    disabled={!isSuperAdmin}
                  />
                  <span className="text-sm">Salon Admin</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={safety.maintPlatforms.includes("client_portal")}
                    onCheckedChange={(checked) =>
                      safety.setMaintPlatforms((prev) =>
                        checked
                          ? [...prev, "client_portal"]
                          : prev.filter((p) => p !== "client_portal")
                      )
                    }
                    disabled={!isSuperAdmin}
                  />
                  <span className="text-sm">Client Portal</span>
                </label>
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label>Mode</Label>
              <RadioGroup
                value={safety.maintMode}
                onValueChange={(v) => safety.setMaintMode(v as "immediate" | "scheduled")}
                className="flex gap-6"
                disabled={!isSuperAdmin}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="immediate" />
                  <span className="text-sm">Immediate</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="scheduled" />
                  <span className="text-sm">Scheduled</span>
                </label>
              </RadioGroup>
            </div>

            {/* Scheduled date/time */}
            {safety.maintMode === "scheduled" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Maintenance date &amp; time
                </Label>
                <Input
                  type="datetime-local"
                  value={safety.maintScheduledAt}
                  onChange={(e) => safety.setMaintScheduledAt(e.target.value)}
                  className="w-64"
                  disabled={!isSuperAdmin}
                />
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label>Banner title</Label>
              <Input
                value={safety.maintTitle}
                onChange={(e) => safety.setMaintTitle(e.target.value)}
                placeholder="e.g. Scheduled Maintenance"
                disabled={!isSuperAdmin}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={safety.maintDescription}
                onChange={(e) => safety.setMaintDescription(e.target.value)}
                placeholder="What maintenance is being performed?"
                rows={3}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Shown in the "Learn more" modal.</p>
            </div>

            {/* Guidance */}
            <div className="space-y-2">
              <Label>User guidance</Label>
              <Textarea
                value={safety.maintGuidance}
                onChange={(e) => safety.setMaintGuidance(e.target.value)}
                placeholder="What should users do or know during maintenance?"
                rows={3}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Shown below the description in the modal.</p>
            </div>

            {isSuperAdmin && (
              <Button
                onClick={safety.openMaintenanceBannerSaveDialog}
                disabled={safety.saveMaintenanceBannerMutation.isPending}
                className="flex items-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Save Banner Settings
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="px-5 py-[18px] pb-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${!otpLimitEnabled ? "bg-warning-bg text-warning" : "bg-muted"}`}>
              <ShieldOff className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-[13.5px] font-bold">OTP Rate Limiting</CardTitle>
              <CardDescription className="text-xs">
                Controls how many OTP requests a single identifier, or a single sender IP across all phone numbers, can make. Disable during testing to remove all limits.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-5 pt-0">
          {!otpLimitEnabled && (
            <Alert className="border-warning/30 bg-warning-bg text-warning">
              <ShieldOff className="h-4 w-4" />
              <AlertTitle>Rate limiting is disabled</AlertTitle>
              <AlertDescription>OTPs can be requested without restriction. Re-enable before going live.</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-medium">Enable rate limiting</p>
              <p className="text-sm text-muted-foreground">Disable to allow unlimited OTP requests (for testing only)</p>
            </div>
            <Switch
              checked={otpLimitEnabled}
              onCheckedChange={safety.setOtpLimitEnabled}
              disabled={!isSuperAdmin}
            />
          </div>

          <div className={`grid gap-4 md:grid-cols-2 transition-opacity ${!otpLimitEnabled ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="space-y-2">
              <Label>Max requests per hour</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={safety.otpMaxPerHour}
                onChange={(e) => safety.setOtpMaxPerHour(Math.max(1, Number(e.target.value || 1)))}
                className="w-36"
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Default: 3</p>
            </div>
            <div className="space-y-2">
              <Label>Cooldown between requests (seconds)</Label>
              <Input
                type="number"
                min={0}
                max={3600}
                value={safety.otpCooldownSeconds}
                onChange={(e) => safety.setOtpCooldownSeconds(Math.max(0, Number(e.target.value || 0)))}
                className="w-36"
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Default: 60</p>
            </div>
            <div className="space-y-2">
              <Label>Max requests per hour, per sender IP</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={safety.otpMaxPerHourPerIp}
                onChange={(e) => safety.setOtpMaxPerHourPerIp(Math.max(1, Number(e.target.value || 1)))}
                className="w-36"
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">Caps one IP rotating through many phone numbers. Default: 10</p>
            </div>
          </div>

          <Button
            onClick={() => safety.updateOtpRateLimitMutation.mutate({ enabled: otpLimitEnabled, maxPerHour: safety.otpMaxPerHour, cooldownSeconds: safety.otpCooldownSeconds, maxPerHourPerIp: safety.otpMaxPerHourPerIp })}
            disabled={!isSuperAdmin || safety.updateOtpRateLimitMutation.isPending}
          >
            Save OTP Settings
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="px-5 py-[18px]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-[15px] w-[15px] text-muted-foreground" />
            <span className="text-[13px] font-bold">Your access</span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {profileFullName ? `${profileFullName} · ` : ""}
            <span className="capitalize">{role?.replace("_", " ") || "—"}</span>
            {emailDomain ? ` · ${emailDomain}` : ""} · 2FA {totpEnabled ? "enabled" : "disabled"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
