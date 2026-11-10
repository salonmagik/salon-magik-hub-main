"use client";

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useBackofficeAuth } from "@/hooks";
import { Shield, Eye, EyeOff, Check, Circle } from "lucide-react";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { cn } from "@shared/utils";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedRedirect = (location.state as any)?.from?.pathname as
		| string
		| undefined;
	const invalidTargets = new Set([
		"/backoffice",
		"/dashboard",
		"/change-password",
	]);
	const redirectTo =
		requestedRedirect && !invalidTargets.has(requestedRedirect)
			? requestedRedirect
			: "/";
  const { refreshBackofficeUser, markPasswordChanged, signOut } = useBackofficeAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const requirements = [
    { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { label: "One number", test: (p: string) => /\d/.test(p) },
    { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ];

  const allRequirementsMet = requirements.every((r) => r.test(password));
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = allRequirementsMet && passwordsMatch && !loading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmError(null);
    if (!allRequirementsMet) return setError("Password must meet all requirements.");
    if (password !== confirm) return setConfirmError("Passwords do not match.");

    setLoading(true);
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      setLoading(false);
      setError("Session expired. Please sign in again.");
      await signOut();
      return;
    }

    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;

      const { error: boErr } = await supabase
        .from("backoffice_users")
        .update({ temp_password_required: false, password_changed_at: new Date().toISOString() })
        .eq("user_id", userData.user.id);
      if (boErr) throw boErr;

      markPasswordChanged();

      // Ensure auth context reflects the cleared temp-password flag before routing.
      // If refresh hangs (e.g., abort error after a hard refresh), fall back after 1.5s.
      await Promise.race([
        refreshBackofficeUser(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="text-lg font-bold text-foreground">Set a new password</div>
          <div className="mt-0.5 text-center text-[12.5px] text-muted-foreground">
            Your account was created with a temporary password. Choose a new one to continue.
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">
          {error && (
            <div className="mb-3.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <form className="space-y-0" onSubmit={submit}>
            <div className="mb-3.5">
              <Label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                New password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  className="h-auto rounded-[8px] border-input px-[13px] py-[11px] pr-10 text-[13.5px]"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setError(null);
                    setConfirmError(null);
                    setPassword(e.target.value);
                  }}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {requirements.map((req) => {
                  const ok = req.test(password);
                  return (
                    <div
                      key={req.label}
                      className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success" : "text-muted-foreground")}
                    >
                      {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      {req.label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-5">
              <Label htmlFor="confirm-password" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Confirm password
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  className="h-auto rounded-[8px] border-input px-[13px] py-[11px] pr-10 text-[13.5px]"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => {
                    setError(null);
                    setConfirmError(null);
                    setConfirm(e.target.value);
                  }}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {confirmError && <p className="mt-1.5 text-xs text-destructive">{confirmError}</p>}
            </div>

            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-full py-[11px] text-[13.5px] font-semibold"
            >
              {loading ? "Saving..." : "Save and continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
