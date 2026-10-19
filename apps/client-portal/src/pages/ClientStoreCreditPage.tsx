import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, WalletCards } from "lucide-react";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth, useClientBalance, useClientPurse } from "@/hooks";
import { Skeleton } from "@ui/skeleton";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClientStoreCreditPage() {
  const navigate = useNavigate();
  const { customers } = useClientAuth();
  const { purses, isLoading: pursesLoading } = useClientPurse();
  const { grants, isLoading: balanceLoading } = useClientBalance();

  const isLoading = pursesLoading || balanceLoading;

  const salonBalances = useMemo(
    () =>
      customers.map((customer) => {
        const salonGrants = grants.filter((grant) => grant.customer_id === customer.id && grant.status === "active");
        const reserved = salonGrants.reduce((sum, grant) => sum + Number(grant.reserved_amount), 0);
        const purse = purses.find((entry) => entry.customer_id === customer.id);
        const total = purse ? Number(purse.balance) : 0;
        return { customer, total, available: Math.max(0, total - reserved) };
      }),
    [customers, grants, purses],
  );

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-[-0.5px] text-[#2E1F4E]">Store credit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your balance at each salon you visit.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-[14px]" />
            <Skeleton className="h-16 rounded-[14px]" />
          </div>
        ) : salonBalances.length === 0 ? (
          <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-8 text-center">
            <WalletCards className="mx-auto h-9 w-9 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">No salon balances yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Book with a salon to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-[#EAE4D8] bg-white">
            {salonBalances.map(({ customer, available }, index) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => navigate(`/store-credit/${customer.id}`)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40",
                  index > 0 && "border-t border-[#F1ECE1]",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2E1F4E] text-xs font-semibold text-white">
                    {initialsFor(customer.tenant.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2E1F4E]">{customer.tenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.visit_count || 0} visit{customer.visit_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <p className="text-sm font-semibold text-[#2E1F4E]">
                    {formatCurrency(available, customer.tenant.currency)}
                  </p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </ClientSidebar>
  );
}
