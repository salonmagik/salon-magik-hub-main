import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useCommsUsage, useTenantMessageLog, type CommsUsageRow, type TenantMessageLogRow } from "@/hooks";
import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Loader2, MessageSquareText, TriangleAlert, CircleDollarSign } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@ui/empty-state";

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  const symbols: Record<string, string> = { GHS: "₵", NGN: "₦", USD: "$" };
  const symbol = currency ? symbols[currency] || `${currency} ` : "";
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function maskRecipient(recipient: string, channel: string) {
  if (channel === "email") {
    const [user, domain] = recipient.split("@");
    if (!domain) return recipient;
    return `${user.slice(0, 1)}•••@${domain}`;
  }
  return recipient.length > 4 ? `${recipient.slice(0, -4)}••••` : recipient;
}

const STATUS_BADGE: Record<string, string> = {
  delivered: "bg-emerald-50 text-emerald-700",
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  pending: "bg-sky-50 text-sky-700",
};

export default function CommsCreditsPage() {
  const { data: usage, isLoading } = useCommsUsage();
  const [search, setSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<CommsUsageRow | null>(null);

  const rows = usage || [];

  const summary = useMemo(() => {
    const totalSent = rows.reduce((sum, r) => sum + r.sms_sent_30d + r.email_sent_30d, 0);
    const totalSms = rows.reduce((sum, r) => sum + r.sms_sent_30d, 0);
    const totalEmail = rows.reduce((sum, r) => sum + r.email_sent_30d, 0);
    const totalDelivered = rows.reduce((sum, r) => sum + r.delivered_30d, 0);
    const totalFailed = rows.reduce((sum, r) => sum + r.failed_30d, 0);
    const deliveryRate = totalDelivered + totalFailed > 0 ? (totalDelivered / (totalDelivered + totalFailed)) * 100 : null;
    const lowBalance = rows.filter((r) => (r.balance ?? 0) < 10).length;
    return { totalSent, totalSms, totalEmail, deliveryRate, lowBalance };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.tenant_name?.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Comms Credits &amp; Messages</h1>
            <p className="mt-1 text-muted-foreground">
              Credit balances, purchases, and sent-message history across every salon.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Messages sent (30d)", value: summary.totalSent.toLocaleString(), sub: `${summary.totalSms.toLocaleString()} SMS · ${summary.totalEmail.toLocaleString()} email`, icon: MessageSquareText, tone: "text-violet-700 bg-violet-50" },
            { label: "Delivery rate", value: summary.deliveryRate !== null ? `${summary.deliveryRate.toFixed(1)}%` : "—", sub: "last 30 days, salon-sent", icon: CircleDollarSign, tone: "text-emerald-700 bg-emerald-50" },
            { label: "Low balance (<10)", value: summary.lowBalance.toLocaleString(), sub: "salons at risk of running out", icon: TriangleAlert, tone: "text-red-700 bg-red-50" },
          ].map((metric) => (
            <Card key={metric.label} className="backoffice-panel">
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-2xl font-medium">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.sub}</p>
                </div>
                <div className={`rounded-xl p-3 ${metric.tone}`}>
                  <metric.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Input
          placeholder="Search salon name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 max-w-sm rounded-xl bg-white"
        />

        <Card className="backoffice-panel overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="No salons match" description="Try a different search." className="py-12" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salon</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Free allotment used</TableHead>
                      <TableHead>Last purchase</TableHead>
                      <TableHead>Sent (30d)</TableHead>
                      <TableHead>Reminders</TableHead>
                      <TableHead>Birthday</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow key={row.tenant_id} className="cursor-pointer" onClick={() => setSelectedTenant(row)}>
                        <TableCell>
                          <div className="font-medium">{row.tenant_name}</div>
                          <div className="text-xs text-muted-foreground">{row.country || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <span className={(row.balance ?? 0) < 10 ? "text-red-600 font-medium" : "font-medium"}>
                            {row.balance ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.free_monthly_allocation
                            ? `${Math.max(0, row.free_monthly_allocation - (row.balance ?? 0))} / ${row.free_monthly_allocation}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.last_purchase_at
                            ? `${formatMoney(row.last_purchase_amount, row.last_purchase_currency)} · ${format(new Date(row.last_purchase_at), "MMM d")}`
                            : <span className="text-muted-foreground">never purchased</span>}
                        </TableCell>
                        <TableCell className="text-sm">{row.sms_sent_30d} SMS · {row.email_sent_30d} email</TableCell>
                        <TableCell>{row.reminders_sent_30d}</TableCell>
                        <TableCell>{row.birthday_sent_30d}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TenantMessageLogDrawer tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
    </BackofficeLayout>
  );
}

function TenantMessageLogDrawer({ tenant, onClose }: { tenant: CommsUsageRow | null; onClose: () => void }) {
  const { data: log, isLoading } = useTenantMessageLog(tenant?.tenant_id ?? null);
  const [openMessage, setOpenMessage] = useState<TenantMessageLogRow | null>(null);

  return (
    <>
      <Sheet open={Boolean(tenant)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{tenant?.tenant_name} — message log</SheetTitle>
            <SheetDescription>
              Salon-sent messages only. Click a row to see exactly what was sent.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !log || log.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No salon-sent messages in range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((msg) => (
                    <TableRow key={msg.id} className="cursor-pointer" onClick={() => setOpenMessage(msg)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(msg.created_at), "MMM d, h:mma")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{msg.channel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {maskRecipient(msg.recipient, msg.channel)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                        {msg.content || msg.subject || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs capitalize ${STATUS_BADGE[msg.status] || ""}`}>
                          {msg.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(openMessage)} onOpenChange={(open) => !open && setOpenMessage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs capitalize">{openMessage?.channel}</Badge>
              {openMessage && (
                <Badge variant="secondary" className={`text-xs capitalize ${STATUS_BADGE[openMessage.status] || ""}`}>
                  {openMessage.status}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-sm font-normal text-muted-foreground">
              To: <span className="text-foreground font-medium">{openMessage?.recipient}</span>
            </DialogTitle>
          </DialogHeader>
          {openMessage?.subject && (
            <p className="font-serif text-lg font-semibold">{openMessage.subject}</p>
          )}
          <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap leading-relaxed">
            {openMessage?.content || <span className="text-muted-foreground italic">No content recorded for this message.</span>}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>{openMessage?.sent_at && format(new Date(openMessage.sent_at), "MMM d, yyyy · h:mma")}</span>
            <span>{openMessage?.credits_used ?? 0} credits used</span>
          </div>
          {openMessage?.error_message && (
            <p className="text-xs text-red-600">{openMessage.error_message}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
