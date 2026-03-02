import { Toaster } from "@ui/toaster";
import { Toaster as Sonner } from "@ui/sonner";
import { TooltipProvider } from "@ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute, PublicOnlyRoute, OnboardingRoute } from "@/components/auth/ProtectedRoute";
import { ModuleProtectedRoute } from "@/components/auth/ModuleProtectedRoute";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignupPage = lazy(() => import("./pages/auth/SignupPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const InvitationExpiredPage = lazy(() => import("./pages/auth/InvitationExpiredPage"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage"));
const OnboardingPage = lazy(() => import("./pages/onboarding/OnboardingPage"));
const SalonDashboard = lazy(() => import("./pages/salon/SalonDashboard"));
const AppointmentsPage = lazy(() => import("./pages/salon/AppointmentsPage"));
const CustomersPage = lazy(() => import("./pages/salon/CustomersPage"));
const ServicesPage = lazy(() => import("./pages/salon/ServicesPage"));
const SettingsPage = lazy(() => import("./pages/salon/SettingsPage"));
const PaymentsPage = lazy(() => import("./pages/salon/PaymentsPage"));
const ReportsPage = lazy(() => import("./pages/salon/ReportsPage"));
const MessagingPage = lazy(() => import("./pages/salon/MessagingPage"));
const JournalPage = lazy(() => import("./pages/salon/JournalPage"));
const HelpPage = lazy(() => import("./pages/salon/HelpPage"));
const StaffPage = lazy(() => import("./pages/salon/StaffPage"));
const CalendarPage = lazy(() => import("./pages/salon/CalendarPage"));
const EmailTemplatesPage = lazy(() => import("./pages/salon/EmailTemplatesPage"));
const AccessDeniedPage = lazy(() => import("./pages/salon/AccessDeniedPage"));
const AssignmentPendingPage = lazy(() => import("./pages/salon/AssignmentPendingPage"));
const AuditLogPage = lazy(() => import("./pages/salon/AuditLogPage"));
const SalonsOverviewPage = lazy(() => import("./pages/salon/SalonsOverviewPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

// BackOffice (separate app; routes removed here)
 
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

// Smart root route component - redirects based on auth state
function RootRoute() {
  const { isAuthenticated, isLoading, hasCompletedOnboarding, isAssignmentPending, getFirstAllowedRoute } = useAuth();
  const [targetRoute, setTargetRoute] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !hasCompletedOnboarding) {
      setTargetRoute(null);
      return;
    }
    if (isAssignmentPending) {
      setTargetRoute("/salon/assignment-pending");
      return;
    }
    let mounted = true;
    (async () => {
      const route = await getFirstAllowedRoute();
      if (mounted) {
        setTargetRoute(route);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getFirstAllowedRoute, hasCompletedOnboarding, isAssignmentPending, isAuthenticated, isLoading]);

  if (isLoading) return null;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!targetRoute) return null;

  return <Navigate to={targetRoute} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
            {/* Root - smart redirect based on auth */}
            <Route path="/" element={<RootRoute />} />

            {/* Public Auth Routes - redirect if already logged in */}
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicOnlyRoute>
                  <SignupPage />
                </PublicOnlyRoute>
              }
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invitation-expired" element={<InvitationExpiredPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Onboarding - requires auth but NOT onboarding completion */}
            <Route
              path="/onboarding"
              element={
                <OnboardingRoute>
                  <OnboardingPage />
                </OnboardingRoute>
              }
            />

            {/* Protected Salon Platform Routes */}
            <Route
              path="/salon"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="dashboard">
                    <SalonDashboard />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/appointments"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="appointments">
                    <AppointmentsPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/customers"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="customers">
                    <CustomersPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/services"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="services">
                    <ServicesPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/payments"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="payments">
                    <PaymentsPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/reports"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="reports">
                    <ReportsPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/messaging"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="messaging">
                    <MessagingPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/journal"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="journal">
                    <JournalPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/staff"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="staff">
                    <StaffPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/calendar"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="calendar">
                    <CalendarPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/settings"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="settings">
                    <SettingsPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/access-denied"
              element={
                <ProtectedRoute>
                  <AccessDeniedPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/assignment-pending"
              element={
                <ProtectedRoute>
                  <AssignmentPendingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/email-templates"
              element={
                <ProtectedRoute>
                  <EmailTemplatesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/help"
              element={
                <ProtectedRoute>
                  <HelpPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/audit-log"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="audit_log">
                    <AuditLogPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/overview"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="salons_overview">
                    <SalonsOverviewPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/overview/staff"
              element={
                <ProtectedRoute>
                  <ModuleProtectedRoute module="staff">
                    <StaffPage />
                  </ModuleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* (Client portal, public booking, and backoffice live in their own apps) */}

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
