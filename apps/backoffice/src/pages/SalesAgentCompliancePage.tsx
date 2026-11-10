import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeUsers } from "@/hooks";
import { useSalesOps } from "@/hooks/useSalesOps";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
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
import { ArrowLeft, FileText, Loader2, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

const KYC_DOCUMENT_OPTIONS = {
  NG: [
    { value: "drivers_license", label: "Driver's License" },
    { value: "passport", label: "Passport" },
    { value: "voters_card", label: "Voter's Card" },
    { value: "nin", label: "NIN" },
  ],
  GH: [
    { value: "ghana_card", label: "Ghana Card" },
    { value: "passport", label: "Passport" },
    { value: "voters_card", label: "Voter's Card" },
    { value: "nhis", label: "NHIS" },
    { value: "drivers_license", label: "Driver's License" },
  ],
} as const;

const COUNTRY_FLAG: Record<string, string> = { NG: "🇳🇬", GH: "🇬🇭" };
const COUNTRY_NAME: Record<string, string> = { NG: "Nigeria", GH: "Ghana" };

function buildMemberName(user: { full_name?: string | null; email?: string | null } | undefined): string {
  const fullName = user?.full_name?.trim();
  if (fullName) return fullName;
  const email = user?.email?.trim();
  if (email) return email.split("@")[0] || email;
  return "Unnamed member";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatMoney(amount: number, currency: string) {
  const symbol = currency === "GHS" ? "₵" : "₦";
  return `${symbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function SalesAgentCompliancePage() {
  const { backofficeUserId } = useParams<{ backofficeUserId: string }>();
  const { users: backofficeUsers } = useBackofficeUsers();
  const {
    agentsQuery,
    kycRowsQuery,
    documentsQuery,
    redemptionsQuery,
    upsertKyc,
    uploadDocument,
    updateKycVerificationStatus,
  } = useSalesOps();

  const [showSalary, setShowSalary] = useState(false);
  const [docType, setDocType] = useState<string>("");
  const [idNumber, setIdNumber] = useState("");

  const member = (backofficeUsers || []).find((u) => u.id === backofficeUserId);
  const agent = (agentsQuery.data || []).find((a: any) => a.backoffice_user_id === backofficeUserId) || null;
  const kyc = agent ? (kycRowsQuery.data || []).find((row: any) => row.sales_agent_id === agent.id) || null : null;
  const documents = agent ? (documentsQuery.data || []).filter((row: any) => row.sales_agent_id === agent.id) : [];
  const redemptions = agent
    ? (redemptionsQuery.data || []).filter((row: any) => row.sales_promo_codes?.agent_id === agent.id)
    : [];

  const country = (agent?.country_code || "NG") as keyof typeof KYC_DOCUMENT_OPTIONS;
  const docOptions = KYC_DOCUMENT_OPTIONS[country] || KYC_DOCUMENT_OPTIONS.NG;

  useEffect(() => {
    if (kyc) {
      setDocType(kyc.national_id_type || "");
      setIdNumber(kyc.national_id_number || "");
    }
  }, [kyc]);

  // Recent conversions: the shared useSalesOps() commissionsQuery select doesn't
  // join tenant name/plan (other callers don't need it), so this page queries
  // the ledger directly, scoped to this one agent, with that join added.
  const { data: recentConversions, isLoading: conversionsLoading } = useQuery({
    queryKey: ["sales-agent-recent-conversions", agent?.id],
    enabled: Boolean(agent?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_commission_ledger")
        .select("id, total_amount, status, created_at, tenant_id, tenants(name, plan)")
        .eq("agent_id", agent!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const commissionOwed = (recentConversions || [])
    .filter((row) => row.status === "pending" || row.status === "accrued")
    .reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const convertedCount = (recentConversions || []).length;
  const redemptionsCount = redemptions.length;

  // Signed URLs for the private KYC-docs bucket, fetched once per document set.
  const { data: signedUrls } = useQuery({
    queryKey: ["sales-agent-doc-urls", documents.map((d: any) => d.storage_path).join(",")],
    enabled: documents.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        documents.map(async (doc: any) => {
          const { data } = await supabase.storage
            .from("sales-agent-kyc-docs")
            .createSignedUrl(doc.storage_path, 60 * 10);
          return [doc.id, data?.signedUrl || null] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string | null>;
    },
  });

  const handleSaveIdNumber = () => {
    if (!agent) return;
    upsertKyc.mutate({
      sales_agent_id: agent.id,
      national_id_type: docType || null,
      national_id_number: idNumber.trim() || null,
    });
  };

  const handleUpload = (documentType: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;
    uploadDocument.mutate({ salesAgentId: agent.id, documentType, file });
    e.target.value = "";
  };

  if (!member) {
    return (
      <BackofficeLayout>
        <div className="backoffice-page">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </BackofficeLayout>
    );
  }

  const statusTone = kyc?.verification_status === "approved" ? "success" : kyc?.verification_status === "rejected" ? "destructive" : "warning";

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admins" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Admins & roles
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-bold">{buildMemberName(member)}</h1>
          <Badge variant="warning">Sales agent</Badge>
          <Badge variant={statusTone as any}>
            {kyc?.verification_status === "approved" ? "KYC verified" : kyc?.verification_status === "rejected" ? "KYC rejected" : "KYC pending"}
          </Badge>
        </div>

        {!agent ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              This team member doesn't have a sales-agent profile yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            {/* LEFT: identity & KYC */}
            <div className="flex flex-col gap-4">
              <div className="backoffice-panel rounded-2xl p-5">
                <div className="mb-3 text-sm font-semibold">Identity & KYC</div>
                <dl className="divide-y divide-border text-sm">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-muted-foreground">Country</dt>
                    <dd className="font-medium">{COUNTRY_FLAG[country]} {COUNTRY_NAME[country] || country}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted-foreground">ID document type</dt>
                    <dd>
                      <Select value={docType} onValueChange={setDocType}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {docOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted-foreground">ID number</dt>
                    <dd className="flex items-center gap-2">
                      <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="h-8 w-44 text-xs tabular-nums" placeholder="Not set" />
                      <Button size="sm" variant="outline" className="h-8" onClick={handleSaveIdNumber} disabled={upsertKyc.isPending}>
                        Save
                      </Button>
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-muted-foreground">Hire date</dt>
                    <dd className="font-medium tabular-nums">{agent.hire_date ? new Date(agent.hire_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted-foreground">Monthly salary</dt>
                    <dd className="flex items-center gap-2 font-medium tabular-nums">
                      {showSalary ? formatMoney(Number(agent.monthly_base_salary || 0), country === "GH" ? "GHS" : "NGN") : "••••••"}
                      <button type="button" onClick={() => setShowSalary((v) => !v)} className="text-muted-foreground hover:text-foreground">
                        {showSalary ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-muted-foreground">Verification</dt>
                    <dd>
                      <Select
                        value={kyc?.verification_status || "pending"}
                        onValueChange={(status) => updateKycVerificationStatus.mutate({ salesAgentId: agent.id, status: status as any })}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="backoffice-panel rounded-2xl p-5">
                <div className="mb-3 text-sm font-semibold">ID documents</div>
                <div className="grid grid-cols-2 gap-3">
                  {["national_id_front", "national_id_back"].map((type) => {
                    const doc = documents.find((d: any) => d.document_type === type);
                    const url = doc ? signedUrls?.[doc.id] : null;
                    return (
                      <label key={type} className="flex cursor-pointer flex-col items-center gap-1">
                        <div className="flex aspect-[1.6] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground">
                          {url ? (
                            <img src={url} alt={type} className="h-full w-full rounded-lg object-cover" />
                          ) : (
                            <FileText className="h-5 w-5" />
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{type === "national_id_front" ? "Front" : "Back"}</span>
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload(type)} />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT: conversions & commissions */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="backoffice-panel rounded-2xl p-3.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">Redemptions</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">{redemptionsCount}</div>
                </div>
                <div className="backoffice-panel rounded-2xl p-3.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">Converted</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">{convertedCount}</div>
                </div>
                <div className="backoffice-panel rounded-2xl border-warning/40 p-3.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">Commission owed</div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-warning">
                    {formatMoney(commissionOwed, country === "GH" ? "GHS" : "NGN")}
                  </div>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent conversions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {conversionsLoading ? (
                    <div className="p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : !recentConversions?.length ? (
                    <p className="p-6 text-sm text-muted-foreground">No conversions yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Salon</TableHead>
                          <TableHead>Converted</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentConversions.map((row: any) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.tenants?.name || "—"}</TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">{formatTimestamp(row.created_at)}</TableCell>
                            <TableCell className="capitalize">{row.tenants?.plan || "—"}</TableCell>
                            <TableCell className="tabular-nums">{formatMoney(Number(row.total_amount || 0), country === "GH" ? "GHS" : "NGN")}</TableCell>
                            <TableCell>
                              <Badge variant={row.status === "paid" ? "success" : row.status === "cancelled" ? "neutral" : "warning"}>
                                {row.status === "paid" ? "Paid" : row.status === "cancelled" ? "Cancelled" : "Owed"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}
