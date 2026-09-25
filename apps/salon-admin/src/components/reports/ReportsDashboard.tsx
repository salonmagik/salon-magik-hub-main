import { useState } from "react";
import { ArrowUpToLine, ChevronDown, ChevronRight, ChevronUp, Info } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Skeleton } from "@ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { Tooltip as Hint, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import type { ReportStats, StaffPerformance } from "@/hooks/useReports";
import type { CustomerTag } from "@/hooks/useCustomerSegments";
import "./reports.css";

export type ReportPeriod = "today" | "week" | "month" | "custom";
export interface ReportSegment {
  key: CustomerTag;
  label: string;
  count: number;
  description: string;
  color: string;
}
interface Props {
  stats: ReportStats;
  isLoading: boolean;
  segments: ReportSegment[];
  segmentsLoading: boolean;
  segmentsError?: boolean;
  period: ReportPeriod;
  currency: string;
  onPeriodChange: (period: ReportPeriod) => void;
  onCustomRange: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onSegmentClick: (segment: ReportSegment) => void;
}
const METHODS: Record<string, string> = { card: "Card", mobile_money: "Mobile Money", cash: "Cash", purse: "Store credit", transfer: "Bank transfer", paystack: "Paystack", ussd: "USSD", qr: "QR", other: "Other" };
const PAYMENT_COLORS: Record<string, string> = { card: "#30204f", mobile_money: "#fac943", cash: "#9ba2af", purse: "#d2ccbc" };

function Metric({ label, value, note, tone, loading, large = false }: { label: string; value: string; note?: React.ReactNode; tone?: string; loading: boolean; large?: boolean }) {
  return <div className={`report-metric ${large ? "report-metric-large" : ""}`}>
    <div className="report-metric-label">{label}</div>
    {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <div className="report-metric-value" style={{ color: tone }}>{value}</div>}
    {note && <div className="report-metric-note">{loading ? <Skeleton className="h-3 w-32" /> : note}</div>}
  </div>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="report-empty">{children}</p>; }

export function ReportsDashboard({ stats, isLoading, segments, segmentsLoading, segmentsError, period, currency, onPeriodChange, onCustomRange, onExport, onSegmentClick }: Props) {
  const [selectedStaff, setSelectedStaff] = useState<StaffPerformance | null>(null);
  const symbols: Record<string, string> = { USD: "$", GHS: "₵", NGN: "₦", EUR: "€", GBP: "£" };
  const fmt = (value: number) => `${symbols[currency] || `${currency} `}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const paymentTotal = stats.paymentMethodBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const paymentMethods = [...stats.paymentMethodBreakdown].sort((a, b) => b.amount - a.amount);
  const change = stats.revenueChangePercent;

  return <div className="reports-dashboard" aria-busy={isLoading}>
    <div className="report-heading">
      <div><h1>Reports</h1><p>How the business is doing, at a glance and in depth.</p></div>
      <div className="report-actions" data-tour-id="tour-reports-filters">
        <div className="report-periods" aria-label="Reporting period">
          {([['today', 'Today'], ['week', 'This week'], ['month', 'This month']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => onPeriodChange(value)}>{label}</button>)}
          {period === "custom" && <button type="button" aria-pressed="true" onClick={onCustomRange}>Custom</button>}
        </div>
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="report-export"><ArrowUpToLine size={14} />Export</button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem disabled={isLoading} onClick={() => onExport("csv")}>Download as CSV</DropdownMenuItem><DropdownMenuItem disabled={isLoading} onClick={() => onExport("xlsx")}>Download as Excel</DropdownMenuItem><DropdownMenuItem onClick={onCustomRange}>Choose custom date range…</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <section data-tour-id="tour-reports-stats" aria-label="Report metrics">
      <h2 className="report-eyebrow">Revenue · {period === "custom" ? stats.periodLabel : { today: "Today", week: "This week", month: "This month" }[period]}</h2>
      <div className="report-revenue-grid">
        <Metric large label="Total earned" value={fmt(stats.totalEarned)} note="Lifetime earnings in Salon Magik" loading={isLoading} />
        <Metric large label="Inflow" value={fmt(stats.totalRevenue)} note={<><span>Cash + card + wallet received</span>{change != null && <span className={`report-change ${change >= 0 ? "positive" : "negative"}`}>{change >= 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{Math.abs(change)}% vs prior period</span>}</>} loading={isLoading} />
        <Metric large label="Average income / transaction" value={fmt(stats.avgTransactionValue)} note={`Across ${stats.completedAppointments.toLocaleString()} completed visits`} loading={isLoading} />
      </div>
      <div className="report-count-groups">
        <div><h2 className="report-eyebrow">Bookings</h2><div className="report-count-grid"><Metric label="Completed" value={stats.completedAppointments.toLocaleString()} tone="#0aad45" loading={isLoading} /><Metric label="Cancelled" value={stats.cancelledAppointments.toLocaleString()} tone="#cc151a" loading={isLoading} /></div></div>
        <div><h2 className="report-eyebrow">Clients</h2><div className="report-count-grid"><Metric label="New" value={stats.newCustomers.toLocaleString()} loading={isLoading} /><Metric label="Returning" value={stats.returningCustomers.toLocaleString()} loading={isLoading} /></div></div>
      </div>
    </section>

    <section className="report-panel report-chart" data-tour-id="tour-reports-chart" aria-label="Inflow over time">
      <h2>Inflow over time</h2>
      {isLoading ? <Skeleton className="my-5 h-[140px] w-full" /> : !stats.dailyRevenue.some(d => d.revenue || d.prevRevenue) ? <Empty>No inflow data for this period yet.</Empty> : <div className="report-chart-canvas" role="img" aria-label={`Daily inflow for ${stats.periodLabel}, compared with ${stats.prevPeriodLabel}. This period: ${fmt(stats.totalRevenue)}. Prior period: ${fmt(stats.prevPeriodRevenue)}. Download the report for daily values.`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={stats.dailyRevenue} barGap={4} barCategoryGap="3%" margin={{ top: 24, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#8d98ac", fontSize: 10 }} tickMargin={8} minTickGap={24} />
          <Tooltip cursor={{ fill: "#f6f3f9" }} contentStyle={{ borderRadius: 10, border: "1px solid #e7e2d9", fontSize: 12 }} formatter={(value: number) => fmt(value)} />
          <Bar dataKey="prevRevenue" name="Prior period" fill="#e8e5dd" radius={[3, 3, 0, 0]} />
          <Bar dataKey="revenue" name="This period" fill="#30204f" radius={[3, 3, 0, 0]} />
        </BarChart></ResponsiveContainer>
      </div>}
      <div className="report-legend"><span><i style={{ background: "#30204f" }} />This period</span><span><i style={{ background: "#e8e5dd" }} />Prior period</span></div>
    </section>

    <div className="report-breakdowns" data-tour-id="tour-reports-breakdowns">
      <section className="report-panel"><h2>Top services</h2>{isLoading ? <Skeleton className="mt-4 h-32 w-full" /> : stats.topServices.length === 0 ? <Empty>No services booked yet this period.</Empty> : <ul className="report-services">{stats.topServices.map(service => <li key={service.name}><span>{service.name}</span><strong title={`${service.count} bookings`}>{fmt(service.revenue)}</strong></li>)}</ul>}</section>
      <section className="report-panel"><h2>How clients pay</h2>{isLoading ? <Skeleton className="mt-4 h-32 w-full" /> : paymentTotal === 0 ? <Empty>No payments received this period.</Empty> : <ul className="report-payments">{paymentMethods.map(payment => { const percent = Math.round(payment.amount / paymentTotal * 100); return <li key={payment.method}><div><span>{METHODS[payment.method] || payment.method}</span><span>{percent}%</span></div><div role="meter" aria-label={METHODS[payment.method] || payment.method} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="report-payment-track" title={`${fmt(payment.amount)} · ${payment.count} payments`}><span style={{ width: `${percent}%`, background: PAYMENT_COLORS[payment.method] || "#8c7da8" }} /></div></li>; })}</ul>}</section>
    </div>

    <section className="report-panel report-staff" data-tour-id="tour-reports-staff"><div className="report-section-heading"><h2>Staff performance</h2><p>Tap a name for their full breakdown</p></div>
      {isLoading ? <Skeleton className="mt-4 h-36 w-full" /> : stats.staffPerformance.length === 0 ? <Empty>No completed staff appointments this period.</Empty> : <ol>{stats.staffPerformance.map((staff, index) => <li key={staff.userId}><button type="button" onClick={() => setSelectedStaff(staff)} aria-label={`View ${staff.name}'s performance`}><span className={`report-rank ${index === 0 ? "first" : ""}`}>{index + 1}</span><span className="report-avatar">{staff.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("")}</span><span className="report-staff-name">{staff.name}</span><strong>{fmt(staff.revenue)}</strong><ChevronRight size={14} /></button></li>)}</ol>}
    </section>

    <section aria-label="Customer segments"><div className="report-section-heading report-segment-heading"><h2 className="report-eyebrow">Customer segments</h2><p>Click a segment to view those customers</p></div>
      {segmentsError ? <Empty>Customer segments couldn’t be loaded. Please refresh to try again.</Empty> : <div className="report-segments">{segments.map(segment => <div className="report-segment" key={segment.key}><button type="button" className="report-segment-open" disabled={segmentsLoading} onClick={() => onSegmentClick(segment)} aria-label={`View ${segment.count} ${segment.label} customers`}><i style={{ background: segment.color }} />{segmentsLoading ? <Skeleton className="mt-4 h-6 w-12" /> : <strong>{segment.count}</strong>}<span>{segment.label}</span></button><Hint><SegmentInfoTrigger label={`About ${segment.label}`} /><TooltipContent className="max-w-64">{segment.description}</TooltipContent></Hint></div>)}</div>}
    </section>

    <section className="report-insights" aria-label="Business insights">{[["Busiest day", stats.busiestDay], ["Peak hour", stats.peakHour], ["Top service", stats.topService], ["Retention rate", stats.retentionRate == null ? null : `${stats.retentionRate}%`]].map(([label, value]) => <div key={label}><h2>{label}</h2>{isLoading ? <Skeleton className="mt-1 h-5 w-20" /> : <strong>{value || "—"}</strong>}</div>)}</section>

    <Dialog open={!!selectedStaff} onOpenChange={open => { if (!open) setSelectedStaff(null); }}><DialogContent><DialogHeader><DialogTitle>{selectedStaff?.name}</DialogTitle><DialogDescription>Performance · {stats.periodLabel}</DialogDescription></DialogHeader>{selectedStaff && <dl className="report-staff-details"><div><dt>Completed bookings</dt><dd>{selectedStaff.appointmentsCompleted}</dd></div><div><dt>Revenue</dt><dd>{fmt(selectedStaff.revenue)}</dd></div><div><dt>Average per completed booking</dt><dd>{fmt(selectedStaff.appointmentsCompleted ? selectedStaff.revenue / selectedStaff.appointmentsCompleted : 0)}</dd></div>{selectedStaff.avgRating != null && <div><dt>Average rating</dt><dd>{selectedStaff.avgRating.toFixed(1)} / 5</dd></div>}</dl>}</DialogContent></Dialog>
  </div>;
}
function SegmentInfoTrigger({ label }: { label: string }) { return <TooltipTrigger asChild><button type="button" className="report-segment-info" aria-label={label}><Info size={12} /></button></TooltipTrigger>; }
