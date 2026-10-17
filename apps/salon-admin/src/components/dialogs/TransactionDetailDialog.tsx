import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import {
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  X,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import type { TransactionWithDetails } from "@/hooks/useTransactions";
import type { RefundWithDetails } from "@/hooks/useRefunds";

const methodLabels: Record<string, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
  cash: "Cash",
  pos: "POS",
  transfer: "Transfer",
  purse: "Store Credit",
  ussd: "USSD",
  qr: "QR",
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-success/10", text: "text-success" },
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
};

type LinkedAppointment = {
  id: string;
  scheduled_start: string | null;
  customer: { id: string; full_name: string } | null;
  location: { id: string; name: string } | null;
};

type LinkedProductItem = {
  id: string;
  product_name: string;
  quantity: number;
  fulfillment_status: string;
};

type LinkedPackageItem = {
  id: string;
  total_quantity: number;
  remaining_quantity: number;
  service: { name: string } | null;
  product: { name: string } | null;
};

type LinkedPackage = {
  id: string;
  status: string;
  expires_at: string | null;
  package: { id: string; name: string } | null;
  items: LinkedPackageItem[];
};

type LinkedKind = "none" | "appointment" | "product" | "package";

interface TransactionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionWithDetails | null;
  refunds: RefundWithDetails[];
  fallbackCurrency: string;
  canCompleteRefunds: boolean;
  onIssueRefund: (transaction: TransactionWithDetails) => void;
  onApproveRefund: (refund: RefundWithDetails) => void;
  onDeclineRefund: (refund: RefundWithDetails) => void;
}

export function TransactionDetailDialog({
  open,
  onOpenChange,
  transaction,
  refunds,
  fallbackCurrency,
  canCompleteRefunds,
  onIssueRefund,
  onApproveRefund,
  onDeclineRefund,
}: TransactionDetailDialogProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [linkedKind, setLinkedKind] = useState<LinkedKind>("none");
  const [linkedAppointment, setLinkedAppointment] = useState<LinkedAppointment | null>(null);
  const [linkedProducts, setLinkedProducts] = useState<LinkedProductItem[]>([]);
  const [linkedPackage, setLinkedPackage] = useState<LinkedPackage | null>(null);

  useEffect(() => {
    if (!open || !transaction) {
      setLinkedKind("none");
      setLinkedAppointment(null);
      setLinkedProducts([]);
      setLinkedPackage(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);

      // Packages are resolved first since the FK runs straight from the
      // transaction to the entitlement — no appointment hop needed, and a
      // package purchase still carries an appointment_id (it's issued
      // through an unscheduled appointment), so checking this ahead of the
      // appointment branch below is what keeps the two from colliding.
      const { data: entitlement, error: entitlementError } = await supabase
        .from("customer_package_entitlements" as never)
        .select(
          "id, status, expires_at, package:packages(id, name), items:customer_package_entitlement_items(id, total_quantity, remaining_quantity, service:services(name), product:products(name))",
        )
        .eq("purchased_transaction_id", transaction.id)
        .maybeSingle();

      if (cancelled) return;
      if (entitlementError) {
        console.error("Error loading package entitlement for transaction:", entitlementError);
      }

      let nextKind: LinkedKind = "none";
      let nextAppointment: LinkedAppointment | null = null;
      let nextProducts: LinkedProductItem[] = [];
      let nextPackage: LinkedPackage | null = null;

      if (entitlement) {
        nextKind = "package";
        nextPackage = entitlement as unknown as LinkedPackage;
      }

      if (transaction.appointment_id) {
        const { data: appointment, error: appointmentError } = await supabase
          .from("appointments")
          .select(
            "id, scheduled_start, booking_metadata, customer:customers!appointments_customer_id_fkey(id, full_name), location:locations(id, name)",
          )
          .eq("id", transaction.appointment_id)
          .maybeSingle();

        if (cancelled) return;
        if (appointmentError) {
          console.error("Error loading appointment for transaction:", appointmentError);
        } else if (appointment) {
          nextAppointment = appointment as unknown as LinkedAppointment;

          if (nextKind !== "package") {
            const lineItemType = (appointment as unknown as {
              booking_metadata?: { line_item?: { type?: string | null } | null } | null;
            }).booking_metadata?.line_item?.type;

            if (lineItemType === "product") {
              const { data: products, error: productsError } = await supabase
                .from("appointment_products")
                .select("id, product_name, quantity, fulfillment_status")
                .eq("appointment_id", transaction.appointment_id);

              if (cancelled) return;
              if (productsError) {
                console.error("Error loading linked products for transaction:", productsError);
              } else {
                nextProducts = products || [];
                nextKind = "product";
              }
            } else {
              nextKind = "appointment";
            }
          }
        }
      }

      if (cancelled) return;
      setLinkedKind(nextKind);
      setLinkedAppointment(nextAppointment);
      setLinkedProducts(nextProducts);
      setLinkedPackage(nextPackage);
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, transaction]);

  if (!transaction) return null;

  const currency = transaction.currency || fallbackCurrency;
  const isIncoming = transaction.type === "payment" || transaction.type === "purse_topup" || transaction.type === "deposit";
  const style = statusStyles[transaction.status] || statusStyles.pending;

  const transactionRefunds = refunds.filter(
    (refund) => refund.transaction_id === transaction.id && ["pending", "approved", "completed"].includes(refund.status),
  );
  const completedRefundAmount = transactionRefunds
    .filter((refund) => refund.status === "approved" || refund.status === "completed")
    .reduce((sum, refund) => sum + Number(refund.amount), 0);
  const reservedRefundAmount = transactionRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
  const remainingRefundAmount = Math.max(0, Number(transaction.amount) - reservedRefundAmount);
  const canIssueRefund =
    (transaction.type === "payment" || transaction.type === "deposit") &&
    Boolean(transaction.customer_id) &&
    remainingRefundAmount > 0 &&
    transaction.status === "completed";

  const refundBadgeLabel = completedRefundAmount >= Number(transaction.amount)
    ? "Refunded"
    : completedRefundAmount > 0
      ? "Partially refunded"
      : transactionRefunds.some((refund) => refund.status === "pending")
        ? "Refund pending"
        : null;

  const serviceNames = transaction.appointment?.services
    ?.map((service) => service.service_name)
    .filter(Boolean)
    .join(" + ");

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden rounded-[24px] sm:max-w-xl">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 sm:px-8 sm:pt-6">
          <DialogTitle className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]",
                  isIncoming ? "bg-success/10" : "bg-destructive/10",
                )}
              >
                {isIncoming ? (
                  <ArrowUpRight className="h-5 w-5 text-success" />
                ) : (
                  <ArrowDownLeft className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div>
                <p className="font-serif text-xl font-semibold text-foreground">
                  {formatCurrency(Number(transaction.amount), currency)} {isIncoming ? "inflow" : "outflow"}
                </p>
                <p className="mt-0.5 text-sm font-normal text-muted-foreground">
                  {[transaction.customer?.full_name || "Guest", format(new Date(transaction.created_at), "MMM d, yyyy"), methodLabels[transaction.method || ""] || transaction.method]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className={cn("rounded-full px-3 text-xs font-normal capitalize", style.bg, style.text)}>
                    {transaction.status}
                  </Badge>
                  {refundBadgeLabel && (
                    <Badge
                      className={cn(
                        "rounded-full px-3 text-xs font-normal",
                        refundBadgeLabel === "Refund pending"
                          ? "bg-warning-bg text-warning-foreground"
                          : "bg-purple-100 text-purple-700",
                      )}
                    >
                      {refundBadgeLabel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
          <div className="space-y-6 px-5 py-5 sm:px-8">
            {/* Transaction */}
            <div>
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Transaction</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="mt-0.5 break-all text-sm font-semibold">{transaction.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="mt-0.5 text-sm font-semibold">{methodLabels[transaction.method || ""] || transaction.method || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize">{transaction.provider || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize">{transaction.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="mt-0.5 text-sm font-semibold">{formatCurrency(Number(transaction.amount), currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize">{transaction.status}</p>
                </div>
              </div>
            </div>

            {/* Linked to */}
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-16 w-full rounded-[12px]" />
              </div>
            ) : linkedKind === "package" && linkedPackage ? (
              <div>
                <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Linked package</p>
                <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border/60 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#e1f3ec] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#268766]">
                        Package
                      </span>
                      <span className="text-sm font-semibold">{linkedPackage.package?.name || "Package"}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(() => {
                        const totalQty = linkedPackage.items.reduce((sum, item) => sum + item.total_quantity, 0);
                        const remainingQty = linkedPackage.items.reduce((sum, item) => sum + item.remaining_quantity, 0);
                        const usedQty = totalQty - remainingQty;
                        return `${usedQty} of ${totalQty} sessions used`;
                      })()}
                      {linkedPackage.expires_at && ` · valid until ${format(new Date(linkedPackage.expires_at), "d MMM yyyy")}`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap rounded-lg"
                    onClick={() => navigate("/salon/packages")}
                  >
                    View package
                  </Button>
                </div>
              </div>
            ) : linkedKind === "product" ? (
              <div>
                <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Linked order</p>
                <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border/60 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#fff2ce] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a6510]">
                        Product
                      </span>
                      <span className="text-sm font-semibold">
                        {linkedProducts.map((product) => product.product_name).join(", ") || "Product order"}
                      </span>
                    </div>
                    {linkedAppointment?.location?.name && (
                      <p className="mt-1 text-xs text-muted-foreground">{linkedAppointment.location.name}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap rounded-lg"
                    onClick={() => navigate("/salon/products?subtab=fulfillment")}
                  >
                    View in Fulfillment
                  </Button>
                </div>
              </div>
            ) : linkedKind === "appointment" && linkedAppointment ? (
              <div>
                <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Linked appointment</p>
                <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border/60 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{serviceNames || "Appointment"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        linkedAppointment.customer?.full_name,
                        linkedAppointment.scheduled_start ? format(new Date(linkedAppointment.scheduled_start), "EEE, d MMM, h:mm a") : null,
                        linkedAppointment.location?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap rounded-lg"
                    onClick={() => navigate("/salon/appointments")}
                  >
                    View appointment
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Refund requests */}
            <div>
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Refund requests</p>
              {transactionRefunds.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 rounded-[12px] border border-dashed border-border py-6 text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-primary">
                    <RotateCcw className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">No refunds requested</p>
                  {canIssueRefund && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 rounded-lg"
                      onClick={() => onIssueRefund(transaction)}
                    >
                      Issue a refund
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {transactionRefunds.map((refund) => {
                    const isPending = refund.status === "pending";
                    const isOffline = refund.refund_type === "offline";
                    return (
                      <div
                        key={refund.id}
                        className={cn(
                          "rounded-[12px] border p-4",
                          isPending ? "border-border/60" : "border-[#d7ece0] bg-[#f4fbf7]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {formatCurrency(Number(refund.amount), currency)} {isPending ? "requested" : "refunded"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {refund.reason ? `"${refund.reason}"` : null}
                              {refund.customer?.full_name ? ` · requested by ${refund.customer.full_name}` : null}
                              {` · ${format(new Date(refund.created_at), "MMM d, yyyy")}`}
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-normal",
                              isPending ? "bg-warning-bg text-warning-foreground" : "bg-success/10 text-success",
                            )}
                          >
                            {isPending ? "Pending review" : "Completed"}
                          </Badge>
                        </div>

                        {isPending ? (
                          <div className="mt-3 flex gap-2 border-t border-border/60 pt-3">
                            <Button
                              size="sm"
                              className="flex-1 rounded-lg"
                              disabled={!canCompleteRefunds}
                              onClick={() => onApproveRefund(refund)}
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" />
                              Approve &amp; process
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 rounded-lg"
                              disabled={!canCompleteRefunds}
                              onClick={() => onDeclineRefund(refund)}
                            >
                              <X className="mr-1.5 h-3.5 w-3.5" />
                              Decline
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-[#d7ece0] bg-white p-3">
                            <span className="text-xs font-semibold">
                              {isOffline ? "Cash/transfer issued" : "Added as salon credit"}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "shrink-0 whitespace-nowrap rounded-lg",
                                isOffline && "border-destructive text-destructive hover:bg-destructive/10",
                              )}
                              onClick={() =>
                                navigate(isOffline ? "/salon/transactions?tab=cash" : "/salon/transactions?tab=balances")
                              }
                            >
                              {isOffline ? "See outflow" : "See balance"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Disputes - always a static placeholder, no disputes table exists yet */}
            <div>
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Disputes</p>
              <div className="flex flex-col items-center gap-1 rounded-[12px] border border-dashed border-border py-5 text-center">
                <p className="text-sm font-semibold text-muted-foreground">No disputes raised</p>
                <p className="text-xs text-muted-foreground/80">
                  Dispute tracking isn&apos;t built yet, this section is a placeholder for when it is.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-border/60 px-5 py-4 sm:px-8">
          <Button variant="outline" className="rounded-full px-6" onClick={close}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
