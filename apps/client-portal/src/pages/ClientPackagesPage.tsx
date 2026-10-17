import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth, useClientBalance } from "@/hooks";
import type { ClientPackageEntitlement } from "@/hooks";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { ChevronRight } from "lucide-react";
import { PackageDetailDialog } from "@/components/PackageDetailDialog";
import { packageExpiryMeta, isPackageExpired } from "@/lib/bookingsOrdersUi";

export default function ClientPackagesPage() {
  const { customers } = useClientAuth();
  const { packages, isLoading } = useClientBalance();
  const [selected, setSelected] = useState<ClientPackageEntitlement | null>(null);

  const tenantPhoneByTenantId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const customer of customers) {
      if (customer.tenant) map.set(customer.tenant_id, customer.tenant.contact_phone);
    }
    return map;
  }, [customers]);

  const activeCount = packages.filter((p) => !isPackageExpired(p.expires_at, p.status)).length;
  const expiredCount = packages.length - activeCount;

  return (
    <ClientSidebar>
      <div className="space-y-6 pb-10">
        <div className="space-y-3.5">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/bookings" className="hover:underline">Bookings &amp; Orders</Link>
            <span>/</span>
            <span className="font-semibold text-[#2E1F4E]">Packages</span>
          </nav>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#2E1F4E]">Packages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {packages.length} {packages.length === 1 ? "package" : "packages"} &middot; {activeCount} active, {expiredCount} expired or used. Tap a package to see its sessions, dates and receipt.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-8 text-center text-sm text-muted-foreground">
            No packages purchased yet
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {packages.map((entitlement) => {
              const items = entitlement.items || [];
              const total = items.reduce((sum, item) => sum + item.total_quantity, 0);
              const remaining = items.reduce((sum, item) => sum + item.remaining_quantity, 0);
              const used = Math.max(total - remaining, 0);
              const pct = total > 0 ? Math.round((used / total) * 100) : 0;
              const expiryMeta = packageExpiryMeta(entitlement.expires_at, entitlement.status);
              const expired = isPackageExpired(entitlement.expires_at, entitlement.status);
              return (
                <button
                  key={entitlement.id}
                  type="button"
                  onClick={() => setSelected(entitlement)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-2.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4.5 text-left transition-shadow hover:shadow-md",
                    expired && "opacity-55",
                  )}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2">
                      <div>
                        <span className="rounded-full bg-[#E1F3EC] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#268766]">
                          Package
                        </span>
                        <p className="mt-1.5 text-sm font-semibold text-[#2E1F4E]">{entitlement.package?.name || "Package"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px]", expiryMeta.className)}>
                        {expiryMeta.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>{used} of {total} sessions used</span>
                      <span>{remaining} remaining</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#F0ECE1]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: expired ? "#8A8392" : "#268766" }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <PackageDetailDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        entitlement={selected}
        tenantPhone={selected ? tenantPhoneByTenantId.get(selected.tenant_id) : null}
      />
    </ClientSidebar>
  );
}
