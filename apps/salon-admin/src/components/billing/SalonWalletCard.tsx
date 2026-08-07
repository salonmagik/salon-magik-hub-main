import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useSalonWalletAvailability } from "@/hooks/useSalonWalletAvailability";
import { formatCurrency } from "@shared/currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Loader2, Wallet, Plus, ArrowUpRight, Info } from "lucide-react";
import { WithdrawalDialog } from "./WithdrawalDialog";
import { TopUpDialog } from "./TopUpDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";

export function SalonWalletCard() {
  const { currentTenant } = useAuth();
  const { wallet, isLoading, error, refetch } = useSalonWallet(currentTenant?.id);
  const { availability, isLoading: availabilityLoading, refetch: refetchAvailability } = useSalonWalletAvailability(currentTenant?.id);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);

  const currency = currentTenant?.currency;

  const handleTopUp = () => {
    setTopUpDialogOpen(true);
  };

  const handleWithdraw = () => {
    setWithdrawalDialogOpen(true);
  };

  const handleWithdrawalDialogClose = (open: boolean) => {
    setWithdrawalDialogOpen(open);
    // Refetch wallet balance when dialog closes
    if (!open) {
      refetch();
      refetchAvailability();
    }
  };

  const handleTopUpDialogClose = (open: boolean) => {
    setTopUpDialogOpen(open);
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
              <div className="flex items-center gap-1">
                <p className="text-sm text-muted-foreground">Available to Withdraw</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    Funds that have fully cleared with our payment processor and can be paid out right now. Separate from customer store credit or prepaid funds.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-4xl font-bold">
                {availabilityLoading
                  ? formatCurrency(Number(wallet?.balance || 0), wallet?.currency)
                  : formatCurrency(availability?.available ?? Number(wallet?.balance || 0), wallet?.currency)}
              </p>
              {Number(availability?.pending ?? 0) > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-amber-700 cursor-default">
                      + {formatCurrency(availability!.pending, wallet?.currency)} still settling
                      {availability?.nextSettlementAt
                        ? ` — by ${new Date(availability.nextSettlementAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`
                        : ""}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-64 text-xs">
                    Recent payments are held by our payment processor (Paystack) for up to 1 business day before they can be paid out. This is standard for all Paystack merchants.
                  </TooltipContent>
                </Tooltip>
              )}
              <p className="text-xs text-muted-foreground">
                Total wallet balance: {formatCurrency(Number(wallet?.balance || 0), wallet?.currency)}
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

      {/* Top Up Dialog */}
      <TopUpDialog
        open={topUpDialogOpen}
        onOpenChange={handleTopUpDialogClose}
      />

      {/* Withdrawal Dialog */}
      <WithdrawalDialog
        open={withdrawalDialogOpen}
        onOpenChange={handleWithdrawalDialogClose}
      />
    </Card>
  );
}
