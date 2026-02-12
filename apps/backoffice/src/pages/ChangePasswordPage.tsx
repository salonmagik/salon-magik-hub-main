"use client";

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useBackofficeAuth } from "@/hooks";
import { EyeIcon, EyeOffIcon } from "lucide-react";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as any)?.from?.pathname || "/";
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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-white to-background px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-white/90 p-10 shadow-lg backdrop-blur">
        <h1 className="text-2xl font-semibold text-ink mb-2">Set a new password</h1>
        <p className="text-sm text-ink/70 mb-6">
          Your account was created with a temporary password. Choose a new one to continue.
        </p>
        {error && <p className="mb-4 text-sm text-errorText">Error: {error}</p>}
        <form className="space-y-4" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-ink">
            New password
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-white px-4 py-3 pr-12 text-sm text-ink placeholder:text-ink/40 focus:border-primary focus:outline-none"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setError(null);
                  setConfirmError(null);
                  setPassword(e.target.value);
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-3 flex items-center text-ink/60"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOffIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
            <ul className="py-2 space-y-1 text-xs">
              {requirements.map((req) => {
                const ok = req.test(password);
                return (
                  <li key={req.label} className={ok ? "text-emerald-600" : "text-errorText"}>
                    {ok ? "•" : "○"} {req.label}
                  </li>
                );
              })}
            </ul>
          </label>
          <label className="space-y-2 text-sm font-medium text-ink">
            Confirm password
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-white px-4 py-3 pr-12 text-sm text-ink placeholder:text-ink/40 focus:border-primary focus:outline-none"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => {
                  setError(null);
                  setConfirmError(null);
                  setConfirm(e.target.value);
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-3 flex items-center text-ink/60"
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? (
                  <EyeOffIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
            {confirmError && <p className="text-sm text-errorText">{confirmError}</p>}
          </label>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
