import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
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
import type { Tables } from "@/lib/supabase";

type WalletLedgerEntry = Tables<"wallet_ledger_entries">;

interface PurseTransactionHistoryProps {
  customerId: string;
  tenantId: string;
  currency?: string;
}

// Human-readable labels for customer purse entry types
const ENTRY_TYPE_LABELS: Record<string, string> = {
  customer_purse_topup: "Purse Top Up",
  customer_purse_debit_booking: "Booking Payment",
  customer_purse_debit_invoice: "Invoice Payment",
  customer_purse_reversal: "Reversal",
};

export function PurseTransactionHistory({
  customerId,
  tenantId,
  currency = "NGN",
}: PurseTransactionHistoryProps) {
  const [entries, setEntries] = useState<WalletLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!customerId || !tenantId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // First, fetch the customer_purses to get wallet_id
        const { data: purseData, error: purseError } = await supabase
          .from("customer_purses")
          .select("id")
          .eq("customer_id", customerId)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (purseError) throw purseError;

        if (!purseData) {
          // No purse exists yet
          setEntries([]);
          setIsLoading(false);
          return;
        }

        // Fetch wallet_ledger_entries for this customer purse
        const { data: entriesData, error: entriesError } = await supabase
          .from("wallet_ledger_entries")
          .select("*")
          .eq("wallet_type", "customer")
          .eq("wallet_id", purseData.id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (entriesError) throw entriesError;

        setEntries(entriesData || []);
      } catch (err) {
        console.error("Error fetching purse transaction history:", err);
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [customerId, tenantId]);

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
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
