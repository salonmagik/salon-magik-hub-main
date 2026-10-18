import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth, useClientProductOrders } from "@/hooks";
import type { ClientProductOrder } from "@/hooks";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { ProductDetailDialog } from "@/components/ProductDetailDialog";
import { ProductIcon } from "@/components/ProductIcon";
import { productStatusMeta } from "@/lib/bookingsOrdersUi";

export default function ClientProductsPage() {
  const { customers } = useClientAuth();
  const { orders, isLoading } = useClientProductOrders();
  const [selected, setSelected] = useState<ClientProductOrder | null>(null);

  const tenantPhoneByTenantId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const customer of customers) {
      if (customer.tenant) map.set(customer.tenant_id, customer.tenant.contact_phone);
    }
    return map;
  }, [customers]);

  return (
    <ClientSidebar>
      <div className="space-y-6 pb-10">
        <div className="space-y-3.5">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/bookings" className="hover:underline">Bookings &amp; Orders</Link>
            <span>/</span>
            <span className="font-semibold text-[#2E1F4E]">Products</span>
          </nav>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#2E1F4E]">Products</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {orders.length} {orders.length === 1 ? "product" : "products"} purchased. Tap one to see its order, branch and fulfillment history.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-8 text-center text-sm text-muted-foreground">
            No products purchased yet
          </div>
        ) : (
          <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-4">
            {orders.map((order) => {
              const meta = productStatusMeta(order.fulfillment_status);
              const dimmed = order.fulfillment_status === "fulfilled" || order.fulfillment_status === "cancelled";
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelected(order)}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border border-[#EAE4D8] bg-white p-4 text-center transition-shadow hover:shadow-md",
                    dimmed && "opacity-75",
                  )}
                >
                  <ProductIcon />
                  <p className="text-[13px] font-semibold text-[#2E1F4E]">{order.product_name}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(order.created_at), "MMM d, yyyy")}</p>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", meta.className)}>{meta.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ProductDetailDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        order={selected}
        tenantPhone={selected?.tenantId ? tenantPhoneByTenantId.get(selected.tenantId) : null}
      />
    </ClientSidebar>
  );
}
