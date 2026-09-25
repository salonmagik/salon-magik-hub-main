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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { AddSalonDialog } from "@/components/dialogs/AddSalonDialog";
import { LoadingState } from "@ui/loading-state";
import { formatCurrency } from "@shared/currency";
import { countryName } from "@/lib/countryCurrency";
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
          <div><h1>Business Overview</h1><p>{activeContextType === "owner_hub" ? "Track how your branches are performing across bookings, revenue, and staffing." : `Branch-scoped overview for ${availableContexts.find((context) => context.locationId === activeLocationId)?.label || "Selected branch"}`}</p></div>
          <div className="business-overview__actions">
            {availableCountries.length > 1 && <Select value={effectiveCountry} onValueChange={setSelectedCountry}><SelectTrigger className="business-overview__country"><SelectValue /></SelectTrigger><SelectContent>{availableCountries.map((country) => <SelectItem key={country} value={country}>{countryName(country)}</SelectItem>)}</SelectContent></Select>}
            <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}><SelectTrigger className="business-overview__period"><Calendar /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem></SelectContent></Select>
            <Button className="business-overview__add" onClick={() => setAddSalonOpen(true)}><Plus /> Add Branch</Button>
          </div>
        </header>
        {isLoading ? <div className="business-overview__loading">Loading your overview…</div> : error ? <div className="business-overview__error"><AlertCircle /><span>Failed to load branch data.</span><Button variant="outline" onClick={() => refetch()}>Try again</Button></div> : <>
          {attentionCount === 0 ? <div className="business-overview__caught-up"><Check /> All caught up — nothing needs your attention right now.</div> : <section className="business-overview__attention"><div className="business-overview__section-title"><h2>Needs attention <span>{attentionCount}</span></h2></div>{aggregate && aggregate.pending > 0 && <AttentionRow tone="amber" title={`${aggregate.pending} pending approvals`} description="Awaiting your response — VI Branch, Main Location" action="Review" loading={reviewLoading && reviewBucket === "pending"} onClick={() => void loadReviewAppointments("pending")} />}{aggregate && aggregate.unpaid > 0 && <AttentionRow tone="red" title={`${aggregate.unpaid} unpaid balance${aggregate.unpaid === 1 ? "" : "s"}`} description="Not fully paid or refunded — Main Location" action="Review" loading={reviewLoading && reviewBucket === "unpaid"} onClick={() => void loadReviewAppointments("unpaid")} />}{pausedBranches.length > 0 && <AttentionRow tone="gray" title={`${pausedBranches.length} paused branch${pausedBranches.length === 1 ? "" : "es"}`} description={`${pausedBranches[0]?.label || "Branch"} — not taking new bookings`} action="Revive" onClick={() => pausedBranches[0]?.locationId && handleRevive(pausedBranches[0].locationId)} />}{pausedBranches.length > 0 && currentRole === "owner" && <div className="business-overview__revive-confirm"><span>Revive {pausedBranches[0]?.label || "this branch"} so it can take bookings again?</span><div><Button variant="outline">Not yet</Button><Button className="business-overview__revive" disabled={Boolean(revivingLocationId)} onClick={() => pausedBranches[0]?.locationId && handleRevive(pausedBranches[0].locationId)}>{revivingLocationId ? "Reviving…" : "Revive branch"}</Button></div></div>}</section>}
          {aggregate && <><OverviewSectionLabel>At a glance · {dateRange === "week" ? "this week" : dateRange}</OverviewSectionLabel><div className="business-overview__metrics" data-tour-id="tour-hub-overview"><MetricCard icon={Building2} label="Branches" value={filteredLocations.length} />{canViewRevenue && <MetricCard icon={Coins} label="Inflow" value={formatCurrency(aggregate.revenue, aggregate.currency)} tone="purple" />}<MetricCard icon={Calendar} label="Bookings" value={aggregate.bookings} /><MetricCard icon={Users} label="Staff Online" value={aggregate.staff} tone="green" /></div></>}
          <div className="business-overview__section-heading"><OverviewSectionLabel>Branches</OverviewSectionLabel><span>Click a branch for its full report</span></div><div className="business-overview__branches" data-tour-id="tour-branch-performance">{filteredLocations.map((location, index) => <BranchCard key={location.id} location={location} canViewRevenue={canViewRevenue} top={index === 0} needsAttention={location.unpaidBalances > 0 || location.staffOnline === 0} onClick={() => setSelectedLocation(location)} />)}{filteredLocations.length === 0 && <div className="business-overview__empty">Add a branch to see its performance here.</div>}</div>
          <div className="business-overview__section-heading"><OverviewSectionLabel>Marketing overview · {dateRange === "week" ? "this week" : dateRange}</OverviewSectionLabel><Button variant="outline" className="business-overview__message" onClick={() => navigate("/salon/marketing")}><Plus /> Send a message</Button></div><div className="business-overview__marketing">{marketingCards.map(({ title, icon: Icon, tone, email, sms }) => <div className="business-overview__marketing-card" key={title}><div className={`business-overview__marketing-icon ${tone}`}><Icon /></div><strong>{title}</strong><div className="business-overview__channel-values"><span><Mail /> Email <b>{email}</b></span><span><MessageSquare /> SMS <b>{sms}</b></span></div></div>)}</div>
        </>}
      </div>
      <Dialog open={Boolean(selectedLocation)} onOpenChange={(open) => !open && setSelectedLocation(null)}><DialogContent className="business-overview__detail-dialog"><DialogHeader><DialogTitle>{selectedLocation?.name}</DialogTitle><DialogDescription>{selectedLocation?.city}</DialogDescription></DialogHeader>{selectedLocation && <><div className="business-overview__detail-stats"><MetricCard label="Inflow" value={canViewRevenue ? formatCurrency(selectedLocation.revenue, selectedLocation.currency) : "—"} /><MetricCard label="Bookings" value={selectedLocation.bookingCount} /><MetricCard label="Staff" value={selectedLocation.staffOnline} tone="green" /></div><Button className="business-overview__full-report" onClick={async () => { await setActiveContext("location", selectedLocation.id); navigate("/salon/reports"); }}>Open full report <ArrowUpRight /></Button></>}</DialogContent></Dialog>
      <Dialog open={Boolean(reviewBucket)} onOpenChange={(open) => !open && setReviewBucket(null)}><DialogContent className="business-overview__review-dialog"><DialogHeader><DialogTitle>{reviewBucket === "pending" ? "Pending approvals" : "Unpaid balances"}</DialogTitle><DialogDescription>Select an appointment to open its review screen.</DialogDescription></DialogHeader><div className="business-overview__review-list">{reviewAppointments.map((appointment) => { const location = locationById.get(appointment.location_id); const name = [appointment.customer?.first_name, appointment.customer?.last_name].filter(Boolean).join(" ") || "Unnamed customer"; return <button type="button" key={appointment.id} className="business-overview__review-item" onClick={() => void navigateToReviewAppointment(appointment, reviewBucket!)}><span><strong>{name}</strong><small>{location ? `${location.name} · ${location.city}` : "Branch"}{appointment.scheduled_start ? ` · ${new Date(appointment.scheduled_start).toLocaleDateString()}` : ""}</small></span><ChevronRight /></button>; })}{!reviewAppointments.length && <p className="business-overview__empty">No appointments need review.</p>}</div></DialogContent></Dialog>
      <AddSalonDialog open={addSalonOpen} onOpenChange={setAddSalonOpen} onSuccess={async () => { await Promise.all([refetch(), refreshTenants()]); }} compact />
    </SalonSidebar>
  );
}

function OverviewSectionLabel({ children }: { children: React.ReactNode }) { return <p className="business-overview__eyebrow">{children}</p>; }
function MetricCard({ icon: Icon, label, value, tone = "default" }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone?: string }) { return <div className={`business-overview__metric ${tone}`}>{Icon && <div className="business-overview__metric-icon"><Icon /></div>}<div><span>{label}</span><strong>{value}</strong></div></div>; }
function AttentionRow({ tone, title, description, action, onClick, loading }: { tone: string; title: string; description: string; action: string; onClick: () => void; loading?: boolean }) { return <button type="button" className="business-overview__attention-row" onClick={onClick} disabled={loading}><span className={`business-overview__attention-icon ${tone}`}>{tone === "amber" ? <Clock3 /> : tone === "red" ? <CreditCard /> : <PauseCircle />}</span><span className="business-overview__attention-copy"><strong>{title}</strong><small>{description}</small></span><span className="business-overview__attention-action">{loading ? "Loading…" : action} <ChevronRight /></span></button>; }
function BranchCard({ location, canViewRevenue, top, needsAttention, onClick }: { location: LocationPerformance; canViewRevenue: boolean; top: boolean; needsAttention: boolean; onClick: () => void }) { return <button type="button" className={`business-overview__branch-card ${needsAttention ? "attention" : ""}`} onClick={onClick}><div className="business-overview__branch-name"><span><strong>{location.name}</strong><small>{location.city}</small></span>{top && <em className="top">Top</em>}{needsAttention && <em className="needs">Needs attention</em>}</div><div className="business-overview__branch-stats"><span>Inflow <b>{canViewRevenue ? formatCurrency(location.revenue, location.currency) : "—"}</b></span><span>Bookings <b>{location.bookingCount}</b></span><span>Staff <b className={location.staffOnline > 0 ? "green-text" : "red-text"}>{location.staffOnline}</b></span></div></button>; }
