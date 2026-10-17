import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth, useClientVouchers, isVoucherUnused } from "@/hooks";
import type { ClientVoucher } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { VoucherDetailDialog } from "@/components/VoucherDetailDialog";
import { voucherStatusMeta } from "@/lib/bookingsOrdersUi";

export default function ClientVouchersPage() {
  const { customers } = useClientAuth();
  const { vouchers, isLoading } = useClientVouchers();
  const [selected, setSelected] = useState<ClientVoucher | null>(null);

  const tenantPhoneByTenantId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const customer of customers) {
      if (customer.tenant) map.set(customer.tenant_id, customer.tenant.contact_phone);
    }
    return map;
  }, [customers]);

  const unusedCount = vouchers.filter(isVoucherUnused).length;
  const usedCount = vouchers.length - unusedCount;

  return (
    <ClientSidebar>
      <div className="space-y-6 pb-10">
        <div className="space-y-3.5">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/bookings" className="hover:underline">Bookings &amp; Orders</Link>
            <span>/</span>
            <span className="font-semibold text-[#2E1F4E]">Vouchers</span>
          </nav>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#2E1F4E]">Vouchers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {vouchers.length} {vouchers.length === 1 ? "voucher" : "vouchers"} &middot; {unusedCount} unused, {usedCount} redeemed or expired.
            </p>
          </div>
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
              return (
                <button
                  key={voucher.id}
                  type="button"
                  onClick={() => setSelected(voucher)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#D9D2E6] bg-white p-4.5 text-left transition-shadow hover:shadow-md",
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
    </ClientSidebar>
  );
}
