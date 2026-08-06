import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
import { Button } from "@ui/button";
import {
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  CreditCard,
  Globe,
  List,
  Calendar,
  Check,
  AlertTriangle,
  RefreshCcw,
  Lightbulb,
  Bell,
  Star,
  Wallet,
  MessageSquare,
  Info,
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import type { LapsedClient, UpcomingAppointment } from "@/hooks/useDashboardStats";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";

// ─── Checklist metadata ────────────────────────────────────────────────────────
// Exported so HelpPage's "Getting Started" tab can reuse the exact same
// icon/description mapping instead of keeping its own separate, drifting copy.
export const CHECKLIST_META: Record<
  string,
  { icon: React.ElementType; iconBg: string; iconColor: string; description: string; actionLabel: string; warningTag?: string }
> = {
  payments: {
    icon: CreditCard,
    iconBg: "bg-destructive-bg",
    iconColor: "text-destructive",
    description: "Online deposits can't be settled to you until this is added.",
    actionLabel: "Set up",
    warningTag: "Blocks deposits",
  },
  booking: {
    icon: Globe,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "Let clients book themselves through your link.",
    actionLabel: "Enable",
  },
  products: {
    icon: List,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "Sell retail items alongside your services.",
    actionLabel: "Add",
  },
  appointment: {
    icon: Calendar,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "See how your calendar comes together.",
    actionLabel: "Book",
  },
  services: {
    icon: Check,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "",
    actionLabel: "Add",
  },
  customer: {
    icon: Check,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    description: "",
    actionLabel: "Add",
  },
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<
  string,
  { bg: string; text: string }
> = {
  Confirmed: { bg: "bg-success-bg", text: "text-success" },
  "Awaiting deposit": { bg: "bg-warning-bg", text: "text-warning-foreground" },
  "In progress": { bg: "bg-primary/10", text: "text-primary" },
  Completed: { bg: "bg-muted", text: "text-muted-foreground" },
  Cancelled: { bg: "bg-destructive-bg", text: "text-destructive" },
  Unconfirmed: { bg: "bg-warning-bg", text: "text-warning-foreground" },
};

// ─── Trend text helper ─────────────────────────────────────────────────────────
function TrendText({
  value,
  suffix,
  nullLabel = "—",
}: {
  value: number | null;
  suffix: string;
  nullLabel?: string;
}) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">{nullLabel}</span>;
  }
  if (value > 0) {
    return (
      <span className="text-[12.5px] text-success">
        ↑ {Math.abs(value)} {suffix}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="text-[12.5px] text-destructive">
        ↓ {Math.abs(value)} {suffix}
      </span>
    );
  }
  return <span className="text-[12.5px] text-muted-foreground">Same as last week</span>;
}

// ─── Activity icons ───────────────────────────────────────────────────────────
const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  payment: CreditCard,
  refund: RefreshCcw,
  appointment: Calendar,
  system: Bell,
};

export default function SalonDashboard() {
  const navigate = useNavigate();
  const { currentTenant, profile, currentRole, activeContextType, setActiveContext, canUseOwnerHub } = useAuth();
  const { hasPermission } = usePermissions();
  const {
    stats,
    upcomingAppointments,
    checklistItems,
    checklistProgress,
    isChecklistComplete,
    insights,
    recentActivity,
    lapsedClients,
    isLoading,
  } = useDashboardStats();

  const [checklistExpanded, setChecklistExpanded] = useState(true);

  const { data: chainUnlockRequest } = useQuery({
    queryKey: ["dashboard-chain-unlock-request", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id || String(currentTenant.plan || "").toLowerCase() !== "chain") return null;
      const { data, error } = await (supabase
        .from("tenant_chain_unlock_requests" as any)
        .select("requested_locations, allowed_locations, status")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);
      if (error) throw error;
      return data || null;
    },
    enabled: Boolean(currentTenant?.id),
  });

  const canViewPayments = hasPermission("payments");
  const canViewCustomers = hasPermission("customers");
  const canViewReports = hasPermission("reports");
  const isOwnerOrManager = currentRole === "owner" || currentRole === "manager" || currentRole === "supervisor";

  const currency = currentTenant?.currency || "GHS";
  const firstName = profile?.full_name?.split(" ")[0] || null;

  // Sort checklist: incomplete first
  const incompleteItems = checklistItems.filter((i) => !i.completed);
  const completedItems = checklistItems.filter((i) => i.completed);
  const sortedChecklist = [...incompleteItems, ...completedItems];

  const completedCount = completedItems.length;
  const totalCount = checklistItems.length;

  useWalkthroughAutoTrigger("dashboard");

  return (
		<SalonSidebar>
			<div className="space-y-6 max-w-[1320px]">
				{/* ── Page header ────────────────────────────────────────────── */}
				<div data-tour-id="tour-recap">
					<h1 className="text-[22px] tracking-tight">Dashboard</h1>
					<p className="text-[13.5px] text-muted-foreground mt-1">
						{firstName ? `Welcome back, ${firstName}!` : "Welcome back!"} Here's
						what's happening today.
					</p>
				</div>

				{/* ── Checklist ──────────────────────────────────────────────── */}
				{!isChecklistComplete && isOwnerOrManager && totalCount > 0 && (
					<div className="bg-white rounded-[22px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] overflow-hidden">
						{/* Header row */}
						<div className="px-[26px] pt-[22px] pb-3">
							<div className="flex items-center gap-3.5">
								<div className="w-[38px] h-[38px] rounded-[10px] bg-primary/10 flex items-center justify-center flex-shrink-0">
									<CheckCircle2 className="w-[18px] h-[18px] text-primary" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-base font-medium">
										Complete your salon setup
									</div>
									<div className="flex items-center gap-3 mt-2">
										<div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
											<div
												className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
												style={{ width: `${checklistProgress}%` }}
											/>
										</div>
										<span className="text-[12.5px] text-muted-foreground/70 whitespace-nowrap flex-shrink-0">
											{completedCount} of {totalCount} done
										</span>
									</div>
								</div>
								<button
									type="button"
									onClick={() => setChecklistExpanded((v) => !v)}
									className="p-1 text-muted-foreground/70 hover:text-foreground transition-colors flex-shrink-0"
								>
									{checklistExpanded ? (
										<ChevronUp className="w-4 h-4" />
									) : (
										<ChevronDown className="w-4 h-4" />
									)}
								</button>
							</div>
						</div>

						{/* Items */}
						{checklistExpanded && (
							<div className="px-[26px] pb-2">
								{sortedChecklist.map((item) => {
									const meta = CHECKLIST_META[item.id];
									if (!meta) return null;
									const Icon = meta.icon;

									if (item.completed) {
										return (
											<div
												key={item.id}
												className="flex items-center gap-3.5 py-[13px] border-t border-black/[0.06]"
											>
												<div className="w-8 h-8 rounded-[9px] bg-success-bg flex items-center justify-center flex-shrink-0">
													<Check className="w-[15px] h-[15px] text-success" />
												</div>
												<span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40">
													{item.label}
												</span>
											</div>
										);
									}

									const isFlagged = Boolean(meta.warningTag);

									return (
										<div
											key={item.id}
											className="flex items-center gap-3.5 py-[13px] border-t border-black/[0.06]"
										>
											<div
												className={`w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}
											>
												<Icon
													className={`w-[15px] h-[15px] ${meta.iconColor}`}
												/>
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="text-sm font-medium">
														{item.label}
													</span>
													{isFlagged && (
														<span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-destructive-bg text-destructive">
															{meta.warningTag}
														</span>
													)}
												</div>
												{meta.description && !meta.warningTag && (
													<p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">
														{meta.description}
													</p>
												)}
											</div>
											<Button
												size="sm"
												variant="outline"
												className="flex-shrink-0 rounded-full text-xs h-8 px-4"
												onClick={async () => {
													if (
														item.id === "payments" &&
														canUseOwnerHub &&
														activeContextType !== "owner_hub"
													) {
														await setActiveContext("owner_hub", null);
													}
													navigate(item.href);
												}}
											>
												{meta.actionLabel}
											</Button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

				{/* ── Chain unlock pending ────────────────────────────────────── */}
				{chainUnlockRequest && (
					<div className="bg-warning-bg/50 border border-warning-bg rounded-[22px] p-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-medium text-warning-foreground text-sm">
									Chain expansion pending approval
								</p>
								<p className="text-xs text-warning-foreground/70 mt-0.5">
									You requested {chainUnlockRequest.requested_locations} stores.{" "}
									{chainUnlockRequest.allowed_locations} are currently active.
								</p>
							</div>
							<Button
								size="sm"
								variant="outline"
								className="flex-shrink-0 text-xs"
								onClick={() => navigate("/salon/overview")}
							>
								View salons
							</Button>
						</div>
					</div>
				)}

				{/* ── Messaging credits warning ───────────────────────────────── */}
				{stats.lowCommunicationCredits && (
					<div className="flex items-center justify-between gap-3 bg-warning-bg/60 border border-warning-bg rounded-[14px] px-4 py-3">
						<div className="flex items-center gap-2.5">
							<MessageSquare className="w-4 h-4 text-warning-foreground flex-shrink-0" />
							<p className="text-sm text-warning-foreground">
								{stats.communicationCredits === 0 ? (
									<span className="font-medium">You're out of SMS marketing credits.</span>
								) : (
									<>
										<span className="font-medium">SMS marketing credits are running low</span> —{" "}
										{stats.communicationCredits} remaining.
									</>
								)}
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="text-xs h-7 px-3 flex-shrink-0"
							onClick={() => navigate("/salon/subscription")}
						>
							Top up
						</Button>
					</div>
				)}

				{/* ── 4 Stat cards ───────────────────────────────────────────── */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					{/* TODAY'S BOOKINGS */}
					<div className="bg-white rounded-[14px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-5">
						{isLoading ? (
							<>
								<Skeleton className="h-3 w-24 mb-4" />
								<Skeleton className="h-9 w-12 mb-2" />
								<Skeleton className="h-3 w-32" />
							</>
						) : (
							<>
								<p className="text-[12px] tracking-[0.05em] text-muted-foreground uppercase mb-2.5">
									Today's Bookings
								</p>
								<p className="font-serif text-[26px] leading-none">
									{stats.todayAppointments}
								</p>
								<div className="mt-2">
									<TrendText
										value={stats.todayBookingsTrend}
										suffix="more than usual"
										nullLabel={`${stats.confirmedCount} confirmed`}
									/>
								</div>
							</>
						)}
					</div>

					{/* TOTAL REVENUE */}
					<div className="bg-white rounded-[14px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-5">
						{isLoading ? (
							<>
								<Skeleton className="h-3 w-24 mb-4" />
								<Skeleton className="h-9 w-28 mb-2" />
								<Skeleton className="h-3 w-32" />
							</>
						) : (
							<>
								<p className="text-[12px] tracking-[0.05em] text-muted-foreground uppercase mb-2.5">
									Total Revenue
								</p>
								<p className="font-serif text-[26px] leading-none">
									{canViewPayments
										? `${currency} ${stats.revenueToday.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
										: "—"}
								</p>
								<div className="mt-2">
									{canViewPayments && stats.revenueTrendPct !== null ? (
										<TrendText
											value={stats.revenueTrendPct}
											suffix={`% vs last ${stats.trendDayName}`}
										/>
									) : (
										<span className="text-xs text-muted-foreground">
											Collected today
										</span>
									)}
								</div>
							</>
						)}
					</div>

					{/* SHOW-UP RATE */}
					<div className="bg-white rounded-[14px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-5">
						{isLoading ? (
							<>
								<Skeleton className="h-3 w-24 mb-4" />
								<Skeleton className="h-9 w-16 mb-2" />
								<Skeleton className="h-3 w-28" />
							</>
						) : (
							<>
								<div className="flex items-center gap-1 mb-2.5">
									<p className="text-[12px] tracking-[0.05em] text-muted-foreground uppercase">
										Show-up Rate
									</p>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="h-3 w-3 text-muted-foreground cursor-default" />
										</TooltipTrigger>
										<TooltipContent side="top" className="max-w-56 text-xs">
											Share of booked appointments the customer actually showed up to, over the last 7 days.
										</TooltipContent>
									</Tooltip>
								</div>
								<p className="font-serif text-[26px] leading-none">
									{canViewReports && stats.showUpRate !== null
										? `${stats.showUpRate}%`
										: "—"}
								</p>
								<div className="mt-2">
									{canViewReports && stats.showUpRateTrend !== null ? (
										<TrendText
											value={stats.showUpRateTrend}
											suffix="pts this week"
											nullLabel="Last 7 days"
										/>
									) : (
										<span className="text-xs text-muted-foreground">
											Last 7 days
										</span>
									)}
								</div>
							</>
						)}
					</div>

					{/* NEW CLIENTS */}
					<div className="bg-white rounded-[14px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-5">
						{isLoading ? (
							<>
								<Skeleton className="h-3 w-20 mb-4" />
								<Skeleton className="h-9 w-8 mb-2" />
								<Skeleton className="h-3 w-28" />
							</>
						) : (
							<>
								<p className="text-[12px] tracking-[0.05em] text-muted-foreground uppercase mb-2.5">
									New Clients
								</p>
								<p className="font-serif text-[26px] leading-none">
									{canViewCustomers ? stats.newClientsThisWeek : "—"}
								</p>
								<div className="mt-2">
									{canViewCustomers && stats.newClientsTrend !== null ? (
										<TrendText
											value={stats.newClientsTrend}
											suffix="vs last week"
											nullLabel="This week"
										/>
									) : (
										<span className="text-xs text-muted-foreground">
											This week
										</span>
									)}
								</div>
							</>
						)}
					</div>
				</div>

				{/* ── Today's schedule + Account summary ─────────────────────── */}
				<div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
					{/* Today's schedule */}
					<div className="bg-white rounded-[22px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] overflow-hidden">
						<div className="flex items-center justify-between px-6 pt-6 pb-4">
							<h2 className="text-[15.5px] font-medium">Today's schedule</h2>
							<button
								type="button"
								onClick={() => navigate("/salon/appointments?view=calendar&period=week")}
								className="text-sm text-foreground hover:text-primary transition-colors"
							>
								View calendar →
							</button>
						</div>

						{isLoading ? (
							<div className="divide-y divide-black/[0.06]">
								{Array.from({ length: 4 }).map((_, i) => (
									<div key={i} className="flex items-center gap-4 px-6 py-4">
										<Skeleton className="h-6 w-16 flex-shrink-0" />
										<div className="flex-1">
											<Skeleton className="h-4 w-28 mb-1.5" />
											<Skeleton className="h-3 w-36" />
										</div>
										<Skeleton className="h-6 w-24 rounded-full flex-shrink-0" />
									</div>
								))}
							</div>
						) : upcomingAppointments.length === 0 ? (
							<div className="text-center py-12 pb-10">
								<Calendar className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2.5" />
								<p className="text-sm text-muted-foreground">
									No appointments scheduled for today
								</p>
							</div>
						) : (
							<div className="divide-y divide-black/[0.06]">
								{upcomingAppointments.map((apt: UpcomingAppointment) => {
									const badge =
										STATUS_STYLES[apt.displayStatus] ||
										STATUS_STYLES["Confirmed"];
									return (
										<div
											key={apt.id}
											className="flex items-center gap-4 px-6 py-4"
										>
											<div className="w-[62px] flex-shrink-0">
												<span className="font-serif text-[15px] text-primary">
													{apt.time}m
												</span>
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium leading-tight truncate">
													{apt.customer}
												</p>
												<p className="text-xs text-muted-foreground mt-0.5 truncate">
													{apt.service}
													{apt.staffFirstName && `, with ${apt.staffFirstName}`}
												</p>
											</div>
											<span
												className={`text-xs font-medium px-3 py-1 rounded-full flex-shrink-0 ${badge.bg} ${badge.text}`}
											>
												{apt.displayStatus}
											</span>
										</div>
									);
								})}
							</div>
						)}
					</div>

					{/* Account summary */}
					{(canViewPayments || canViewCustomers) && (
						<div className="bg-white rounded-[22px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-6">
							<h2 className="text-[15.5px] font-medium mb-2">
								Account summary
							</h2>
							{isLoading ? (
								<div>
									{[1, 2, 3].map((i) => (
										<div
											key={i}
											className="flex items-center gap-3 py-3.5 border-b border-black/[0.06] last:border-0"
										>
											<Skeleton className="w-[34px] h-[34px] rounded-[9px] flex-shrink-0" />
											<Skeleton className="h-4 flex-1" />
											<Skeleton className="h-4 w-14" />
										</div>
									))}
								</div>
							) : (
								<div>
									{/* Outstanding fees */}
									{canViewCustomers && canViewPayments && (
										<div className="flex items-center gap-3 py-3.5 border-b border-black/[0.06] last:border-0">
											<div className="w-[34px] h-[34px] rounded-[9px] bg-warning-bg flex items-center justify-center flex-shrink-0">
												<AlertTriangle className="w-4 h-4 text-warning-foreground" />
											</div>
											<div className="flex flex-1 items-center gap-1">
												<span className="text-[12.5px] text-muted-foreground">
													Outstanding fees
												</span>
												<Tooltip>
													<TooltipTrigger asChild>
														<Info className="h-3 w-3 text-muted-foreground cursor-default" />
													</TooltipTrigger>
													<TooltipContent side="top" className="max-w-56 text-xs">
														Unpaid balances from completed appointments — money customers still owe you.
													</TooltipContent>
												</Tooltip>
											</div>
											<span
												className={`font-serif text-[17px] tabular-nums ${stats.outstandingFees > 0 ? "text-foreground" : "text-muted-foreground"}`}
											>
												{currency} {stats.outstandingFees.toFixed(2)}
											</span>
										</div>
									)}

									{/* Refunds pending */}
									{canViewPayments && (
										<div className="flex items-center gap-3 py-3.5 border-b border-black/[0.06] last:border-0">
											<div className="w-[34px] h-[34px] rounded-[9px] bg-primary/10 flex items-center justify-center flex-shrink-0">
												<RefreshCcw className="w-4 h-4 text-primary" />
											</div>
											<div className="flex flex-1 items-center gap-1">
												<span className="text-[12.5px] text-muted-foreground">
													Refunds pending
												</span>
												<Tooltip>
													<TooltipTrigger asChild>
														<Info className="h-3 w-3 text-muted-foreground cursor-default" />
													</TooltipTrigger>
													<TooltipContent side="top" className="max-w-56 text-xs">
														Refund requests waiting on your approval.
													</TooltipContent>
												</Tooltip>
											</div>
											<span
												className={`font-serif text-[17px] tabular-nums ${stats.refundsPendingApproval > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}
											>
												{stats.refundsPendingApproval}
											</span>
										</div>
									)}

									{/* Prepaid customers */}
									{canViewPayments && (
										<div className="flex items-center gap-3 py-3.5 border-b border-black/[0.06] last:border-0">
											<div className="w-[34px] h-[34px] rounded-[9px] bg-primary/10 flex items-center justify-center flex-shrink-0">
												<Wallet className="w-4 h-4 text-primary" />
											</div>
											<div className="flex flex-1 items-center gap-1">
												<span className="text-[12.5px] text-muted-foreground">
													Prepaid customers
												</span>
												<Tooltip>
													<TooltipTrigger asChild>
														<Info className="h-3 w-3 text-muted-foreground cursor-default" />
													</TooltipTrigger>
													<TooltipContent side="top" className="max-w-56 text-xs">
														Customers with a positive salon balance — paid funds or store credit they can spend on a future visit.
													</TooltipContent>
												</Tooltip>
											</div>
											<span className="font-serif text-[17px] tabular-nums text-muted-foreground">
												{stats.prepaidCustomers}
											</span>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>

				{/* ── Clients to reconnect with ───────────────────────────────── */}
				{canViewCustomers && (
					<div>
						<div className="bg-white rounded-[22px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] overflow-hidden">
							<div className="flex items-center justify-between px-6 pt-6 pb-4">
								<h2 className="text-[15.5px] font-medium">
									Clients to reconnect with
								</h2>
								{lapsedClients.length > 0 && (
									<button
										type="button"
										onClick={() =>
											navigate("/salon/messaging", {
												state: {
													lapsedClientIds: lapsedClients.map((c) => c.id),
													templateType: "reactivation",
												},
											})
										}
										className="text-sm text-foreground hover:text-primary transition-colors"
									>
										Send reactivation →
									</button>
								)}
							</div>

							{isLoading ? (
								<div className="divide-y divide-black/[0.06]">
									{[1, 2, 3].map((i) => (
										<div
											key={i}
											className="grid grid-cols-[1fr_120px_1fr_140px_80px] gap-2 items-center px-5 py-4"
										>
											<Skeleton className="h-4 w-28" />
											<Skeleton className="h-4 w-20" />
											<Skeleton className="h-4 w-24" />
											<Skeleton className="h-6 w-24 rounded-full" />
											<Skeleton className="h-8 w-20 rounded-full" />
										</div>
									))}
								</div>
							) : lapsedClients.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-10 px-5 text-center">
									<Star className="w-8 h-8 text-muted-foreground/30 mb-3" />
									<p className="text-sm font-medium text-muted-foreground">
										All clients are up to date
									</p>
									<p className="text-xs text-muted-foreground/70 mt-1">
										Clients who haven't visited in 45+ days will appear here
									</p>
								</div>
							) : (
								<>
									<div className="grid grid-cols-[1fr_120px_1fr_140px_80px] gap-2 px-5 py-3 border-b border-black/[0.09]">
										{[
											"CLIENT",
											"LAST VISIT",
											"USUAL SERVICE",
											"STATUS",
											"",
										].map((col) => (
											<span
												key={col}
												className="text-[11px] tracking-[0.04em] text-muted-foreground/60 uppercase"
											>
												{col}
											</span>
										))}
									</div>
									<div className="divide-y divide-black/[0.06]">
										{lapsedClients.map((client: LapsedClient) => (
											<div
												key={client.id}
												className="grid grid-cols-[1fr_120px_1fr_140px_80px] gap-2 items-center px-5 py-4 hover:bg-muted/30 transition-colors"
											>
												<span className="text-sm font-medium truncate">
													{client.name}
												</span>
												<span className="text-sm text-muted-foreground">
													{client.daysSinceVisit} days ago
												</span>
												<span className="text-sm text-muted-foreground truncate">
													{client.usualService}
												</span>
												<span>
													<span
														className={`text-xs font-medium px-3 py-1 rounded-full inline-block ${
															client.clientStatus === "inactive"
																? "bg-destructive-bg text-destructive"
																: "bg-warning-bg text-warning-foreground"
														}`}
													>
														{client.clientStatus === "inactive"
															? "Inactive"
															: "Going quiet"}
													</span>
												</span>
												<div>
													<Button
														size="sm"
														variant="outline"
														className="rounded-full text-xs h-8 px-4 w-full"
														onClick={() =>
															navigate("/salon/messaging", {
																state: {
																	lapsedClientIds: [client.id],
																	templateType: "reactivation",
																},
															})
														}
													>
														Message
													</Button>
												</div>
											</div>
										))}
									</div>
								</>
							)}
						</div>
					</div>
				)}

				{/* ── Insights ──────────────────────────────────────────────── */}
				{/* {canViewReports && (
					<div className="bg-white rounded-[22px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-6">
						<div className="flex items-center gap-2.5 mb-5">
							<Lightbulb className="w-4 h-4 text-primary" />
							<h2 className="text-[15.5px] font-medium">Insights</h2>
						</div>
						{isLoading ? (
							<div className="grid sm:grid-cols-2 gap-3">
								<Skeleton className="h-16 rounded-xl" />
								<Skeleton className="h-16 rounded-xl" />
							</div>
						) : insights.length > 0 ? (
							<div className="grid sm:grid-cols-2 gap-3">
								{insights.map((insight) => (
									<div
										key={insight.id}
										className="flex items-center gap-3 p-4 rounded-xl bg-muted/40"
									>
										<div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
											{insight.icon === "calendar" ? (
												<Calendar className="w-4 h-4 text-primary" />
											) : (
												<Star className="w-4 h-4 text-primary" />
											)}
										</div>
										<div>
											<p className="text-xs text-muted-foreground">
												{insight.title}
											</p>
											<p className="text-sm font-medium mt-0.5">
												{insight.value}
											</p>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-10 text-center">
								<Lightbulb className="w-10 h-10 text-muted-foreground/25 mb-3" />
								<p className="text-sm text-muted-foreground max-w-xs">
									Keep going! Insights will appear once you have more
									appointment history.
								</p>
							</div>
						)}
					</div>
				)} */}

				{/* ── Recent Activity ────────────────────────────────────────── */}
				{/* <div className="bg-white rounded-[22px] border border-black/[0.06] shadow-[0_2px_8px_rgba(20,16,20,0.05)] p-6">
					<div className="flex items-center justify-between mb-5">
						<h2 className="text-[15.5px] font-medium">Recent Activity</h2>
						<button
							type="button"
							onClick={() => navigate("/salon/cash-tracker")}
							className="text-sm text-foreground hover:text-primary transition-colors"
						>
							View All →
						</button>
					</div>

					{isLoading ? (
						<div className="space-y-3">
							{Array.from({ length: 4 }).map((_, i) => (
								<div key={i} className="flex items-start gap-3">
									<Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
									<div className="flex-1">
										<Skeleton className="h-4 w-36 mb-1.5" />
										<Skeleton className="h-3 w-48" />
									</div>
								</div>
							))}
						</div>
					) : recentActivity.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center">
							<Bell className="w-10 h-10 text-muted-foreground/25 mb-3" />
							<p className="text-sm text-muted-foreground">
								No recent activity
							</p>
						</div>
					) : (
						<div className="space-y-1">
							{recentActivity.map((activity) => {
								const ActivityIcon = ACTIVITY_ICONS[activity.type] || Bell;
								return (
									<div
										key={activity.id}
										className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/40 transition-colors"
									>
										<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
											<ActivityIcon className="w-4 h-4 text-muted-foreground" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium truncate">
												{activity.title}
											</p>
											<p className="text-xs text-muted-foreground truncate">
												{activity.description}
											</p>
											<p className="text-xs text-muted-foreground/60 mt-0.5">
												{formatDistanceToNow(new Date(activity.timestamp), {
													addSuffix: true,
												})}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div> */}
			</div>
		</SalonSidebar>
	);
}
