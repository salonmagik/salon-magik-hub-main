import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute, PublicOnlyRoute, OnboardingRoute } from "@/components/auth/ProtectedRoute";

// Marketing pages
import LandingPage from "./pages/marketing/LandingPage";
import PricingPage from "./pages/marketing/PricingPage";
import SupportPage from "./pages/marketing/SupportPage";
import TermsPage from "./pages/marketing/TermsPage";
import PrivacyPage from "./pages/marketing/PrivacyPage";

// Auth pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import AcceptInvitePage from "./pages/auth/AcceptInvitePage";
import InvitationExpiredPage from "./pages/auth/InvitationExpiredPage";

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

// Client Portal
import { ClientAuthProvider } from "@/hooks/client/useClientAuth";
import { ClientProtectedRoute, ClientPublicOnlyRoute } from "@/components/client/ClientProtectedRoute";
import ClientLoginPage from "./pages/client/ClientLoginPage";
import ClientDashboard from "./pages/client/ClientDashboard";
import ClientBookingsPage from "./pages/client/ClientBookingsPage";
import ClientBookingDetailPage from "./pages/client/ClientBookingDetailPage";
import ClientHistoryPage from "./pages/client/ClientHistoryPage";
import ClientRefundsPage from "./pages/client/ClientRefundsPage";
import ClientNotificationsPage from "./pages/client/ClientNotificationsPage";
import ClientProfilePage from "./pages/client/ClientProfilePage";
import ClientHelpPage from "./pages/client/ClientHelpPage";

// Public Booking
import BookingPage from "./pages/booking/BookingPage";

// Other pages
import NotFound from "./pages/NotFound";

 // BackOffice
 import { BackofficeAuthProvider } from "@/hooks/backoffice";
 import { BackofficeProtectedRoute, BackofficePublicRoute } from "@/components/backoffice/BackofficeProtectedRoute";
 import BackofficeLoginPage from "./pages/backoffice/BackofficeLoginPage";
 import BackofficeVerify2FAPage from "./pages/backoffice/BackofficeVerify2FAPage";
 import BackofficeSetup2FAPage from "./pages/backoffice/BackofficeSetup2FAPage";
 import BackofficeDashboardPage from "./pages/backoffice/BackofficeDashboardPage";
 import WaitlistPage from "./pages/backoffice/WaitlistPage";
 import TenantsPage from "./pages/backoffice/TenantsPage";
 import FeatureFlagsPage from "./pages/backoffice/FeatureFlagsPage";
 import PlansPage from "./pages/backoffice/PlansPage";
 import ImpersonationPage from "./pages/backoffice/ImpersonationPage";
 import BackofficeSettingsPage from "./pages/backoffice/SettingsPage";
 
const queryClient = new QueryClient();

// Smart root route component - redirects based on auth state
function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return null;
  
  // Authenticated users go to salon, unauthenticated see landing page
  return isAuthenticated ? <Navigate to="/salon" replace /> : <LandingPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Landing Page - smart redirect based on auth */}
            <Route path="/" element={<RootRoute />} />

            {/* Marketing Pages */}
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />

            {/* Public Auth Routes - redirect if already logged in */}
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />

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
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/invitation-expired" element={<InvitationExpiredPage />} />

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
                  <SalonDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/appointments"
              element={
                <ProtectedRoute>
                  <AppointmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/customers"
              element={
                <ProtectedRoute>
                  <CustomersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/services"
              element={
                <ProtectedRoute>
                  <ServicesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/payments"
              element={
                <ProtectedRoute>
                  <PaymentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/messaging"
              element={
                <ProtectedRoute>
                  <MessagingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/journal"
              element={
                <ProtectedRoute>
                  <JournalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/staff"
              element={
                <ProtectedRoute>
                  <StaffPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/calendar"
              element={
                <ProtectedRoute>
                  <CalendarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/salon/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
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

            {/* Public Booking Platform */}
            <Route path="/b/:slug" element={<BookingPage />} />

            {/* Client Portal Routes - wrapped in ClientAuthProvider */}
            <Route
              path="/client/login"
              element={
                <ClientAuthProvider>
                  <ClientPublicOnlyRoute>
                    <ClientLoginPage />
                  </ClientPublicOnlyRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientDashboard />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/bookings"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientBookingsPage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/bookings/:id"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientBookingDetailPage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/history"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientHistoryPage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/refunds"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientRefundsPage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/notifications"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientNotificationsPage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/profile"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientProfilePage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />
            <Route
              path="/client/help"
              element={
                <ClientAuthProvider>
                  <ClientProtectedRoute>
                    <ClientHelpPage />
                  </ClientProtectedRoute>
                </ClientAuthProvider>
              }
            />

            {/* BackOffice Routes */}
             <Route
               path="/backoffice/login"
               element={
                 <BackofficeAuthProvider>
                   <BackofficePublicRoute>
                     <BackofficeLoginPage />
                   </BackofficePublicRoute>
                 </BackofficeAuthProvider>
               }
             />
             <Route
               path="/backoffice/verify-2fa"
               element={
                 <BackofficeAuthProvider>
                   <BackofficeVerify2FAPage />
                 </BackofficeAuthProvider>
               }
             />
             <Route
               path="/backoffice/setup-2fa"
               element={
                 <BackofficeAuthProvider>
                   <BackofficeSetup2FAPage />
                 </BackofficeAuthProvider>
               }
             />
             <Route
               path="/backoffice"
               element={
                 <BackofficeAuthProvider>
                   <BackofficeProtectedRoute>
                     <BackofficeDashboardPage />
                   </BackofficeProtectedRoute>
                 </BackofficeAuthProvider>
               }
             />
             <Route
               path="/backoffice/waitlist"
               element={
                 <BackofficeAuthProvider>
                   <BackofficeProtectedRoute>
                     <WaitlistPage />
                   </BackofficeProtectedRoute>
                 </BackofficeAuthProvider>
               }
             />
             <Route
               path="/backoffice/tenants"
               element={
                 <BackofficeAuthProvider>
                   <BackofficeProtectedRoute>
                     <TenantsPage />
                   </BackofficeProtectedRoute>
                 </BackofficeAuthProvider>
               }
             />
          <Route
            path="/backoffice/feature-flags"
            element={
              <BackofficeAuthProvider>
                <BackofficeProtectedRoute>
                  <FeatureFlagsPage />
                </BackofficeProtectedRoute>
              </BackofficeAuthProvider>
            }
          />
          <Route
            path="/backoffice/plans"
            element={
              <BackofficeAuthProvider>
                <BackofficeProtectedRoute>
                  <PlansPage />
                </BackofficeProtectedRoute>
              </BackofficeAuthProvider>
            }
          />
          <Route
            path="/backoffice/impersonation"
            element={
              <BackofficeAuthProvider>
                <BackofficeProtectedRoute>
                  <ImpersonationPage />
                </BackofficeProtectedRoute>
              </BackofficeAuthProvider>
            }
          />
          <Route
            path="/backoffice/settings"
            element={
              <BackofficeAuthProvider>
                <BackofficeProtectedRoute>
                  <BackofficeSettingsPage />
                </BackofficeProtectedRoute>
              </BackofficeAuthProvider>
            }
          />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
