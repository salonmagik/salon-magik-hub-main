import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
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
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";

type WithdrawalStatus = "pending" | "processing" | "awaiting_otp" | "completed" | "failed";

interface WithdrawalRow {
  id: string;
  tenant_id: string;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  failure_reason: string | null;
  paystack_transfer_code: string | null;
  requested_at: string;
  tenants: { name: string | null } | null;
  salon_payout_destinations: {
    account_name: string | null;
    account_number: string | null;
    momo_provider: string | null;
    momo_number: string | null;
  } | null;
}

const statusStyles: Record<WithdrawalStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", label: "Pending" },
  processing: { bg: "bg-primary/10", text: "text-primary", label: "Processing" },
  awaiting_otp: { bg: "bg-amber-100", text: "text-amber-900", label: "Awaiting OTP" },
  completed: { bg: "bg-success/10", text: "text-success", label: "Completed" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", label: "Failed" },
};

export default function WithdrawalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["backoffice-withdrawals"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("salon_withdrawals" as any)
        .select(
          "id, tenant_id, amount, currency, status, failure_reason, paystack_transfer_code, requested_at, tenants(name), salon_payout_destinations(account_name, account_number, momo_provider, momo_number)",
        )
        .order("requested_at", { ascending: false })
        .limit(200) as any);
      if (error) throw error;
      return (data || []) as unknown as WithdrawalRow[];
    },
  });

  const awaitingOtpCount = useMemo(
    () => withdrawals.filter((w) => w.status === "awaiting_otp").length,
    [withdrawals],
  );

  const filtered = useMemo(
    () => (statusFilter === "all" ? withdrawals : withdrawals.filter((w) => w.status === statusFilter)),
    [withdrawals, statusFilter],
  );

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Withdrawals</h1>
          <p className="text-muted-foreground">
            Every salon withdrawal request across all tenants. Salons never see the "Awaiting OTP" state below —
            it means Paystack needs an OTP finalized on our own account before the transfer can complete.
          </p>
        </div>

        {awaitingOtpCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {awaitingOtpCount} withdrawal{awaitingOtpCount === 1 ? "" : "s"} stuck awaiting OTP — finalize in the
            Paystack dashboard (Transfers) to release funds to the salon.
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>All Withdrawals</CardTitle>
              <CardDescription>
                {filtered.length} of {withdrawals.length} withdrawal{withdrawals.length === 1 ? "" : "s"} shown
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="awaiting_otp">Awaiting OTP</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-center text-muted-foreground">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">No withdrawals match this filter.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salon</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((w) => {
                    const style = statusStyles[w.status] || statusStyles.pending;
                    const dest = w.salon_payout_destinations;
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="font-medium">{w.tenants?.name || "—"}</TableCell>
                        <TableCell className="font-variant-numeric-tabular">
                          {formatCurrency(Number(w.amount), w.currency)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {dest
                            ? dest.account_name || dest.momo_provider
                              ? `${dest.account_name || dest.momo_provider} · ${dest.account_number || dest.momo_number || ""}`
                              : "—"
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${style.bg} ${style.text}`}>{style.label}</Badge>
                        </TableCell>
                        <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={w.failure_reason || undefined}>
                          {w.failure_reason || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(w.requested_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
