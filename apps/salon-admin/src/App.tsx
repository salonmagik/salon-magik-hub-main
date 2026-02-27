import { Toaster } from "@ui/toaster";
import { Toaster as Sonner } from "@ui/sonner";
import { TooltipProvider } from "@ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute, PublicOnlyRoute, OnboardingRoute } from "@/components/auth/ProtectedRoute";
import { ModuleProtectedRoute } from "@/components/auth/ModuleProtectedRoute";

// Auth pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import InvitationExpiredPage from "./pages/auth/InvitationExpiredPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";

// Onboarding
import OnboardingPage from "./pages/onboarding/OnboardingPage";

// Salon pages
import SalonDashboard from "./pages/salon/SalonDashboard";
import AppointmentsPage from "./pages/salon/AppointmentsPage";
import CustomersPage from "./pages/salon/CustomersPage";
import ServicesPage from "./pages/salon/ServicesPage";
import SettingsPage from "./pages/salon/SettingsPage";
import PaymentsPage from "./pages/salon/PaymentsPage";
import ReportsPage from "./pages/salon/ReportsPage";
import MessagingPage from "./pages/salon/MessagingPage";
import JournalPage from "./pages/salon/JournalPage";
import HelpPage from "./pages/salon/HelpPage";
import StaffPage from "./pages/salon/StaffPage";
import CalendarPage from "./pages/salon/CalendarPage";
import EmailTemplatesPage from "./pages/salon/EmailTemplatesPage";
import AccessDeniedPage from "./pages/salon/AccessDeniedPage";
import AssignmentPendingPage from "./pages/salon/AssignmentPendingPage";
import AuditLogPage from "./pages/salon/AuditLogPage";
import SalonsOverviewPage from "./pages/salon/SalonsOverviewPage";

// Other pages
import NotFound from "./pages/NotFound";

// BackOffice (separate app; routes removed here)
 
const queryClient = new QueryClient();

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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
