import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { formatCurrency } from "@shared/currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Loader2, Wallet, Plus, ArrowUpRight } from "lucide-react";
import { WithdrawalDialog } from "./WithdrawalDialog";

export function SalonWalletCard() {
  const { currentTenant } = useAuth();
  const { wallet, isLoading, error, refetch } = useSalonWallet(currentTenant?.id);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);

  const currency = currentTenant?.currency || "NGN";

  const handleTopUp = () => {
    // TODO: Implement top-up functionality
    console.log("Top up clicked");
  };

  const handleWithdraw = () => {
    setWithdrawalDialogOpen(true);
  };

  const handleWithdrawalDialogClose = (open: boolean) => {
    setWithdrawalDialogOpen(open);
    // Refetch wallet balance when dialog closes
    if (!open) {
      refetch();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Salon Wallet
        </CardTitle>
        <CardDescription>
          Your salon's available balance
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-destructive">Failed to load wallet</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-4xl font-bold">
                {formatCurrency(Number(wallet?.balance || 0), currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                Currency: {wallet?.currency || currency}
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleTopUp} className="flex-1">
                <Plus className="mr-2 h-4 w-4" />
                Top Up
              </Button>
              <Button onClick={handleWithdraw} variant="outline" className="flex-1">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Withdraw
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Withdrawal Dialog */}
      <WithdrawalDialog
        open={withdrawalDialogOpen}
        onOpenChange={handleWithdrawalDialogClose}
      />
    </Card>
  );
}
