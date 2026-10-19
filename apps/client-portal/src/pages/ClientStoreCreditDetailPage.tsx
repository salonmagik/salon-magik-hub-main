import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Gift,
  History,
  Info,
  Loader2,
  Package,
  Plus,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { useToast } from "@ui/ui/use-toast";

const BALANCE_COPY: Record<string, string> = {
  "Paid funds": "Money you've paid into this salon's balance yourself, e.g. top-ups or prepaid packages.",
  "Store credit": "Credit the salon has issued you: refunds, goodwill, or promotions. Not money you paid in.",
  "Reserved": "Held against an upcoming booking, not available to spend until that booking is completed or cancelled.",
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

export default function ClientStoreCreditDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { customers, user, isAuthenticated } = useClientAuth();
  const { purses, isLoading: pursesLoading, refetch: refetchPurses } = useClientPurse();
  const { grants, entries, packages, isLoading: balanceLoading, refetch: refetchBalance } = useClientBalance();
  const { refunds, isLoading: refundsLoading } = useClientRefunds();
  const { toast } = useToast();
  const [topupOpen, setTopupOpen] = useState(false);
  const [isVerifyingTopup, setIsVerifyingTopup] = useState(false);
  const verifyTopupCalledRef = useRef(false);

  const customer = customers.find((entry) => entry.id === customerId);

  useEffect(() => {
    // A customer that doesn't resolve (bad/stale id) sends the person back
    // to the list rather than rendering an empty detail page.
    if (!pursesLoading && !balanceLoading && customers.length > 0 && !customer) {
      navigate("/store-credit", { replace: true });
    }
  }, [customer, customers.length, pursesLoading, balanceLoading, navigate]);

  // After a Paystack redirect from the "Add funds" dialog (?reference= or
  // ?trxref=), actively verify and finalize the top-up as a safety net
  // independent of the Paystack webhook, which credits the purse and
  // notifies the salon but may be slow or may never fire for some
  // checkouts. Mirrors the same pattern used for booking payments on
  // ClientBookingDetailPage.
  useEffect(() => {
    if (verifyTopupCalledRef.current || !isAuthenticated) return;

    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) return;

    verifyTopupCalledRef.current = true;

    const runVerify = async () => {
      setIsVerifyingTopup(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("verify-purse-topup", {
          body: { reference },
        });

        if (fnError) {
          console.error("verify-purse-topup error:", fnError);
        } else if (data?.verified) {
          toast({
            title: "Funds added",
            description: "Your balance has been updated.",
          });
        } else if (["abandoned", "failed"].includes(data?.paystackStatus)) {
          toast({
            title: "Payment wasn't completed",
            description: "You can try again whenever you're ready.",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Purse top-up verification failed:", err);
      } finally {
        setIsVerifyingTopup(false);
        await Promise.all([refetchBalance(), refetchPurses()]);
        const clean = new URLSearchParams(window.location.search);
        clean.delete("reference");
        clean.delete("trxref");
        const newSearch = clean.toString();
        window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
      }
    };

    void runVerify();
  }, [isAuthenticated]);

  const salonGrants = useMemo(
    () => grants.filter((grant) => grant.customer_id === customerId && grant.status === "active"),
    [grants, customerId],
  );
  const paid = salonGrants
    .filter((grant) => grant.source_type === "paid_topup" || grant.source_type === "legacy")
    .reduce((sum, grant) => sum + Number(grant.remaining_amount), 0);
  const storeCredit = salonGrants
    .filter((grant) => !["paid_topup", "legacy"].includes(grant.source_type))
    .reduce((sum, grant) => sum + Number(grant.remaining_amount), 0);
  const reserved = salonGrants.reduce((sum, grant) => sum + Number(grant.reserved_amount), 0);
  const purse = purses.find((entry) => entry.customer_id === customerId);
  const total = purse ? Number(purse.balance) : paid + storeCredit;
  const available = Math.max(0, total - reserved);

  const salonPackages = useMemo(
    () => packages.filter((entitlement) => entitlement.customer_id === customerId),
    [packages, customerId],
  );
  const salonEntries = useMemo(
    () => entries.filter((entry) => entry.customer_id === customerId),
    [entries, customerId],
  );
  const salonRefunds = useMemo(
    () => refunds.filter((refund) => refund.customer_id === customerId),
    [refunds, customerId],
  );
  const salonGrantsWithBalance = useMemo(
    () => salonGrants.filter((grant) => grant.remaining_amount > 0),
    [salonGrants],
  );

  const isLoading = pursesLoading || balanceLoading;

  if (!customer) {
    return (
      <ClientSidebar>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </ClientSidebar>
    );
  }

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <Link
          to="/store-credit"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Store credit
        </Link>

        {isVerifyingTopup && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 pt-4">
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
              <p className="text-sm font-medium text-primary">Confirming your top-up, please wait...</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <Skeleton className="h-56 rounded-xl" />
        ) : (
          <Card className="overflow-hidden">
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
                <Button size="sm" variant="outline" onClick={() => setTopupOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />Add funds
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {salonGrantsWithBalance.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Credit sources</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {salonGrantsWithBalance.map((grant) => (
                <div key={grant.id} className="flex flex-col gap-3 rounded-xl border p-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2"><Gift className="h-4 w-4 text-primary" /></div>
                    <div>
                      <p className="text-sm font-medium">{sourceLabels[grant.source_type] || grant.source_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {grant.expires_at ? `Expires ${format(new Date(grant.expires_at), "MMM d, yyyy")}` : "No expiry"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(Number(grant.remaining_amount), grant.currency)}</p>
                    {grant.reserved_amount > 0 && <p className="text-xs text-muted-foreground">{formatCurrency(Number(grant.reserved_amount), grant.currency)} reserved</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="packages" className="space-y-5">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="packages" className="gap-2"><Package className="h-4 w-4" />Packages</TabsTrigger>
            <TabsTrigger value="activity" className="gap-2"><History className="h-4 w-4" />Activity</TabsTrigger>
            <TabsTrigger value="refunds" className="gap-2"><ArrowDownLeft className="h-4 w-4" />Refunds</TabsTrigger>
          </TabsList>

          <TabsContent value="packages">
            <Card>
              <CardHeader><CardTitle className="text-base">My packages</CardTitle></CardHeader>
              <CardContent>
                {salonPackages.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <p className="mt-3 font-medium">No active packages</p>
                    <p className="mt-1 text-sm text-muted-foreground">Purchased service packages and remaining visits appear here.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {salonPackages.map((entitlement) => (
                      <div key={entitlement.id} className="rounded-xl border p-4">
                        <div className="flex items-start justify-between">
                          <div><p className="font-medium">{entitlement.package?.name || "Package"}</p></div>
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
                                      "Reserved" is held against an upcoming booking, not available to use until that booking is completed or cancelled.
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader><CardTitle className="text-base">Balance activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {salonEntries.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No balance activity yet.</p> : salonEntries.map((entry) => {
                  const isCredit = entry.amount > 0;
                  return (
                    <div key={entry.id} className="flex flex-col gap-3 rounded-xl border p-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn("rounded-lg p-2", isCredit ? "bg-success/10" : "bg-muted")}>
                          {isCredit ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{entryLabels[entry.entry_type] || entry.description || entry.entry_type}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")}</p>
                        </div>
                      </div>
                      {entry.amount !== 0 && <p className={cn("text-sm font-semibold", isCredit && "text-success")}>{isCredit ? "+" : ""}{formatCurrency(Number(entry.amount), customer.tenant.currency)}</p>}
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
                {refundsLoading ? (
                  <Skeleton className="h-20 rounded-xl" />
                ) : salonRefunds.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No refunds yet.</p>
                ) : salonRefunds.map((refund) => (
                  <div key={refund.id} className="flex flex-col gap-3 rounded-xl border p-4 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{refund.tenant?.name || "Salon"}</p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="cursor-default">{refund.status}</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            Where this refund is in the salon's approval process: pending, approved, completed, or rejected.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{refund.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{format(new Date(refund.created_at), "MMM d, yyyy")}</p>
                    </div>
                    <div className="shrink-0 min-[420px]:text-right">
                      <p className="font-semibold">{formatCurrency(Number(refund.amount), refund.tenant?.currency)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {refund.refund_type === "store_credit"
                          ? "Salon balance"
                          : refund.status === "pending"
                            ? "Refund method decided by the salon"
                            : "Cash / transfer"}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <PurseTopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        customerId={customer.id}
        tenantId={customer.tenant_id}
        currency={customer.tenant.currency}
        customerEmail={user?.email}
      />
    </ClientSidebar>
  );
}
