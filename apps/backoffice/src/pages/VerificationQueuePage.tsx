import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface UnverifiedDestination {
  id: string;
  tenant_id: string;
  destination_type: string;
  country: string;
  currency: string;
  paystack_subaccount_code: string | null;
  paystack_subaccount_verification_checked_at: string | null;
  created_at: string;
  tenants: { name: string | null } | null;
}

export default function VerificationQueuePage() {
  const queryClient = useQueryClient();
  const [lastRefreshSummary, setLastRefreshSummary] = useState<string | null>(null);

  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["unverified-subaccounts"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("salon_payout_destinations" as any)
        .select(
          "id, tenant_id, destination_type, country, currency, paystack_subaccount_code, paystack_subaccount_verification_checked_at, created_at, tenants(name)",
        )
        .not("paystack_subaccount_code", "is", null)
        .eq("paystack_subaccount_verified", false)
        .order("created_at", { ascending: true }) as any);
      if (error) throw error;
      return (data || []) as unknown as UnverifiedDestination[];
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("backoffice-refresh-subaccount-verification", {
        body: {},
      });
      if (error) throw error;
      return data as { checked: number; nowVerified: number; remaining: number; errors: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["unverified-subaccounts"] });
      setLastRefreshSummary(
        `Checked ${data.checked}, ${data.nowVerified} now verified, ${data.remaining} still pending.`,
      );
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} destination(s) failed to check — see console.`);
        console.error("Verification refresh errors:", data.errors);
      } else {
        toast.success("Verification status refreshed");
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Refresh failed");
    },
  });

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Verification Queue</h1>
            <p className="text-muted-foreground">
              Salon payout subaccounts Paystack hasn't confirmed as verified yet. A booking payment's split can
              silently fail to reach the salon while its subaccount sits here.
            </p>
          </div>
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending} variant="outline" className="gap-2">
            <RefreshCw className={refresh.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {refresh.isPending ? "Checking..." : "Refresh from Paystack"}
          </Button>
        </div>

        {lastRefreshSummary && (
          <p className="text-sm text-muted-foreground">{lastRefreshSummary}</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Unverified Subaccounts</CardTitle>
            <CardDescription>
              {destinations.length} destination{destinations.length === 1 ? "" : "s"} pending verification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-center text-muted-foreground">Loading...</p>
            ) : destinations.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">Nothing pending — every subaccount is verified.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salon</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Subaccount Code</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {destinations.map((dest) => (
                    <TableRow key={dest.id}>
                      <TableCell className="font-medium">{dest.tenants?.name || "—"}</TableCell>
                      <TableCell className="capitalize">{dest.destination_type.replace("_", " ")}</TableCell>
                      <TableCell>{dest.country}</TableCell>
                      <TableCell>{dest.currency}</TableCell>
                      <TableCell className="font-mono text-xs">{dest.paystack_subaccount_code}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(dest.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dest.paystack_subaccount_verification_checked_at ? (
                          format(new Date(dest.paystack_subaccount_verification_checked_at), "MMM d, yyyy HH:mm")
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            Never checked
                          </span>
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
