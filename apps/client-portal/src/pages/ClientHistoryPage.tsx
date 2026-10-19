import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClientSidebar } from "@/components/ClientSidebar";
import { ClientRefundRequestDialog } from "@/components/ClientRefundRequestDialog";
import { useClientTransactions, useClientBookings } from "@/hooks";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { MoreVertical } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";
import { Button } from "@ui/button";
import { cn } from "@shared/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";

const TYPE_LABELS: Record<string, string> = {
  payment: "Payment",
  deposit: "Deposit",
  refund: "Refund",
  purse_topup: "Store credit top-up",
  purse_redemption: "Salon balance used",
};

const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
  cash: "Cash",
  pos: "POS",
  transfer: "Transfer",
  purse: "Salon balance",
  ussd: "USSD",
  qr: "QR",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  completed: { label: "Done", className: "bg-[#E1F3EC] text-[#268766]" },
  pending: { label: "Pending", className: "bg-[#FFF6DC] text-[#8A6510]" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-700" },
};

type HistoryTab = "transactions" | "past-bookings";

export default function ClientHistoryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<HistoryTab>("transactions");
  const { transactions, isLoading: txLoading } = useClientTransactions();
  const { bookings, isLoading: bookingsLoading } = useClientBookings("completed");
  const [refundTransaction, setRefundTransaction] = useState<(typeof transactions)[number] | null>(null);

  // A refund transaction's own method says where it landed: "purse" means it
  // was issued as redeemable salon credit, anything else (cash, transfer,
  // card) was paid back to the customer directly, outside Salon Magik.
  const refundDestinationLabel = (method: string) =>
    method === "purse" ? "Refunded as credit" : "Refunded externally";

  return (
    <ClientSidebar>
      <div className="space-y-5 pb-10">
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-[-0.5px] text-[#2E1F4E]">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every payment and refund, in one place.</p>
        </div>

        <div className="flex w-fit gap-1 rounded-xl bg-[#F1ECE1] p-1">
          <button
            type="button"
            onClick={() => setTab("transactions")}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
              tab === "transactions" ? "bg-white text-[#2E1F4E] shadow-sm" : "text-muted-foreground",
            )}
          >
            Transactions &middot; {transactions.length}
          </button>
          <button
            type="button"
            onClick={() => setTab("past-bookings")}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
              tab === "past-bookings" ? "bg-white text-[#2E1F4E] shadow-sm" : "text-muted-foreground",
            )}
          >
            Past bookings &middot; {bookings.length}
          </button>
        </div>

        {tab === "transactions" ? (
          txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-[14px]" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-6 text-center text-sm text-muted-foreground">
              No transaction history
            </div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-[#EAE4D8] bg-white">
              {/* Column header row, desktop only */}
              <div className="hidden grid-cols-[100px_1fr_130px_110px_110px_84px_32px] gap-3 border-b border-[#F1ECE1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Date</span>
                <span>Description</span>
                <span>Salon</span>
                <span>Method</span>
                <span className="text-right">Amount</span>
                <span>Status</span>
                <span />
              </div>
              <div className="divide-y divide-[#F1ECE1]">
                {transactions.map((tx) => {
                  const isCredit = tx.type === "refund" || tx.type === "purse_topup" || tx.type === "purse_redemption";
                  const statusMeta = STATUS_META[tx.status] || { label: tx.status, className: "bg-muted text-foreground" };
                  const canRequestRefund = (tx.type === "payment" || tx.type === "deposit") && tx.status === "completed";
                  const refundChip = tx.type === "refund" && (
                    <Badge className="ml-2 bg-[#E1F3EC] text-[10px] text-[#268766]">
                      {refundDestinationLabel(tx.method)}
                    </Badge>
                  );
                  const kebab = canRequestRefund && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Transaction actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRefundTransaction(tx)}>
                          Request refund
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                  return (
                    <div key={tx.id}>
                      {/* Mobile: a stacked card, not the desktop grid squeezed down */}
                      <div className="space-y-2 px-4 py-3.5 sm:hidden">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {TYPE_LABELS[tx.type] || tx.type}
                              {refundChip}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {format(new Date(tx.created_at), "MMM d, yyyy")} &middot; {tx.tenant?.name || "Salon"}
                            </p>
                          </div>
                          {kebab && <div className="shrink-0">{kebab}</div>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{METHOD_LABELS[tx.method] || tx.method}</span>
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusMeta.className)}>
                              {statusMeta.label}
                            </span>
                            <span className={cn("text-sm font-semibold", isCredit && "text-[#268766]")}>
                              {isCredit ? "+" : ""}
                              {formatCurrency(tx.amount, tx.currency)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Desktop/tablet: column grid */}
                      <div className="hidden grid-cols-[100px_1fr_130px_110px_110px_84px_32px] items-center gap-3 px-4 py-3.5 text-sm sm:grid">
                        <span>{format(new Date(tx.created_at), "MMM d, yyyy")}</span>
                        <span className="font-medium">
                          {TYPE_LABELS[tx.type] || tx.type}
                          {refundChip}
                        </span>
                        <span className="text-muted-foreground">{tx.tenant?.name || "Salon"}</span>
                        <span className="text-muted-foreground">{METHOD_LABELS[tx.method] || tx.method}</span>
                        <span className={cn("text-right font-semibold", isCredit && "text-[#268766]")}>
                          {isCredit ? "+" : ""}
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                        <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusMeta.className)}>
                          {statusMeta.label}
                        </span>
                        <div className="flex justify-end">{kebab}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-[14px]" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-6 text-center text-sm text-muted-foreground">
            No completed bookings
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {bookings.map((booking) => (
              <button
                key={booking.id}
                type="button"
                onClick={() => navigate(`/bookings/${booking.id}`)}
                className="flex cursor-pointer flex-col gap-2 rounded-[14px] border border-[#EAE4D8] bg-white p-4 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[#2E1F4E]">{booking.tenant?.name}</p>
                  <Badge className="bg-[#E1F3EC] text-[10px] text-[#268766]">Completed</Badge>
                </div>
                {booking.scheduled_start && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(booking.scheduled_start), "EEEE, MMMM d, yyyy")}
                  </p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-wrap gap-1">
                    {(booking.services || []).slice(0, 2).map((s) => (
                      <span key={s.id} className="rounded-full bg-[#F3EDFF] px-2 py-0.5 text-[10px] font-medium text-[#2E1F4E]">
                        {s.service_name}
                      </span>
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-[#2E1F4E]">
                    {formatCurrency(booking.total_amount, booking.tenant?.currency || "USD")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <ClientRefundRequestDialog
        open={Boolean(refundTransaction)}
        onOpenChange={(open) => { if (!open) setRefundTransaction(null); }}
        transaction={refundTransaction ? {
          id: refundTransaction.id,
          amount: Number(refundTransaction.amount),
          currency: refundTransaction.currency,
          tenantName: refundTransaction.tenant?.name || "the salon",
        } : null}
      />
    </ClientSidebar>
  );
}
