import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Gift,
  History,
  Info,
  Loader2,
  Package,
  Plus,
  TicketCheck,
  WalletCards,
} from "lucide-react";
import { ClientSidebar } from "@/components/ClientSidebar";
import { PurseTopupDialog } from "@/components/PurseTopupDialog";
import { useClientAuth, useClientBalance, useClientPurse, useClientRefunds } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { useSearchParams } from "react-router-dom";

const BALANCE_COPY: Record<string, string> = {
  "Paid funds": "Money you've paid into this salon's balance yourself, e.g. top-ups or prepaid packages.",
  "Store credit": "Credit the salon has issued you — refunds, goodwill, or promotions. Not money you paid in.",
  "Reserved": "Held against an upcoming booking — not available to spend until that booking is completed or cancelled.",
};

const sourceLabels: Record<string, string> = {
  paid_topup: "Paid funds",
  refund: "Refund credit",
  voucher: "Gift voucher",
  adjustment: "Salon credit",
  legacy: "Previous balance",
};

const entryLabels: Record<string, string> = {
  paid_topup: "Balance top-up",
  refund_credit: "Refund credit",
  voucher_claim: "Voucher claimed",
  adjustment: "Salon credit",
  booking_reservation: "Reserved for booking",
  booking_redemption: "Used for appointment",
  reservation_release: "Reservation released",
  migration: "Opening balance",
};

export default function ClientRefundsPage() {
  const [searchParams] = useSearchParams();
  const { customers, user, refreshCustomers } = useClientAuth();
  const { purses, isLoading: pursesLoading, refetch: refetchPurses } = useClientPurse();
  const { grants, entries, packages, isLoading: balanceLoading, refetch: refetchBalance } = useClientBalance();
  const { refunds, isLoading: refundsLoading } = useClientRefunds();
  const [claimOpen, setClaimOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [claimError, setClaimError] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [topupCustomerId, setTopupCustomerId] = useState<string | null>(null);

  const isLoading = pursesLoading || balanceLoading || refundsLoading;
  const topupCustomer = customers.find((customer) => customer.id === topupCustomerId);

  const salonBalances = useMemo(() => customers.map((customer) => {
    const salonGrants = grants.filter((grant) => grant.customer_id === customer.id && grant.status === "active");
    const paid = salonGrants
      .filter((grant) => grant.source_type === "paid_topup" || grant.source_type === "legacy")
      .reduce((sum, grant) => sum + Number(grant.remaining_amount), 0);
    const storeCredit = salonGrants
      .filter((grant) => !["paid_topup", "legacy"].includes(grant.source_type))
      .reduce((sum, grant) => sum + Number(grant.remaining_amount), 0);
    const reserved = salonGrants.reduce((sum, grant) => sum + Number(grant.reserved_amount), 0);
    const purse = purses.find((entry) => entry.customer_id === customer.id);
    const total = purse ? Number(purse.balance) : paid + storeCredit;
    return { customer, paid, storeCredit, reserved, total, available: Math.max(0, total - reserved) };
  }), [customers, grants, purses]);

  const handleClaim = async () => {
    if (!voucherCode.trim()) return;
    setIsClaiming(true);
    setClaimError("");
    const { error } = await supabase.rpc("claim_voucher_for_current_user" as never, {
      p_code: voucherCode.trim().toUpperCase(),
    } as never);
    setIsClaiming(false);
    if (error) {
      setClaimError(error.message);
      return;
    }
    await refreshCustomers();
    await Promise.all([refetchBalance(), refetchPurses()]);
    setVoucherCode("");
    setClaimOpen(false);
  };

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Salon Balance</h1>
            <p className="mt-1 text-muted-foreground">
              Paid funds, store credit, gift vouchers, and package credits at each salon.
            </p>
          </div>
          <Button onClick={() => setClaimOpen(true)}>
            <TicketCheck className="mr-2 h-4 w-4" />
            Claim voucher
          </Button>
        </div>

        <Tabs
          defaultValue={["balance", "packages", "activity", "refunds"].includes(searchParams.get("tab") || "")
            ? searchParams.get("tab")!
            : "balance"}
          className="space-y-5"
        >
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="balance" className="gap-2"><WalletCards className="h-4 w-4" />Balance</TabsTrigger>
            <TabsTrigger value="packages" className="gap-2"><Package className="h-4 w-4" />Packages</TabsTrigger>
            <TabsTrigger value="activity" className="gap-2"><History className="h-4 w-4" />Activity</TabsTrigger>
            <TabsTrigger value="refunds" className="gap-2"><ArrowDownLeft className="h-4 w-4" />Refunds</TabsTrigger>
          </TabsList>

          <TabsContent value="balance" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-56 rounded-xl" /><Skeleton className="h-56 rounded-xl" />
              </div>
            ) : salonBalances.length === 0 ? (
              <Card><CardContent className="py-14 text-center">
                <WalletCards className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No salon balances yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Claim a voucher or book with a salon to get started.</p>
              </CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {salonBalances.map(({ customer, paid, storeCredit, reserved, total, available }) => (
                  <Card key={customer.id} className="overflow-hidden">
                    <CardHeader className="border-b bg-surface/60 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">{customer.tenant.name}</p>
                          <CardTitle className="mt-1 text-3xl">{formatCurrency(available, customer.tenant.currency)}</CardTitle>
                          <div className="mt-1 flex items-center gap-1">
                            <p className="text-xs text-muted-foreground">Available to spend</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-56 text-xs">
                                Total balance minus anything reserved for an upcoming booking.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="rounded-xl bg-primary/10 p-2.5"><WalletCards className="h-5 w-5 text-primary" /></div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
                        {[
                          { label: "Paid funds", value: paid },
                          { label: "Store credit", value: storeCredit },
                          { label: "Reserved", value: reserved },
                        ].map((stat) => (
                          <div key={stat.label}>
                            <div className="flex items-center gap-1">
                              <p className="text-xs text-muted-foreground">{stat.label}</p>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-56 text-xs">
                                  {BALANCE_COPY[stat.label]}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="mt-1 text-sm font-semibold">{formatCurrency(stat.value, customer.tenant.currency)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-3 border-t pt-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">Total balance {formatCurrency(total, customer.tenant.currency)}</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                              Paid funds plus store credit, before subtracting anything reserved for an upcoming booking.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setTopupCustomerId(customer.id)}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" />Add funds
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {grants.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Credit sources</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {grants.filter((grant) => grant.remaining_amount > 0).map((grant) => {
                    const customer = customers.find((entry) => entry.id === grant.customer_id);
                    return (
                      <div key={grant.id} className="flex flex-col gap-3 rounded-xl border p-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="rounded-lg bg-primary/10 p-2"><Gift className="h-4 w-4 text-primary" /></div>
                          <div>
                            <p className="text-sm font-medium">{sourceLabels[grant.source_type] || grant.source_type}</p>
                            <p className="text-xs text-muted-foreground">
                              {customer?.tenant.name}
                              {grant.expires_at ? ` · Expires ${format(new Date(grant.expires_at), "MMM d, yyyy")}` : " · No expiry"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(Number(grant.remaining_amount), grant.currency)}</p>
                          {grant.reserved_amount > 0 && <p className="text-xs text-muted-foreground">{formatCurrency(Number(grant.reserved_amount), grant.currency)} reserved</p>}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="packages">
            <Card>
              <CardHeader><CardTitle className="text-base">My packages</CardTitle></CardHeader>
              <CardContent>
                {packages.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <p className="mt-3 font-medium">No active packages</p>
                    <p className="mt-1 text-sm text-muted-foreground">Purchased service packages and remaining visits appear here.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {packages.map((entitlement) => {
                      const customer = customers.find((entry) => entry.id === entitlement.customer_id);
                      return (
                        <div key={entitlement.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between">
                            <div><p className="font-medium">{entitlement.package?.name || "Package"}</p><p className="text-xs text-muted-foreground">{customer?.tenant.name}</p></div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="cursor-default">{entitlement.status}</Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-56 text-xs">
                                "Active" means you can still use it. "Expired" or "depleted" packages can no longer be redeemed.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="mt-4 space-y-2">
                            {entitlement.items.map((item) => (
                          <div key={item.id} className="flex flex-col gap-1 rounded-lg bg-surface p-3 text-sm min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                                <span className="min-w-0">{item.service?.name || item.product?.name || "Package item"}</span>
                                <span className="shrink-0 flex items-center gap-1 font-medium">
                                  {item.remaining_quantity - item.reserved_quantity} available
                                  {item.reserved_quantity > 0 ? ` · ${item.reserved_quantity} reserved` : ""}
                                  {item.reserved_quantity > 0 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-56 text-xs">
                                        "Reserved" is held against an upcoming booking — not available to use until that booking is completed or cancelled.
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader><CardTitle className="text-base">Balance activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {entries.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No balance activity yet.</p> : entries.map((entry) => {
                  const customer = customers.find((item) => item.id === entry.customer_id);
                  const isCredit = entry.amount > 0;
                  return (
                    <div key={entry.id} className="flex flex-col gap-3 rounded-xl border p-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn("rounded-lg p-2", isCredit ? "bg-success/10" : "bg-muted")}>
                          {isCredit ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{entryLabels[entry.entry_type] || entry.description || entry.entry_type}</p>
                          <p className="text-xs text-muted-foreground">{customer?.tenant.name} · {format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")}</p>
                        </div>
                      </div>
                      {entry.amount !== 0 && <p className={cn("text-sm font-semibold", isCredit && "text-success")}>{isCredit ? "+" : ""}{formatCurrency(Number(entry.amount), customer?.tenant.currency)}</p>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="refunds">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refund history</CardTitle>
                <p className="text-sm text-muted-foreground">Refund requests are created and managed by salon staff.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {refunds.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No refunds yet.</p> : refunds.map((refund) => (
                  <div key={refund.id} className="flex flex-col gap-3 rounded-xl border p-4 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{refund.tenant?.name || "Salon"}</p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="cursor-default">{refund.status}</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            Where this refund is in the salon's approval process — pending, approved, completed, or rejected.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{refund.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{format(new Date(refund.created_at), "MMM d, yyyy")}</p>
                    </div>
                    <div className="shrink-0 min-[420px]:text-right">
                      <p className="font-semibold">{formatCurrency(Number(refund.amount), refund.tenant?.currency)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{refund.refund_type === "store_credit" ? "Salon balance" : "Cash / transfer"}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><TicketCheck className="h-5 w-5 text-primary" /></div>
            <DialogTitle>Claim gift voucher</DialogTitle>
            <p className="text-sm text-muted-foreground">The full remaining value is added to your balance at the issuing salon.</p>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="voucher-code">Voucher code</Label>
              <Input id="voucher-code" value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} className="font-mono uppercase" />
            </div>
            {claimError && <p className="text-sm text-destructive">{claimError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimOpen(false)}>Cancel</Button>
            <Button disabled={!voucherCode.trim() || isClaiming} onClick={() => void handleClaim()}>
              {isClaiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Claim voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {topupCustomer && (
        <PurseTopupDialog
          open={Boolean(topupCustomerId)}
          onOpenChange={(open) => !open && setTopupCustomerId(null)}
          customerId={topupCustomer.id}
          tenantId={topupCustomer.tenant_id}
          currency={topupCustomer.tenant.currency}
          customerEmail={user?.email}
        />
      )}
    </ClientSidebar>
  );
}
