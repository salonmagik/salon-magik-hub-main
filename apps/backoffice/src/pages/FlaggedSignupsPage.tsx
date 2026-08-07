import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useFlaggedSignups, type FlaggedSignupRow } from "@/hooks";
import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { Loader2, ShieldAlert, PhoneOff, Wifi } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@ui/empty-state";

const FLAG_LABEL: Record<FlaggedSignupRow["flag_type"], string> = {
  blocked_phone_reuse: "Blocked — phone reuse",
  shared_signup_ip: "Shared signup IP",
};

const FLAG_BADGE: Record<FlaggedSignupRow["flag_type"], string> = {
  blocked_phone_reuse: "bg-red-50 text-red-700",
  shared_signup_ip: "bg-amber-50 text-amber-700",
};

const FLAG_EXPLANATION: Record<FlaggedSignupRow["flag_type"], string> = {
  blocked_phone_reuse:
    "Signup was rejected outright — the phone number already owned a tenant before, even though that tenant is no longer active.",
  shared_signup_ip:
    "Signup went through (different phone, different email), but the phone-verification code was requested from an IP that's also produced another trial tenant. Not blocked automatically — shared IPs are common — but worth a look if the pattern repeats.",
};

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

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Flagged Signups
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signals worth a human look for free-trial abuse — trials don't require a card, so phone reuse and shared signup IPs are the main signals available.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-red-50"><PhoneOff className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Blocked phone-reuse attempts</p>
                <p className="text-2xl font-semibold mt-0.5">{summary.blocked}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-50"><Wifi className="w-5 h-5 text-amber-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Tenants sharing a signup IP</p>
                <p className="text-2xl font-semibold mt-0.5">{summary.sharedIp}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="blocked_phone_reuse">Blocked phone reuse</TabsTrigger>
            <TabsTrigger value="shared_signup_ip">Shared signup IP</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flag</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Phone (last 4)</TableHead>
                    <TableHead>Attempted email</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Existing tenant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, i) => (
                    <TableRow key={`${row.flag_type}-${row.detected_at}-${i}`}>
                      <TableCell>
                        <Badge variant="secondary" className={FLAG_BADGE[row.flag_type]} title={FLAG_EXPLANATION[row.flag_type]}>
                          {FLAG_LABEL[row.flag_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(row.detected_at), "MMM d, yyyy · h:mm a")}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.phone_last4 ? `•••• ${row.phone_last4}` : "—"}</TableCell>
                      <TableCell className="text-sm">{row.attempted_email || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{row.ip_address || "—"}</TableCell>
                      <TableCell>
                        {row.tenant_name ? (
                          <span className="text-sm">{row.tenant_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
