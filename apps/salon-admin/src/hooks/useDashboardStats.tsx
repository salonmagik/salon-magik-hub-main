import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import type { Tables } from "@supabase-client";

type Appointment = Tables<"appointments">;

interface DashboardStats {
  todayAppointments: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  totalCustomers: number;
  revenueToday: number;
  outstandingFees: number;
  purseUsage: number;
  refundsPendingApproval: number;
  communicationCredits: number;
  lowCommunicationCredits: boolean;
}

interface UpcomingAppointment {
  id: string;
  time: string;
  customer: string;
  service: string;
  status: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  href: string;
}

interface Insight {
  id: string;
  title: string;
  value: string;
  icon: string;
}

interface RecentActivity {
  id: string;
  type: "payment" | "refund" | "appointment" | "system";
  title: string;
  description: string;
  timestamp: string;
}

export function useDashboardStats() {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    confirmedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    totalCustomers: 0,
    revenueToday: 0,
    outstandingFees: 0,
    purseUsage: 0,
    refundsPendingApproval: 0,
    communicationCredits: 0,
    lowCommunicationCredits: false,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!currentTenant?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    try {
      let todayAppointmentsQuery = supabase
        .from("appointments")
        .select(`
            *,
            customer:customers(full_name),
            services:appointment_services(service_name)
          `)
        .eq("tenant_id", currentTenant.id)
        .gte("scheduled_start", startOfDay)
        .lte("scheduled_start", endOfDay)
        .order("scheduled_start", { ascending: true });

      let completedAppointmentsQuery = supabase
        .from("appointments")
        .select(`
            scheduled_start,
            services:appointment_services(service_name)
          `)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "completed");

      if (hasScope) {
        todayAppointmentsQuery = todayAppointmentsQuery.in("location_id", scopedLocationIds);
        completedAppointmentsQuery = completedAppointmentsQuery.in("location_id", scopedLocationIds);
      }

      // Parallel fetch all data
      const [
        todayAptsResult,
        customerCountResult,
        outstandingFeesResult,
        purseUsageResult,
        refundsPendingResult,
        creditsResult,
        servicesCountResult,
        productsCountResult,
        recentTransactionsResult,
        recentNotificationsResult,
        completedAptsResult,
      ] = await Promise.all([
        // Today's appointments with customer info
        todayAppointmentsQuery,

        // Total customers
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id),

        // Outstanding fees (sum of customers.outstanding_balance)
        supabase
          .from("customers")
          .select("outstanding_balance")
          .eq("tenant_id", currentTenant.id)
          .gt("outstanding_balance", 0),

        // Purse usage (sum of customer_purses.balance)
        supabase
          .from("customer_purses")
          .select("balance")
          .eq("tenant_id", currentTenant.id),

        // Refunds pending approval
        supabase
          .from("refund_requests")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("status", "pending"),

        // Communication credits
        supabase
          .from("communication_credits")
          .select("balance")
          .eq("tenant_id", currentTenant.id)
          .maybeSingle(),

        // Services count for checklist
        supabase
          .from("services")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id),

        // Products count for checklist
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id),

        // Recent transactions for activity
        supabase
          .from("transactions")
          .select("id, type, amount, currency, created_at, customer:customers(full_name)")
          .eq("tenant_id", currentTenant.id)
          .order("created_at", { ascending: false })
          .limit(5),

        // Recent notifications for activity
        supabase
          .from("notifications")
          .select("*")
          .eq("tenant_id", currentTenant.id)
          .order("created_at", { ascending: false })
          .limit(5),

        // All completed appointments for insights
        completedAppointmentsQuery,
      ]);

      // Process today's appointments
      const apts = todayAptsResult.data || [];
      const confirmedCount = apts.filter((a) => a.status === "scheduled").length;
      const completedCount = apts.filter((a) => a.status === "completed").length;
      const cancelledCount = apts.filter((a) => a.status === "cancelled").length;
      const revenueToday = apts
        .filter((a) => a.status === "completed")
        .reduce((sum, a) => sum + Number(a.amount_paid || 0), 0);

      // Calculate outstanding fees
      const outstandingFees = (outstandingFeesResult.data || []).reduce(
        (sum, c) => sum + Number(c.outstanding_balance || 0),
        0
      );

      // Calculate purse usage
      const purseUsage = (purseUsageResult.data || []).reduce(
        (sum, p) => sum + Number(p.balance || 0),
        0
      );

      // Get communication credits
      const communicationCredits = creditsResult.data?.balance || 0;

      setStats({
        todayAppointments: apts.length,
        confirmedCount,
        completedCount,
        cancelledCount,
        totalCustomers: customerCountResult.count || 0,
        revenueToday,
        outstandingFees,
        purseUsage,
        refundsPendingApproval: refundsPendingResult.count || 0,
        communicationCredits,
        lowCommunicationCredits: communicationCredits < 5,
      });

      // Format upcoming appointments
      const upcoming: UpcomingAppointment[] = apts
        .filter((a) => a.status !== "completed" && a.status !== "cancelled")
        .slice(0, 5)
        .map((a) => {
          const startTime = a.scheduled_start
            ? new Date(a.scheduled_start).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "—";
          const customerData = a.customer as { full_name: string } | null;
          const servicesData = a.services as { service_name: string }[] | null;

          return {
            id: a.id,
            time: startTime,
            customer: customerData?.full_name || "Unknown",
            service: servicesData?.[0]?.service_name || "Service",
            status: a.status,
          };
        });

      setUpcomingAppointments(upcoming);

      // Build checklist items
      const checklist: ChecklistItem[] = [
        {
          id: "services",
          label: "Add services",
          completed: (servicesCountResult.count || 0) > 0,
          href: "/salon/services?tab=services",
        },
        {
          id: "products",
          label: "Add products",
          completed: (productsCountResult.count || 0) > 0,
          href: "/salon/services?tab=products",
        },
        {
          id: "payments",
          label: "Configure payments",
          completed: true, // Platform managed, always complete
          href: "/salon/settings?tab=payments",
        },
        {
          id: "booking",
          label: "Enable online booking",
          completed: currentTenant.online_booking_enabled || false,
          href: "/salon/settings?tab=booking",
        },
        {
          id: "customer",
          label: "Add first customer",
          completed: (customerCountResult.count || 0) > 0,
          href: "/salon/customers",
        },
        {
          id: "appointment",
          label: "Book first appointment",
          completed: apts.length > 0 || (completedAptsResult.data?.length || 0) > 0,
          href: "/salon/appointments",
        },
      ];

      setChecklistItems(checklist);

      // Calculate insights (only if enough data)
      const completedApts = completedAptsResult.data || [];
      const insightsData: Insight[] = [];

      // Busiest day (requires ≥10 completed appointments)
      if (completedApts.length >= 10) {
        const dayCount: Record<string, number> = {};
        completedApts.forEach((apt) => {
          if (apt.scheduled_start) {
            const day = new Date(apt.scheduled_start).toLocaleDateString("en-US", {
              weekday: "long",
            });
            dayCount[day] = (dayCount[day] || 0) + 1;
          }
        });
        const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
        if (busiestDay) {
          insightsData.push({
            id: "busiest-day",
            title: "Busiest Day",
            value: busiestDay[0],
            icon: "calendar",
          });
        }
      }

      // Top service (requires ≥5 completed appointments)
      if (completedApts.length >= 5) {
        const serviceCount: Record<string, number> = {};
        completedApts.forEach((apt) => {
          const services = apt.services as { service_name: string }[] | null;
          services?.forEach((s) => {
            serviceCount[s.service_name] = (serviceCount[s.service_name] || 0) + 1;
          });
        });
        const topService = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0];
        if (topService) {
          insightsData.push({
            id: "top-service",
            title: "Top Service",
            value: topService[0],
            icon: "star",
          });
        }
      }

      setInsights(insightsData);

      // Build recent activity
      const activity: RecentActivity[] = [];

      // Add recent transactions
      (recentTransactionsResult.data || []).forEach((tx) => {
        const customerData = tx.customer as { full_name: string } | null;
        activity.push({
          id: tx.id,
          type: "payment",
          title: `Payment ${tx.type}`,
          description: `${tx.currency} ${tx.amount} from ${customerData?.full_name || "Customer"}`,
          timestamp: tx.created_at,
        });
      });

      // Add recent notifications
      (recentNotificationsResult.data || []).forEach((notif) => {
        activity.push({
          id: notif.id,
          type: notif.urgent ? "system" : "appointment",
          title: notif.title,
          description: notif.description,
          timestamp: notif.created_at,
        });
      });

      // Sort by timestamp and take top 8
      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activity.slice(0, 8));
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, currentTenant?.online_booking_enabled, hasScope, scopedLocationIds]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Calculate checklist progress
  const checklistProgress = checklistItems.length > 0
    ? Math.round((checklistItems.filter((item) => item.completed).length / checklistItems.length) * 100)
    : 0;

  const isChecklistComplete = checklistProgress === 100;

  return {
    stats,
    upcomingAppointments,
    checklistItems,
    checklistProgress,
    isChecklistComplete,
    insights,
    recentActivity,
    isLoading,
    refetch: fetchStats,
  };
}
