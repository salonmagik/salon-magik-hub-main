import { CURRENCIES } from "../utils";
import type {
  ChainTierRowDraft,
  CurrencyCode,
  PricingMarket,
  SmsCreditPricingDraft,
  StaffAddonPricingRow,
  StaffOperationsPricingRow,
  ThemeAddonPricingRow,
} from "../types";

export type AddonKey = "locations" | "seats" | "staff" | "themes" | "messaging";

type ChipTone = "success" | "warning" | "info";

interface AddonSummaryGridProps {
  isSuperAdmin: boolean;
  editingAddon: AddonKey | null;
  setEditingAddon: (key: AddonKey | null) => void;
  chainTierDrafts: Record<CurrencyCode, ChainTierRowDraft[]>;
  pricingMarkets: PricingMarket[];
  latestSeatPricingByCountry: Map<string, StaffAddonPricingRow>;
  latestStaffOperationsPricingByCountry: Map<string, StaffOperationsPricingRow>;
  latestThemePricingByCountry: Map<string, ThemeAddonPricingRow>;
  smsPricingDraft: SmsCreditPricingDraft;
  smsPricingDirty?: boolean;
}

const toneChipClasses: Record<ChipTone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
};

const toneDotClasses: Record<ChipTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
};

function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span className={`inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold ${toneChipClasses[tone]}`}>
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${toneDotClasses[tone]}`} />
      {label}
    </span>
  );
}

/** "Add-ons × markets" matrix — matches PricingCatalog.dc.html's configuration table
    exactly: one row per add-on, one status-chip column per market, an "Updated"
    column, clicking a row opens that add-on's editor below. */
export function AddonSummaryGrid({
  isSuperAdmin,
  editingAddon,
  setEditingAddon,
  chainTierDrafts,
  pricingMarkets,
  latestSeatPricingByCountry,
  latestStaffOperationsPricingByCountry,
  latestThemePricingByCountry,
  smsPricingDraft,
  smsPricingDirty,
}: AddonSummaryGridProps) {
  const marketByCurrency = new Map(pricingMarkets.map((m) => [m.currency, m]));

  const rows: Array<{
    key: AddonKey;
    label: string;
    detail: string;
    cells: Array<{ tone: ChipTone; label: string } | null>;
    updated: string;
  }> = [
    {
      key: "locations",
      label: "Additional locations",
      detail: "Per-branch pricing for Chain, tiered by count",
      cells: CURRENCIES.map((currency) => {
        const rowsForCurrency = chainTierDrafts[currency] || [];
        const tierCount = rowsForCurrency.filter((row) => !row.is_custom && row.price_per_location.trim()).length;
        return tierCount > 0
          ? { tone: "success" as const, label: `${tierCount} tier${tierCount === 1 ? "" : "s"} set` }
          : { tone: "warning" as const, label: "Not configured" };
      }),
      updated: "—",
    },
    {
      key: "seats",
      label: "Additional seats",
      detail: "Per-seat price beyond a plan's included staff count",
      cells: CURRENCIES.map((currency) => {
        const market = marketByCurrency.get(currency);
        const configured = market && latestSeatPricingByCountry.get(market.country_code)?.unit_price_per_extra_seat != null;
        return configured
          ? { tone: "success" as const, label: "Configured" }
          : { tone: "warning" as const, label: "Not configured" };
      }),
      updated: "—",
    },
    {
      key: "staff",
      label: "Staff Operations",
      detail: "Clock-in, time off, shift approvals add-on",
      cells: CURRENCIES.map((currency) => {
        const market = marketByCurrency.get(currency);
        const configured = market && latestStaffOperationsPricingByCountry.get(market.country_code)?.unit_price_per_location != null;
        return configured
          ? { tone: "success" as const, label: "Configured" }
          : { tone: "warning" as const, label: "Not configured" };
      }),
      updated: "—",
    },
    {
      key: "themes",
      label: "E-commerce themes",
      detail: "Paid storefront look for the public booking page",
      cells: CURRENCIES.map((currency) => {
        const market = marketByCurrency.get(currency);
        const configured = market && latestThemePricingByCountry.get(market.country_code)?.unit_price != null;
        return configured
          ? { tone: "success" as const, label: "Configured" }
          : { tone: "warning" as const, label: "Not configured" };
      }),
      updated: "—",
    },
    {
      key: "messaging",
      label: "Messaging SMS",
      detail: "Bundle pricing + complimentary monthly allowance",
      cells: CURRENCIES.map((currency) => {
        if (smsPricingDirty) return { tone: "info" as const, label: "Unsaved edit" };
        const tiers = smsPricingDraft.tiers[currency] || [];
        const hasPrice = tiers.some((tier) => Number(tier.bundle_price) > 0);
        return hasPrice
          ? { tone: "success" as const, label: "Configured" }
          : { tone: "warning" as const, label: "Not configured" };
      }),
      updated: "—",
    },
  ];

  return (
    <div className="backoffice-panel overflow-hidden">
      <div
        className="grid border-b border-border bg-muted/50"
        style={{ gridTemplateColumns: "1.8fr 0.9fr 0.9fr 0.9fr" }}
      >
        <div className="px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">Add-on</div>
        {CURRENCIES.map((currency) => (
          <div key={currency} className="px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
            {currency}
          </div>
        ))}
        <div className="px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">Updated</div>
      </div>

      {rows.map((row, index) => {
        const isLast = index === rows.length - 1;
        const isActive = editingAddon === row.key;
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => isSuperAdmin && setEditingAddon(isActive ? null : row.key)}
            className={`grid w-full items-center text-left transition-colors hover:bg-muted/50 ${isActive ? "bg-muted/60" : ""}`}
            style={{ gridTemplateColumns: "1.8fr 0.9fr 0.9fr 0.9fr" }}
          >
            <div className={`flex flex-col items-start gap-0.5 px-4 py-3.5 ${isLast ? "" : "border-b border-border"}`}>
              <span className="text-[13px] font-semibold">{row.label}</span>
              <span className="text-[11.5px] text-muted-foreground">{row.detail}</span>
            </div>
            {row.cells.map((cell, cellIndex) => (
              <div key={cellIndex} className={`flex items-center px-4 py-3.5 ${isLast ? "" : "border-b border-border"}`}>
                {cell && <StatusChip tone={cell.tone} label={cell.label} />}
              </div>
            ))}
            <div className={`flex items-center px-4 py-3.5 text-xs text-muted-foreground ${isLast ? "" : "border-b border-border"}`}>
              {row.updated}
            </div>
          </button>
        );
      })}
    </div>
  );
}
