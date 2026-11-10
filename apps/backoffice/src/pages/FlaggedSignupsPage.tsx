import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useFlaggedSignups, type FlaggedSignupRow } from "@/hooks";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@ui/empty-state";
import { ShieldAlert } from "lucide-react";

const FLAG_LABEL: Record<FlaggedSignupRow["flag_type"], string> = {
  blocked_phone_reuse: "Phone reuse blocked",
  shared_signup_ip: "Shared signup IP",
};

const FLAG_SEVERITY: Record<FlaggedSignupRow["flag_type"], { label: string; className: string }> = {
  blocked_phone_reuse: { label: "High", className: "bg-destructive-bg text-destructive" },
  shared_signup_ip: { label: "Medium", className: "bg-warning-bg text-warning" },
};

function detailFor(row: FlaggedSignupRow) {
  if (row.flag_type === "blocked_phone_reuse") {
    const phone = row.phone_last4 ? `•••• ${row.phone_last4}` : "Unknown number";
    return row.tenant_name
      ? `${phone} — already tied to ${row.tenant_name}'s owner account`
      : `${phone} — already tied to an existing owner account`;
  }
  const ip = row.ip_address || "an unknown IP";
  return row.attempted_email
    ? `Signup from ${ip} shares a verification IP with another recent trial tenant (${row.attempted_email})`
    : `Signup from ${ip} shares a verification IP with another recent trial tenant`;
}

export default function FlaggedSignupsPage() {
  const { data: flagged, isLoading } = useFlaggedSignups();
  const [tab, setTab] = useState<"all" | FlaggedSignupRow["flag_type"]>("all");

  const rows = flagged || [];

  const summary = useMemo(() => {
    const blocked = rows.filter((r) => r.flag_type === "blocked_phone_reuse").length;
    const sharedIp = rows.filter((r) => r.flag_type === "shared_signup_ip").length;
    return { blocked, sharedIp };
  }, [rows]);

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    return rows.filter((r) => r.flag_type === tab);
  }, [rows, tab]);

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: "all", label: "All signals" },
    { key: "blocked_phone_reuse", label: "Blocked phone reuse" },
    { key: "shared_signup_ip", label: "Shared signup IP" },
  ];

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight">Flagged signups</h1>
          <p className="mt-[3px] text-[12.5px] text-muted-foreground max-w-2xl">
            Fraud and abuse signals from onboarding — blocked refunds (Payments → Transactions) are a separate concern and live there.
          </p>
        </div>

        <div className="flex gap-[22px] border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-[9px] text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="backoffice-panel p-4 border-destructive/60">
            <p className="text-[11.5px] text-muted-foreground font-semibold">Blocked phone-reuse attempts, 7d</p>
            <p className="text-[22px] font-bold tabular-nums mt-1 text-destructive">{summary.blocked}</p>
          </div>
          <div className="backoffice-panel p-4 border-warning/60">
            <p className="text-[11.5px] text-muted-foreground font-semibold">Salons sharing a signup IP</p>
            <p className="text-[22px] font-bold tabular-nums mt-1 text-warning">{summary.sharedIp}</p>
          </div>
        </div>

        <div className="backoffice-panel overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Nothing flagged"
              description="No blocked phone-reuse attempts or shared signup IPs to review right now."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">When</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Signal</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Detail</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Severity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const severity = FLAG_SEVERITY[row.flag_type];
                  return (
                    <tr key={`${row.flag_type}-${row.detected_at}-${i}`} className="border-b last:border-b-0">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {format(new Date(row.detected_at), "MMM d, h:mm a")}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{FLAG_LABEL[row.flag_type]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{detailFor(row)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${severity.className}`}>
                          {severity.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </BackofficeLayout>
  );
}
