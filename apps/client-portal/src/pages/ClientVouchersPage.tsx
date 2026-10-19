import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth, useClientVouchers, isVoucherUnused } from "@/hooks";
import type { ClientVoucher } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { VoucherDetailDialog } from "@/components/VoucherDetailDialog";
import { voucherStatusMeta } from "@/lib/bookingsOrdersUi";
import { Button } from "@ui/button";
import { CheckCircle2, Loader2, TicketCheck } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { supabase } from "@/lib/supabase";

export default function ClientVouchersPage() {
  const { customers, refreshCustomers } = useClientAuth();
  const { vouchers, isLoading, refetch } = useClientVouchers();
  const [selected, setSelected] = useState<ClientVoucher | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [claimError, setClaimError] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);

  const tenantPhoneByTenantId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const customer of customers) {
      if (customer.tenant) map.set(customer.tenant_id, customer.tenant.contact_phone);
    }
    return map;
  }, [customers]);

  const unusedCount = vouchers.filter(isVoucherUnused).length;
  const usedCount = vouchers.length - unusedCount;

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
    await refetch();
    setVoucherCode("");
    setClaimOpen(false);
  };

  return (
    <ClientSidebar>
      <div className="space-y-6 pb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-[-0.5px] text-[#2E1F4E]">Vouchers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {vouchers.length} {vouchers.length === 1 ? "voucher" : "vouchers"} &middot; {unusedCount} unused, {usedCount} redeemed or expired.
            </p>
          </div>
          <Button onClick={() => setClaimOpen(true)} className="rounded-full">
            <TicketCheck className="mr-2 h-4 w-4" />
            Claim voucher
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : vouchers.length === 0 ? (
          <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-8 text-center text-sm text-muted-foreground">
            No vouchers yet
          </div>
        ) : (
          <div className="space-y-3">
            {vouchers.map((voucher) => {
              const unused = isVoucherUnused(voucher);
              const meta = voucherStatusMeta(voucher.status, unused);
              const tenantPhone = tenantPhoneByTenantId.get(voucher.tenant_id);
              return (
                <button
                  key={voucher.id}
                  type="button"
                  onClick={() => setSelected(voucher)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#D9D2E6] bg-white p-[18px] text-left transition-shadow hover:shadow-md",
                    !unused && "opacity-65",
                  )}
                >
                  <div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.className)}>
                      {meta.label}
                    </span>
                    <p className="mt-1.5 font-serif text-lg font-semibold text-[#2E1F4E]">
                      {formatCurrency(voucher.balance, voucher.tenantCurrency)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Code {voucher.code} &middot;{" "}
                      {unused
                        ? voucher.expires_at ? `Expires ${format(new Date(voucher.expires_at), "MMM d, yyyy")}` : "No expiry"
                        : `Redeemed ${format(new Date(voucher.updated_at), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  {unused && (
                    <Button
                      size="sm"
                      disabled={!tenantPhone}
                      asChild={!!tenantPhone}
                      onClick={(event) => event.stopPropagation()}
                      className="shrink-0"
                    >
                      {tenantPhone ? <a href={`tel:${tenantPhone}`}>Use now</a> : <span>Use now</span>}
                    </Button>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <VoucherDetailDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        voucher={selected}
        tenantPhone={selected ? tenantPhoneByTenantId.get(selected.tenant_id) : null}
      />

      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><TicketCheck className="h-5 w-5 text-primary" /></div>
            <DialogTitle>Claim gift voucher</DialogTitle>
            <p className="text-sm text-muted-foreground">The full remaining value is added to your balance at the issuing salon.</p>
          </DialogHeader>
          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
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
    </ClientSidebar>
  );
}
