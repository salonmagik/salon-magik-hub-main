import { useState } from "react";
import { useWalletLedger, type WalletLedgerEntry } from "@/hooks/useWalletLedger";
import { formatCurrency } from "@shared/currency";
import { format } from "date-fns";
import { Skeleton } from "@ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { AlertCircle, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@ui/alert";
import { Button } from "@ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WalletLedgerProps {
  walletType: "customer" | "salon";
  walletId?: string;
  currency?: string;
}

// Human-readable labels for entry types
const ENTRY_TYPE_LABELS: Record<string, string> = {
  customer_purse_topup: "Purse Top Up",
  customer_purse_debit_booking: "Booking Payment",
  customer_purse_debit_invoice: "Invoice Payment",
  customer_purse_reversal: "Reversal",
  salon_purse_credit_booking: "Booking Revenue",
  salon_purse_credit_invoice: "Invoice Payment",
  salon_purse_topup: "Wallet Top Up",
  salon_purse_withdrawal: "Withdrawal",
  salon_purse_reversal: "Reversal",
  salon_purse_debit_credit_purchase: "Credit Purchase",
};

export function WalletLedger({ walletType, walletId, currency = "NGN" }: WalletLedgerProps) {
  const [page, setPage] = useState(0);
  const limit = 50;

  const { entries, isLoading, error } = useWalletLedger({
    walletType,
    walletId,
    limit: limit * (page + 1), // Fetch all entries up to current page
  });

  // Paginate entries client-side
  const startIndex = page * limit;
  const endIndex = startIndex + limit;
  const paginatedEntries = entries.slice(startIndex, endIndex);
  const hasNextPage = entries.length > endIndex;
  const hasPrevPage = page > 0;

  // Helper function to format entry type
  const formatEntryType = (entryType: string) => {
    return ENTRY_TYPE_LABELS[entryType] || entryType;
  };

  // Helper function to determine if amount is credit or debit
  const isCredit = (amount: number) => {
    return amount > 0;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-40 h-4" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-24 h-4" />
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
          Failed to load transaction history. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <h3 className="font-medium mb-1">No transactions yet</h3>
        <p className="text-sm">Your transaction history will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance After</TableHead>
              <TableHead className="hidden md:table-cell">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm">
                  {format(new Date(entry.created_at), "MMM dd, yyyy HH:mm")}
                </TableCell>
                <TableCell className="font-medium">
                  {formatEntryType(entry.entry_type)}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={
                      isCredit(Number(entry.amount))
                        ? "text-green-600 dark:text-green-400 font-medium"
                        : "text-red-600 dark:text-red-400 font-medium"
                    }
                  >
                    {isCredit(Number(entry.amount)) ? "+" : ""}
                    {formatCurrency(Number(entry.amount), currency)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(Number(entry.balance_after), currency)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {entry.reference_type && entry.reference_id ? (
                    <span>
                      {entry.reference_type}: {entry.reference_id.substring(0, 8)}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {(hasNextPage || hasPrevPage) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, entries.length)} of {entries.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={!hasPrevPage}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={!hasNextPage}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
