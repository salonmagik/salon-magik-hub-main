import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { ClientPackageEntitlement } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { packageExpiryMeta, isPackageExpired } from "@/lib/bookingsOrdersUi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Button } from "@ui/button";
import { PackageOpen } from "lucide-react";

interface SessionRow {
  id: string;
  service_name: string;
  status: string;
  scheduledStart: string | null;
}

const SESSION_STATUS_META: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "text-[#15834B] bg-[#E8F8EE]" },
  cancelled: { label: "Cancelled", className: "text-[#991B1B] bg-[#FEE2E2]" },
  scheduled: { label: "Upcoming", className: "text-[#2E1F4E] bg-[#F3EDFF]" },
  started: { label: "In progress", className: "text-[#92400E] bg-[#FEF3C7]" },
  paused: { label: "In progress", className: "text-[#92400E] bg-[#FEF3C7]" },
};

interface PackageDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entitlement: ClientPackageEntitlement | null;
  tenantPhone?: string | null;
}

export function PackageDetailDialog({
  open,
  onOpenChange,
  entitlement,
  tenantPhone,
}: PackageDetailDialogProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [purchase, setPurchase] = useState<{ amount: number; reference: string | null; currency: string } | null>(null);

  useEffect(() => {
    if (!open || !entitlement) {
      setSessions([]);
      setPurchase(null);
      return;
    }

    const packageId = entitlement.package?.id;
    if (packageId) {
      setSessionsLoading(true);
      supabase
        .from("appointment_services")
        .select("id, service_name, status, appointment:appointments(scheduled_start)")
        .eq("package_id", packageId)
        .order("scheduled_start", { foreignTable: "appointment", ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching package session history:", error);
            setSessions([]);
            return;
          }
          setSessions(
            (data || []).map((row: any) => ({
              id: row.id,
              service_name: row.service_name,
              status: row.status,
              scheduledStart: row.appointment?.scheduled_start ?? null,
            })),
          );
        })
        .finally(() => setSessionsLoading(false));
    }

    if (entitlement.purchased_transaction_id) {
      supabase
        .from("transactions")
        .select("amount, currency, paystack_reference, id")
        .eq("id", entitlement.purchased_transaction_id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching package purchase transaction:", error);
            return;
          }
          if (data) {
            setPurchase({
              amount: Number(data.amount),
              reference: data.paystack_reference || data.id,
              currency: data.currency,
            });
          }
        });
    }
  }, [open, entitlement]);

  if (!entitlement) return null;

  const items = entitlement.items || [];
  const totalQuantity = items.reduce((sum, item) => sum + item.total_quantity, 0);
  const remainingQuantity = items.reduce((sum, item) => sum + item.remaining_quantity, 0);
  const usedQuantity = Math.max(totalQuantity - remainingQuantity, 0);
  const progressPct = totalQuantity > 0 ? Math.round((usedQuantity / totalQuantity) * 100) : 0;
  const expiryMeta = packageExpiryMeta(entitlement.expires_at, entitlement.status);
  const expired = isPackageExpired(entitlement.expires_at, entitlement.status);
  const packageName = entitlement.package?.name || "Package";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5" />
            {packageName}
          </DialogTitle>
          <DialogDescription>
            Purchased {format(new Date(entitlement.starts_at), "MMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-6")}>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Progress</p>
            <div className="space-y-2 rounded-xl border border-black/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {usedQuantity} of {totalQuantity} sessions used
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", expiryMeta.className)}>
                  {expiryMeta.label}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#F0ECE1]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: expired ? "#8A8392" : "#268766",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{remainingQuantity} sessions remaining</p>
            </div>
          </div>

          {purchase && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Purchase details</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Amount paid</p>
                  <p className="font-semibold">{formatCurrency(purchase.amount, purchase.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="truncate font-semibold">{purchase.reference}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Session history</p>
            {sessionsLoading ? (
              <p className="text-sm text-muted-foreground">Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions booked against this package yet.</p>
            ) : (
              <div className="divide-y divide-black/5">
                {sessions.map((session) => {
                  const meta = SESSION_STATUS_META[session.status] || { label: session.status, className: "bg-muted text-muted-foreground" };
                  return (
                    <div key={session.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-semibold">{session.service_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.scheduledStart ? format(new Date(session.scheduledStart), "MMM d, yyyy") : "Date not set"}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", meta.className)}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            className="w-full"
            disabled={!tenantPhone}
            asChild={!!tenantPhone}
          >
            {tenantPhone ? <a href={`tel:${tenantPhone}`}>Book next session</a> : <span>Book next session</span>}
          </Button>
          {!tenantPhone && (
            <p className="text-center text-xs text-muted-foreground">
              Contact your salon to book your next session.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
