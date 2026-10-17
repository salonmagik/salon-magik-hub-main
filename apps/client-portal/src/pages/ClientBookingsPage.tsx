import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth, useClientBookings, useClientBalance, useClientProductOrders, useClientVouchers, isVoucherUnused } from "@/hooks";
import type { ClientAppointmentWithDetails, ClientPackageEntitlement, ClientProductOrder, ClientVoucher } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { UpcomingAppointmentDialog } from "@/components/UpcomingAppointmentDialog";
import { PackageDetailDialog } from "@/components/PackageDetailDialog";
import { ProductDetailDialog } from "@/components/ProductDetailDialog";
import { VoucherDetailDialog } from "@/components/VoucherDetailDialog";
import { productStatusMeta, packageExpiryMeta, isPackageExpired, voucherStatusMeta, monthDayChip } from "@/lib/bookingsOrdersUi";
import { ProductIcon } from "@/components/ProductIcon";

function SectionHeader({ title, count, seeAllHref }: { title: string; count: string; seeAllHref?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="flex items-center gap-2 font-serif text-lg font-semibold text-[#2E1F4E]">
        {title}
        <span className="rounded-full bg-[#F3EDFF] px-2.5 py-0.5 text-xs font-normal text-[#8A8392]">{count}</span>
      </div>
      {seeAllHref && (
        <Link to={seeAllHref} className="text-sm font-semibold text-[#2E1F4E] hover:underline">
          See all
        </Link>
      )}
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export default function ClientBookingsPage() {
  const { customers } = useClientAuth();
  const { bookings: upcoming, isLoading: upcomingLoading } = useClientBookings("upcoming");
  const { packages, isLoading: packagesLoading } = useClientBalance();
  const { orders, isLoading: ordersLoading } = useClientProductOrders();
  const { vouchers, isLoading: vouchersLoading } = useClientVouchers();

  const [selectedBooking, setSelectedBooking] = useState<ClientAppointmentWithDetails | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ClientPackageEntitlement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ClientProductOrder | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<ClientVoucher | null>(null);

  const tenantPhoneByTenantId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const customer of customers) {
      if (customer.tenant) map.set(customer.tenant_id, customer.tenant.contact_phone);
    }
    return map;
  }, [customers]);

  const upcomingPreview = upcoming.slice(0, 2);

  const unusedVouchers = vouchers.filter(isVoucherUnused);
  const voucherPreview = (unusedVouchers.length > 0 ? unusedVouchers : vouchers).slice(0, 2);
  const voucherCountLabel = unusedVouchers.length > 0 ? `${unusedVouchers.length} unused` : `${vouchers.length}`;

  const packagePreview = packages.slice(0, 2);
  const productPreview = orders.slice(0, 6);

  const isLoading = upcomingLoading || packagesLoading || ordersLoading || vouchersLoading;

  return (
    <ClientSidebar>
      <div className="space-y-9 pb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-primary/65">Your bookings and orders</p>
          <h1 className="mt-2 font-serif text-3xl font-medium tracking-[-0.5px] text-[#2E1F4E]">Bookings &amp; Orders</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything you've booked or bought, grouped by what it is.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Upcoming */}
            <section className="space-y-3.5">
              <SectionHeader title="Upcoming" count={String(upcoming.length)} />
              {upcomingPreview.length === 0 ? (
                <EmptySection message="No upcoming bookings" />
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {upcomingPreview.map((booking) => {
                    const fromPackage = (booking.services || []).some((s) => !!s.package_id);
                    const title = booking.services && booking.services.length > 0 ? booking.services[0].service_name : "Appointment";
                    const chip = fromPackage
                      ? { label: "Package session", className: "text-[#268766] bg-[#E1F3EC]" }
                      : { label: "Service", className: "text-[#2E1F4E] bg-[#F3EDFF]" };
                    const dateChip = booking.scheduled_start ? monthDayChip(booking.scheduled_start) : null;
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => setSelectedBooking(booking)}
                        className="flex cursor-pointer items-start gap-3.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4 text-left transition-shadow hover:shadow-md"
                      >
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F3EDFF]">
                          <span className="text-[10px] font-bold uppercase text-[#2E1F4E]">{dateChip?.month ?? "--"}</span>
                          <span className="font-serif text-[17px] font-semibold leading-none text-[#2E1F4E]">{dateChip?.day ?? "--"}</span>
                        </div>
                        <div>
                          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", chip.className)}>
                            {chip.label}
                          </span>
                          <p className="mt-1.5 text-sm font-semibold text-[#2E1F4E]">{title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {booking.scheduled_start && format(new Date(booking.scheduled_start), "h:mm a")}
                            {booking.location ? ` · ${booking.location.name}` : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Packages */}
            <section className="space-y-3.5">
              <SectionHeader
                title="Packages"
                count={String(packages.length)}
                seeAllHref={packages.length > 2 ? "/bookings/packages" : undefined}
              />
              {packagePreview.length === 0 ? (
                <EmptySection message="No packages purchased yet" />
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {packagePreview.map((entitlement) => {
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
                        onClick={() => setSelectedPackage(entitlement)}
                        className="flex cursor-pointer flex-col gap-2.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4.5 text-left transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div>
                            <span className="rounded-full bg-[#E1F3EC] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#268766]">
                              Package
                            </span>
                            <p className="mt-1.5 text-sm font-semibold text-[#2E1F4E]">{entitlement.package?.name || "Package"}</p>
                          </div>
                          <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px]", expiryMeta.className)}>
                            {expiryMeta.label}
                          </span>
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
            </section>

            {/* Products */}
            <section className="space-y-3.5">
              <SectionHeader
                title="Products"
                count={String(orders.length)}
                seeAllHref={orders.length > 6 ? "/bookings/products" : undefined}
              />
              {productPreview.length === 0 ? (
                <EmptySection message="No products purchased yet" />
              ) : (
                <>
                  <div className="scrollbar-hide flex gap-3.5 overflow-x-auto sm:grid sm:grid-cols-3 sm:overflow-visible">
                    {productPreview.map((order) => {
                      const meta = productStatusMeta(order.fulfillment_status);
                      const dimmed = order.fulfillment_status === "fulfilled" || order.fulfillment_status === "cancelled";
                      return (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => setSelectedProduct(order)}
                          className={cn(
                            "flex w-[118px] shrink-0 cursor-pointer flex-col items-center gap-2 rounded-[14px] border border-[#EAE4D8] bg-white p-4 text-center transition-shadow hover:shadow-md sm:w-auto",
                            dimmed && "opacity-75",
                          )}
                        >
                          <ProductIcon />
                          <p className="text-[13px] font-semibold text-[#2E1F4E]">{order.product_name}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(order.created_at), "MMM d, yyyy")}</p>
                          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", meta.className)}>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {orders.length > 6 && (
                    <p className="text-[11px] text-muted-foreground">Showing the 6 most recent &middot; sorted newest first</p>
                  )}
                </>
              )}
            </section>

            {/* Vouchers */}
            <section className="space-y-3.5">
              <SectionHeader
                title="Vouchers"
                count={voucherCountLabel}
                seeAllHref={vouchers.length > 2 ? "/bookings/vouchers" : undefined}
              />
              {voucherPreview.length === 0 ? (
                <EmptySection message="No vouchers yet" />
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {voucherPreview.map((voucher) => {
                    const unused = isVoucherUnused(voucher);
                    const meta = voucherStatusMeta(voucher.status, unused);
                    return (
                      <button
                        key={voucher.id}
                        type="button"
                        onClick={() => setSelectedVoucher(voucher)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#D9D2E6] bg-white p-4.5 text-left transition-shadow hover:shadow-md"
                      >
                        <div>
                          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.className)}>
                            {meta.label}
                          </span>
                          <p className="mt-1.5 font-serif text-[17px] font-semibold text-[#2E1F4E]">
                            {formatCurrency(voucher.balance, voucher.tenantCurrency)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Code {voucher.code} &middot; {voucher.expires_at ? format(new Date(voucher.expires_at), "MMM d, yyyy") : "No expiry"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <UpcomingAppointmentDialog
        open={!!selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        booking={selectedBooking}
      />
      <PackageDetailDialog
        open={!!selectedPackage}
        onOpenChange={(open) => !open && setSelectedPackage(null)}
        entitlement={selectedPackage}
        tenantPhone={selectedPackage ? tenantPhoneByTenantId.get(selectedPackage.tenant_id) : null}
      />
      <ProductDetailDialog
        open={!!selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        order={selectedProduct}
        tenantPhone={selectedProduct?.tenantId ? tenantPhoneByTenantId.get(selectedProduct.tenantId) : null}
      />
      <VoucherDetailDialog
        open={!!selectedVoucher}
        onOpenChange={(open) => !open && setSelectedVoucher(null)}
        voucher={selectedVoucher}
        tenantPhone={selectedVoucher ? tenantPhoneByTenantId.get(selectedVoucher.tenant_id) : null}
      />
    </ClientSidebar>
  );
}
