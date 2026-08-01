import { Toaster } from "@ui/toaster";
import { Toaster as Sonner } from "@ui/sonner";
import { TooltipProvider } from "@ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute, PublicOnlyRoute, OnboardingRoute } from "@/components/auth/ProtectedRoute";
import { ModuleProtectedRoute } from "@/components/auth/ModuleProtectedRoute";
import { needsGoogleProfileCompletion } from "@/lib/authCompletion";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignupPage = lazy(() => import("./pages/auth/SignupPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const InvitationExpiredPage = lazy(() => import("./pages/auth/InvitationExpiredPage"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage"));
const CompleteSignupPage = lazy(() => import("./pages/auth/CompleteSignupPage"));
const OnboardingPage = lazy(() => import("./pages/onboarding/OnboardingPage"));
const OnboardingCompletePage = lazy(() => import("./pages/onboarding/OnboardingCompletePage"));
const SalonDashboard = lazy(() => import("./pages/salon/SalonDashboard"));
const AppointmentsPage = lazy(() => import("./pages/salon/AppointmentsPage"));
const CustomersPage = lazy(() => import("./pages/salon/CustomersPage"));
const ServicesPage = lazy(() => import("./pages/salon/ServicesPage"));
const SettingsPage = lazy(() => import("./pages/salon/SettingsPage"));
const BusinessSettingsPage = lazy(() => import("./pages/salon/BusinessSettingsPage"));
const BranchSettingsPage = lazy(() => import("./pages/salon/BranchSettingsPage"));
const PaymentsPage = lazy(() => import("./pages/salon/PaymentsPage"));
const ReportsPage = lazy(() => import("./pages/salon/ReportsPage"));
const MessagingPage = lazy(() => import("./pages/salon/MessagingPage"));
const HelpPage = lazy(() => import("./pages/salon/HelpPage"));
const StaffPage = lazy(() => import("./pages/salon/StaffPage"));
const MyShiftPage = lazy(() => import("./pages/salon/MyShiftPage"));
const EmailTemplatesPage = lazy(() => import("./pages/salon/EmailTemplatesPage"));
const AccessDeniedPage = lazy(() => import("./pages/salon/AccessDeniedPage"));
const AssignmentPendingPage = lazy(() => import("./pages/salon/AssignmentPendingPage"));
const AuditLogPage = lazy(() => import("./pages/salon/AuditLogPage"));
const SalonsOverviewPage = lazy(() => import("./pages/salon/SalonsOverviewPage"));
const InvoicePaymentLinkDemo = lazy(() => import("./pages/salon/InvoicePaymentLinkDemo"));
const AllNotificationsPage = lazy(() => import("./pages/salon/AllNotificationsPage"));
const ThemesSettingsPage = lazy(() => import("./pages/salon/ThemesSettingsPage"));
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

const SALON_PHRASES = [
  "Styling...",
  "Trimming...",
  "Retouching...",
  "Blending...",
  "Finishing up...",
];

function RouteLoading() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % SALON_PHRASES.length),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  const phrase = SALON_PHRASES[idx];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-[52px] w-[52px] loader-spin">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="morph-icon"
              style={{ animationDelay: `${-(i * 2.5)}s` }}
            >
              <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
                <path
                  d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
                  stroke="#F4C84E"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="16" r="2.1" fill="hsl(var(--primary))" />
              </svg>
            </div>
          ))}
        </div>
        <p key={phrase} className="loading-text text-sm text-muted-foreground">
          {phrase}
        </p>
      </div>
    </div>
  );
}

// Smart root route component - redirects based on auth state
function RootRoute() {
  const { isAuthenticated, isLoading, hasCompletedOnboarding, isAssignmentPending, getFirstAllowedRoute, user } = useAuth();
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

  if (needsGoogleProfileCompletion(user)) {
    return <Navigate to="/complete-signup" replace />;
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
              <Route
                path="/complete-signup"
                element={
                  <ProtectedRoute requireOnboarding={false}>
                    <CompleteSignupPage />
                  </ProtectedRoute>
                }
              />

              {/* Onboarding - requires auth but NOT onboarding completion */}
              <Route
                path="/onboarding"
                element={
                  <OnboardingRoute>
                    <OnboardingPage />
                  </OnboardingRoute>
                }
              />

              {/* Rendered right after onboarding completes. Uses the plain
                  ProtectedRoute (not OnboardingRoute) since hasCompletedOnboarding
                  is already true by the time we navigate here. */}
              <Route
                path="/onboarding/complete"
                element={
                  <ProtectedRoute>
                    <OnboardingCompletePage />
                  </ProtectedRoute>
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

              {/* Invoice Payment Link Demo */}
              <Route
                path="/salon/invoice-payment-demo"
                element={
                  <ProtectedRoute>
                    <ModuleProtectedRoute module="dashboard">
                      <InvoicePaymentLinkDemo />
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
              <Route path="/salon/calendar" element={<Navigate to="/salon/appointments" replace />} />
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
                path="/salon/transactions"
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
              <Route path="/salon/cash-tracker" element={<Navigate to="/salon/transactions?type=cash" replace />} />
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
                path="/salon/my-shift"
                element={
                  <ProtectedRoute>
                    <MyShiftPage />
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
                path="/salon/business-settings"
                element={
                  <ProtectedRoute>
                    <ModuleProtectedRoute module="settings">
                      <BusinessSettingsPage />
                    </ModuleProtectedRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/salon/branch-settings"
                element={
                  <ProtectedRoute>
                    <ModuleProtectedRoute module="settings">
                      <BranchSettingsPage />
                    </ModuleProtectedRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/salon/themes-settings"
                element={
                  <ProtectedRoute>
                    <ModuleProtectedRoute module="settings">
                      <ThemesSettingsPage />
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
                path="/salon/all-notifications"
                element={
                  <ProtectedRoute>
                    <AllNotificationsPage />
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
