import { useAuth } from "@/hooks/useAuth";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { usePayoutDestinations } from "@/hooks/usePayoutDestinations";
import { formatCurrency } from "@shared/currency";
import { format } from "date-fns";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { AlertCircle, History } from "lucide-react";
import { Alert, AlertDescription } from "@ui/alert";

export function WithdrawalHistory() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const currency = currentTenant?.currency || "NGN";

  const { withdrawals, isLoading, error } = useWithdrawals(tenantId);
  const { destinations } = usePayoutDestinations(tenantId);

  // Helper function to get destination display name
  const getDestinationDisplay = (destinationId: string) => {
    const destination = destinations.find((d) => d.id === destinationId);
    if (!destination) return "Unknown Destination";

    if (destination.destination_type === "bank") {
      return `${destination.bank_name} - ${destination.account_number}`;
    }

    if (destination.destination_type === "mobile_money") {
      return `${destination.momo_provider} - ${destination.momo_number}`;
    }

    return "Unknown Destination";
  };

  // Helper function to get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 dark:text-blue-400">
            Processing
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400">
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-48 h-4" />
            <Skeleton className="w-20 h-6 rounded-full" />
            <Skeleton className="w-32 h-4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load withdrawal history. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (withdrawals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <h3 className="font-medium mb-1">No withdrawals yet</h3>
        <p className="text-sm">Your withdrawal history will appear here</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="hidden md:table-cell">Destination</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withdrawals.map((withdrawal) => (
            <TableRow key={withdrawal.id}>
              <TableCell>
                {format(new Date(withdrawal.requested_at), "MMM dd, yyyy HH:mm")}
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(Number(withdrawal.amount), currency)}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {getDestinationDisplay(withdrawal.payout_destination_id)}
              </TableCell>
              <TableCell>
                {getStatusBadge(withdrawal.status)}
                {withdrawal.status === "failed" && withdrawal.failure_reason && (
                  <div className="text-xs text-destructive mt-1">
                    {withdrawal.failure_reason}
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                {withdrawal.paystack_reference || withdrawal.id.substring(0, 8)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
