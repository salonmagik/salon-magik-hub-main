import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLoader } from "@/components/BrandLoader";
import { SalonSidebar, MobileQuickActionEffect, type MobileQuickAction } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { useSalonsOverview, type LocationPerformance } from "@/hooks/useSalonsOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { AddSalonDialog } from "@/components/dialogs/AddSalonDialog";
import { LoadingState } from "@ui/loading-state";
import { formatCurrency } from "@shared/currency";
import { countryName } from "@/lib/countryCurrency";
import { cn } from "@shared/utils";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowUpRight, Building2, Calendar, Check, ChevronRight, Coins, CreditCard, Gift,
  Mail, MessageSquare, PauseCircle, Plus, Send, Users, Clock3,
} from "lucide-react";
import "./business-overview.css";

type DateRange = "today" | "week" | "month";
type ReviewBucket = "pending" | "unpaid";
type ReviewAppointment = {
  id: string;
  booking_reference: string | null;
  scheduled_start: string | null;
  is_unscheduled: boolean;
  location_id: string;
  customer: { first_name: string | null; last_name: string | null } | null;
};

export default function SalonsOverviewPage() {
  const [hubTourSettled, setHubTourSettled] = useState(false);
  useWalkthroughAutoTrigger("hub-overview", [], false, useCallback(() => setHubTourSettled(true), []));
  useWalkthroughAutoTrigger("hub-switcher", [], !hubTourSettled);
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [addSalonOpen, setAddSalonOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationPerformance | null>(null);
  const [revivingLocationId, setRevivingLocationId] = useState<string | null>(null);
  const [reviewBucket, setReviewBucket] = useState<ReviewBucket | null>(null);
  const [reviewAppointments, setReviewAppointments] = useState<ReviewAppointment[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const navigate = useNavigate();
  const { currentTenant, currentRole, activeContextType, activeLocationId, availableContexts, refreshTenants, setActiveContext, canUseOwnerHub } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { locations, isLoading, error, refetch } = useSalonsOverview(dateRange);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current && canUseOwnerHub && activeContextType !== "owner_hub") {
      restoredRef.current = true;
      void setActiveContext("owner_hub", null);
    }
  }, [canUseOwnerHub, activeContextType, setActiveContext]);

  const mobileQuickAction = useMemo<MobileQuickAction>(() => ({ kind: "single", ariaLabel: "Add branch", onSelect: () => setAddSalonOpen(true) }), []);
  const availableCountries = useMemo(() => Array.from(new Set(locations.map((loc) => loc.country))).sort(), [locations]);
  const effectiveCountry = availableCountries.includes(selectedCountry) ? selectedCountry : (currentTenant?.country && availableCountries.includes(currentTenant.country) ? currentTenant.country : availableCountries[0]) || "";
  const filteredLocations = useMemo(() => effectiveCountry ? locations.filter((loc) => loc.country === effectiveCountry) : locations, [locations, effectiveCountry]);
  const branchContexts = availableContexts.filter((context) => context.type === "location");
  const pausedBranches = branchContexts.filter((context) => context.isPaused);
  const canViewRevenue = currentRole === "owner" || (!permissionsLoading && hasPermission("reports"));
  const aggregate = useMemo(() => {
    if (!filteredLocations.length) return null;
    return {
      revenue: filteredLocations.reduce((sum, loc) => sum + loc.revenue, 0),
      bookings: filteredLocations.reduce((sum, loc) => sum + loc.bookingCount, 0),
      staff: filteredLocations.reduce((sum, loc) => sum + loc.staffOnline, 0),
      pending: filteredLocations.reduce((sum, loc) => sum + loc.pendingApprovals, 0),
      unpaid: filteredLocations.reduce((sum, loc) => sum + loc.unpaidBalances, 0),
      currency: filteredLocations[0]?.currency || currentTenant?.currency || "USD",
    };
  }, [filteredLocations, currentTenant?.currency]);
  const attentionCount = (aggregate?.pending || 0) + (aggregate?.unpaid || 0) + pausedBranches.length;
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  const navigateToReviewAppointment = async (appointment: ReviewAppointment, bucket: ReviewBucket) => {
    if (appointment.location_id) await setActiveContext("location", appointment.location_id);
    const tab = bucket === "pending" ? "unconfirmed" : appointment.is_unscheduled ? "unscheduled" : "all";
    const action = bucket === "pending" ? "&approvalAction=review" : "&open=details";
    navigate(`/salon/appointments?tab=${tab}&appointmentId=${appointment.id}${action}`);
  };

  const loadReviewAppointments = async (bucket: ReviewBucket) => {
    if (!currentTenant?.id) return;
    setReviewLoading(true);
    try {
      let query = supabase
        .from("appointments")
        .select("id, booking_reference, scheduled_start, is_unscheduled, location_id, customer:customers!appointments_customer_id_fkey(first_name,last_name)")
        .eq("tenant_id", currentTenant.id)
        .neq("status", "cancelled")
        .order("scheduled_start", { ascending: true });
      if (bucket === "pending") {
        query = query.in("approval_status", ["pending", "reschedule_proposed"]);
      } else {
        query = query.not("payment_status", "in", '("fully_paid","refunded_full","refunded_partial")').not("status", "in", '("cancelled","completed")');
      }
      const { data, error: reviewError } = await query;
      if (reviewError) throw reviewError;
      const rows = (data || []) as unknown as ReviewAppointment[];
      if (rows.length === 1) {
        await navigateToReviewAppointment(rows[0], bucket);
      } else {
        setReviewBucket(bucket);
        setReviewAppointments(rows);
      }
    } catch (reviewError: any) {
      toast({ title: "Couldn't load appointments", description: reviewError?.message || "Please try again.", variant: "destructive" });
    } finally {
      setReviewLoading(false);
    }
  };

  const handleRevive = async (locationId: string) => {
    if (!currentTenant?.id) return;
    setRevivingLocationId(locationId);
    try {
      const { data, error: reviveError } = await (supabase.rpc as any)("revive_location", { p_tenant_id: currentTenant.id, p_location_id: locationId });
      if (reviveError) throw reviveError;
      if (!data?.success) throw new Error(data?.message || "Failed to revive branch");
      toast({ title: "Branch revived", description: "This branch is active again." });
      await Promise.all([refreshTenants(), refetch()]);
    } catch (reviveError: any) {
      toast({ title: "Couldn't revive branch", description: reviveError?.message || "Please try again.", variant: "destructive" });
    } finally {
      setRevivingLocationId(null);
    }
  };

  if (canUseOwnerHub && activeContextType !== "owner_hub") return <BrandLoader fullScreen />;
  if (!currentTenant) return <SalonSidebar><LoadingState variant="section" /></SalonSidebar>;

  const marketingCards = [
    { title: "Targeted marketing", icon: MessageSquare, tone: "purple", email: 140, sms: 60 },
    { title: "Birthday messages", icon: Gift, tone: "pink", email: 24, sms: 14 },
    { title: "Bulk messages", icon: Send, tone: "gray", email: 122, sms: 60 },
  ];

  return (
    <SalonSidebar>
      <MobileQuickActionEffect action={mobileQuickAction} />
      <div className="business-overview">
        <header className="business-overview__header">
          <div><h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Business Overview</h1><p>{activeContextType === "owner_hub" ? "Track how your branches are performing across bookings, revenue, and staffing." : `Branch-scoped overview for ${availableContexts.find((context) => context.locationId === activeLocationId)?.label || "Selected branch"}`}</p></div>
          <div className="business-overview__actions">
            {availableCountries.length > 1 && <Select value={effectiveCountry} onValueChange={setSelectedCountry}><SelectTrigger className="business-overview__country"><SelectValue /></SelectTrigger><SelectContent>{availableCountries.map((country) => <SelectItem key={country} value={country}>{countryName(country)}</SelectItem>)}</SelectContent></Select>}
            <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}><SelectTrigger className="business-overview__period"><Calendar /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem></SelectContent></Select>
            <Button className="rounded-full" onClick={() => setAddSalonOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add Branch</Button>
          </div>
        </header>
        {isLoading ? <div className="business-overview__loading">Loading your overview…</div> : error ? <div className="business-overview__error"><AlertCircle /><span>Failed to load branch data.</span><Button variant="outline" onClick={() => refetch()}>Try again</Button></div> : <>
          {attentionCount === 0 ? (
            <div className="flex items-center gap-2 rounded-[14px] border border-border/60 shadow-sm bg-white px-4 py-4 mb-5 text-sm text-foreground">
              <Check className="h-4 w-4 text-green-600" /> All caught up — nothing needs your attention right now.
            </div>
          ) : (
            <section className="rounded-[14px] border border-border/60 shadow-sm bg-white px-4 py-3 mb-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-1">
                Needs attention
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-xs font-semibold text-destructive">{attentionCount}</span>
              </h2>
              {aggregate && aggregate.pending > 0 && <AttentionRow tone="amber" title={`${aggregate.pending} pending approvals`} description="Awaiting your response — VI Branch, Main Location" action="Review" loading={reviewLoading && reviewBucket === "pending"} onClick={() => void loadReviewAppointments("pending")} />}
              {aggregate && aggregate.unpaid > 0 && <AttentionRow tone="red" title={`${aggregate.unpaid} unpaid balance${aggregate.unpaid === 1 ? "" : "s"}`} description="Not fully paid or refunded — Main Location" action="Review" loading={reviewLoading && reviewBucket === "unpaid"} onClick={() => void loadReviewAppointments("unpaid")} />}
              {pausedBranches.length > 0 && <AttentionRow tone="gray" title={`${pausedBranches.length} paused branch${pausedBranches.length === 1 ? "" : "es"}`} description={`${pausedBranches[0]?.label || "Branch"} — not taking new bookings`} action="Revive" onClick={() => pausedBranches[0]?.locationId && handleRevive(pausedBranches[0].locationId)} />}
              {pausedBranches.length > 0 && currentRole === "owner" && (
                <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3 mt-1 text-sm">
                  <span>Revive {pausedBranches[0]?.label || "this branch"} so it can take bookings again?</span>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" className="rounded-full">Not yet</Button>
                    <Button size="sm" className="rounded-full" disabled={Boolean(revivingLocationId)} onClick={() => pausedBranches[0]?.locationId && handleRevive(pausedBranches[0].locationId)}>{revivingLocationId ? "Reviving…" : "Revive branch"}</Button>
                  </div>
                </div>
              )}
            </section>
          )}
          {aggregate && <><OverviewSectionLabel>At a glance · {dateRange === "week" ? "this week" : dateRange}</OverviewSectionLabel><div className="business-overview__metrics" data-tour-id="tour-hub-overview"><MetricCard icon={Building2} label="Branches" value={filteredLocations.length} />{canViewRevenue && <MetricCard icon={Coins} label="Inflow" value={formatCurrency(aggregate.revenue, aggregate.currency)} tone="purple" />}<MetricCard icon={Calendar} label="Bookings" value={aggregate.bookings} /><MetricCard icon={Users} label="Staff Online" value={aggregate.staff} tone="green" /></div></>}
          <div className="business-overview__section-heading"><OverviewSectionLabel>Branches</OverviewSectionLabel><span>Click a branch for its full report</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5" data-tour-id="tour-branch-performance">
            {filteredLocations.map((location, index) => <BranchCard key={location.id} location={location} canViewRevenue={canViewRevenue} top={index === 0} needsAttention={location.unpaidBalances > 0 || location.staffOnline === 0} onClick={() => setSelectedLocation(location)} />)}
            {filteredLocations.length === 0 && <div className="business-overview__empty">Add a branch to see its performance here.</div>}
          </div>
          <div className="business-overview__section-heading"><OverviewSectionLabel>Marketing overview · {dateRange === "week" ? "this week" : dateRange}</OverviewSectionLabel><Button variant="outline" className="rounded-full" onClick={() => navigate("/salon/marketing")}><Plus className="w-4 h-4 mr-2" /> Send a message</Button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {marketingCards.map(({ title, icon: Icon, tone, email, sms }) => (
              <div className="rounded-[14px] border border-border/60 shadow-sm bg-white p-4" key={title}>
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[10px] mb-3",
                  tone === "purple" ? "bg-purple-500/10 text-purple-600" : tone === "pink" ? "bg-pink-500/10 text-pink-600" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{title}</p>
                <div className="flex gap-4 mt-2.5">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> Email <b className="text-foreground font-semibold">{email}</b></span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" /> SMS <b className="text-foreground font-semibold">{sms}</b></span>
                </div>
              </div>
            ))}
          </div>
        </>}
      </div>
      <Dialog open={Boolean(selectedLocation)} onOpenChange={(open) => !open && setSelectedLocation(null)}><DialogContent className="business-overview__detail-dialog"><DialogHeader><DialogTitle>{selectedLocation?.name}</DialogTitle><DialogDescription>{selectedLocation?.city}</DialogDescription></DialogHeader>{selectedLocation && <><div className="business-overview__detail-stats"><MetricCard label="Inflow" value={canViewRevenue ? formatCurrency(selectedLocation.revenue, selectedLocation.currency) : "—"} /><MetricCard label="Bookings" value={selectedLocation.bookingCount} /><MetricCard label="Staff" value={selectedLocation.staffOnline} tone="green" /></div><Button className="business-overview__full-report" onClick={async () => { await setActiveContext("location", selectedLocation.id); navigate("/salon/reports"); }}>Open full report <ArrowUpRight /></Button></>}</DialogContent></Dialog>
      <Dialog open={Boolean(reviewBucket)} onOpenChange={(open) => !open && setReviewBucket(null)}><DialogContent className="business-overview__review-dialog"><DialogHeader><DialogTitle>{reviewBucket === "pending" ? "Pending approvals" : "Unpaid balances"}</DialogTitle><DialogDescription>Select an appointment to open its review screen.</DialogDescription></DialogHeader><div className="business-overview__review-list">{reviewAppointments.map((appointment) => { const location = locationById.get(appointment.location_id); const name = [appointment.customer?.first_name, appointment.customer?.last_name].filter(Boolean).join(" ") || "Unnamed customer"; return <button type="button" key={appointment.id} className="business-overview__review-item" onClick={() => void navigateToReviewAppointment(appointment, reviewBucket!)}><span><strong>{name}</strong><small>{location ? `${location.name} · ${location.city}` : "Branch"}{appointment.scheduled_start ? ` · ${new Date(appointment.scheduled_start).toLocaleDateString()}` : ""}</small></span><ChevronRight /></button>; })}{!reviewAppointments.length && <p className="business-overview__empty">No appointments need review.</p>}</div></DialogContent></Dialog>
      <AddSalonDialog open={addSalonOpen} onOpenChange={setAddSalonOpen} onSuccess={async () => { await Promise.all([refetch(), refreshTenants()]); }} compact />
    </SalonSidebar>
  );
}

function OverviewSectionLabel({ children }: { children: React.ReactNode }) { return <p className="business-overview__eyebrow">{children}</p>; }
function MetricCard({ icon: Icon, label, value, tone = "default" }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone?: string }) {
	const iconBg = tone === "purple" ? "bg-purple-500/10" : tone === "green" ? "bg-green-500/10" : "bg-primary/[0.08]";
	const iconColor = tone === "purple" ? "text-purple-600" : tone === "green" ? "text-green-600" : "text-primary";
	return (
		<div className={`business-overview__metric ${tone} flex items-center justify-between gap-3 px-4 py-4 sm:px-5 bg-white rounded-[14px] border border-border/60 shadow-sm`}>
			<div>
				<span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
				<strong className="mt-1 block font-serif text-xl font-semibold sm:text-2xl">{value}</strong>
			</div>
			{Icon && (
				<div className={`flex h-10 w-10 items-center justify-center rounded-[10px] flex-shrink-0 ${iconBg}`}>
					<Icon className={`h-5 w-5 ${iconColor}`} />
				</div>
			)}
		</div>
	);
}
function AttentionRow({ tone, title, description, action, onClick, loading }: { tone: string; title: string; description: string; action: string; onClick: () => void; loading?: boolean }) {
	const iconBg = tone === "amber" ? "bg-amber-500/10 text-amber-600" : tone === "red" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
	return (
		<button type="button" className="flex w-full items-center gap-3 border-t border-border/60 py-3 text-left first:border-t-0 disabled:opacity-60" onClick={onClick} disabled={loading}>
			<span className={cn("flex h-9 w-9 items-center justify-center rounded-[8px] flex-shrink-0", iconBg)}>
				{tone === "amber" ? <Clock3 className="h-4 w-4" /> : tone === "red" ? <CreditCard className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-sm font-semibold">{title}</span>
				<span className="block text-xs text-muted-foreground">{description}</span>
			</span>
			<span className="flex items-center gap-1 flex-shrink-0 text-xs font-semibold text-primary">
				{loading ? "Loading…" : action} <ChevronRight className="h-3.5 w-3.5" />
			</span>
		</button>
	);
}
function BranchCard({ location, canViewRevenue, top, needsAttention, onClick }: { location: LocationPerformance; canViewRevenue: boolean; top: boolean; needsAttention: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"text-left rounded-[14px] border shadow-sm bg-white p-4 transition-colors hover:border-primary/40",
				needsAttention ? "border-amber-300 bg-amber-50/40" : "border-border/60",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="text-sm font-semibold truncate">{location.name}</p>
					<p className="text-xs text-muted-foreground">{location.city}</p>
				</div>
				<div className="flex gap-1 flex-shrink-0">
					{top && <Badge variant="success">Top</Badge>}
					{needsAttention && <Badge variant="warning">Needs attention</Badge>}
				</div>
			</div>
			<div className="flex gap-5 mt-3">
				<div className="flex flex-col gap-0.5">
					<span className="text-xs text-muted-foreground">Inflow</span>
					<span className="text-sm font-semibold">{canViewRevenue ? formatCurrency(location.revenue, location.currency) : "—"}</span>
				</div>
				<div className="flex flex-col gap-0.5">
					<span className="text-xs text-muted-foreground">Bookings</span>
					<span className="text-sm font-semibold">{location.bookingCount}</span>
				</div>
				<div className="flex flex-col gap-0.5">
					<span className="text-xs text-muted-foreground">Staff</span>
					<span className={cn("text-sm font-semibold", location.staffOnline > 0 ? "text-green-600" : "text-destructive")}>{location.staffOnline}</span>
				</div>
			</div>
		</button>
	);
}
