import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Info, RefreshCw, Wallet } from "lucide-react";
import { formatCurrency } from "@shared/currency";
import type { useLiveBalances } from "../hooks/useLiveBalances";

interface LiveBalancesSectionProps {
  balances: ReturnType<typeof useLiveBalances>;
}

export function LiveBalancesSection({ balances }: LiveBalancesSectionProps) {
  const {
    arkeselBalance,
    arkeselBalanceLoading,
    refetchArkeselBalance,
    arkeselBalanceRefetching,
    paystackBalance,
    paystackBalanceLoading,
    refetchPaystackBalance,
    paystackBalanceRefetching,
  } = balances;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5">
                Arkesel SMS Balance
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    Live balance on our third-party SMS gateway (Arkesel), fetched in real time and not stored in our database. At zero, OTP and marketing SMS stop sending for that account until topped up.
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <CardDescription>Live credit balance for each country Arkesel account.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchArkeselBalance()}
              disabled={arkeselBalanceLoading || arkeselBalanceRefetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${arkeselBalanceRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {arkeselBalanceLoading ? (
            <p className="text-sm text-muted-foreground">Fetching balances…</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {(
                [
                  { key: "gh", label: "Ghana (GH)" },
                  { key: "ng_transactional", label: "Nigeria: Transactional" },
                  { key: "ng_promotional", label: "Nigeria: Promotional" },
                ] as const
              ).map(({ key, label }) => {
                const entry = arkeselBalance?.[key];
                return (
                  <div key={key} className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    {entry?.error ? (
                      <p className="mt-1 text-sm text-destructive">{entry.error}</p>
                    ) : (
                      <>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {entry?.sms_balance != null ? entry.sms_balance.toLocaleString() : "0"}
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">credits</span>
                        </p>
                        {entry?.main_balance && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{entry.main_balance}</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4" />
                Paystack Balance
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    Live settlement balance on our Paystack accounts, fetched in real time: funds available to withdraw right now. Separate from tenant salon wallets.
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <CardDescription>Available to withdraw, per country account.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchPaystackBalance()}
              disabled={paystackBalanceLoading || paystackBalanceRefetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${paystackBalanceRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paystackBalanceLoading ? (
            <p className="text-sm text-muted-foreground">Fetching balances…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  { key: "ng", label: "Nigeria (NG)" },
                  { key: "gh", label: "Ghana (GH)" },
                ] as const
              ).map(({ key, label }) => {
                const entry = paystackBalance?.[key];
                return (
                  <div key={key} className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    {entry?.error ? (
                      <p className="mt-1 text-sm text-destructive">{entry.error}</p>
                    ) : (
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {entry?.balance != null && entry.currency
                          ? formatCurrency(entry.balance, entry.currency)
                          : "—"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
