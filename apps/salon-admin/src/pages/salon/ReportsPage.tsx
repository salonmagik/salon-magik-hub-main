import { useState } from "react";
import { endOfMonth, startOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { ReportsDashboard, type ReportPeriod, type ReportSegment } from "@/components/reports/ReportsDashboard";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { useReports } from "@/hooks/useReports";
import { useCustomerSegments, segmentTags, CUSTOMER_TAG_META } from "@/hooks/useCustomerSegments";
import { useCustomers } from "@/hooks/useCustomers";
import { useActiveBranchCurrency } from "@/hooks/useActiveBranchCurrency";
import { toast } from "@ui/ui/use-toast";
import { DateRangePicker } from "@ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { Skeleton } from "@ui/skeleton";

function SegmentCustomers({ customerIds }: { customerIds: string[] }) {
  const { customers, isLoading, error } = useCustomers();
  if (isLoading) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  if (error) return <p className="p-6 text-sm text-destructive">Customers couldn’t be loaded. Please close and try again.</p>;
  const members = customers.filter(customer => customerIds.includes(customer.id) && customer.status !== "deleted");
  return <div className="max-h-[55vh] overflow-y-auto px-6 pb-6">{members.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No customers in this segment yet.</p> : <ul>{members.map(customer => <li key={customer.id}><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 text-sm"><span>{customer.full_name}</span><span className="text-muted-foreground">{customer.email || customer.phone || ""}</span></div></li>)}</ul>}</div>;
}

export default function ReportsPage() {
  useWalkthroughAutoTrigger("reports");
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [reportRange, setReportRange] = useState(() => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }));
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<ReportSegment | null>(null);
  const { stats, isLoading, error, refetch } = useReports(period, reportRange);
  const { segments, isLoading: segmentsLoading, error: segmentsError } = useCustomerSegments();
  const { currency } = useActiveBranchCurrency("USD");
  const segmentBreakdown: ReportSegment[] = ([
    { key: "vip", label: "VIP", color: "#fac943" },
    { key: "big_spender", label: "Big spenders", color: "#30204f" },
    { key: "regular", label: "Regulars", color: "#13ab4b" },
    { key: "loves_packages", label: "Loves packages", color: "#049bbb" },
    { key: "lapsed", label: "Lapsed", color: "#cc151a" },
  ] as const).map(segment => ({ ...segment, description: CUSTOMER_TAG_META[segment.key].description, count: Object.values(segments).filter(value => segmentTags(value).includes(segment.key)).length }));

  const handleExport = (fileFormat: "csv" | "xlsx") => {
    const data = stats.dailyRevenue.map(day => ({ Date: day.date, Inflow: day.revenue, [`Inflow (${stats.prevPeriodLabel})`]: day.prevRevenue }));
    const sheet = XLSX.utils.json_to_sheet(data, { header: ["Date", "Inflow", `Inflow (${stats.prevPeriodLabel})`] });
    if (fileFormat === "csv") {
      const url = URL.createObjectURL(new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `inflow-report-${period}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Inflow");
      XLSX.writeFile(workbook, `inflow-report-${period}.xlsx`);
    }
    toast({ title: "Exported", description: "Report downloaded successfully." });
  };

  return <SalonSidebar>
    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive p-4 text-sm">Reports couldn’t be loaded. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></div>}
    <ReportsDashboard stats={stats} isLoading={isLoading} segments={segmentBreakdown} segmentsLoading={segmentsLoading} segmentsError={!!segmentsError} period={period} currency={currency} onPeriodChange={setPeriod} onCustomRange={() => setCustomRangeOpen(true)} onExport={handleExport} onSegmentClick={setSelectedSegment} />
    <Dialog open={customRangeOpen} onOpenChange={setCustomRangeOpen}><DialogContent><DialogHeader><DialogTitle>Reporting dates</DialogTitle><DialogDescription>Choose a custom date range for your reports.</DialogDescription></DialogHeader><div className="px-6 pb-6"><DateRangePicker from={reportRange.start} to={reportRange.end} onChange={({ from, to }) => { setReportRange({ start: from, end: to }); setPeriod("custom"); setCustomRangeOpen(false); }} /></div></DialogContent></Dialog>
    <Dialog open={!!selectedSegment} onOpenChange={open => { if (!open) setSelectedSegment(null); }}><DialogContent><DialogHeader><DialogTitle>{selectedSegment?.label}</DialogTitle><DialogDescription>{selectedSegment?.description}</DialogDescription></DialogHeader>{selectedSegment && <SegmentCustomers customerIds={Object.values(segments).filter(value => segmentTags(value).includes(selectedSegment.key)).map(value => value.customer_id)} />}</DialogContent></Dialog>
  </SalonSidebar>;
}
