import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@ui/toaster";
import { Toaster as Sonner } from "@ui/sonner";
import BackofficeLoginPage from "@/pages/BackofficeLoginPage";
import BackofficeForgotPasswordPage from "@/pages/BackofficeForgotPasswordPage";
import BackofficeResetPasswordPage from "@/pages/BackofficeResetPasswordPage";
import BackofficeVerify2FAPage from "@/pages/BackofficeVerify2FAPage";
import BackofficeSetup2FAPage from "@/pages/BackofficeSetup2FAPage";
import ChangePasswordPage from "@/pages/ChangePasswordPage";
import BackofficeDashboardPage from "@/pages/BackofficeDashboardPage";
import CustomersWaitlistsPage from "@/pages/customers/CustomersWaitlistsPage";
import CustomersTenantsPage from "@/pages/customers/CustomersTenantsPage";
import CustomersOpsMonitorPage from "@/pages/customers/CustomersOpsMonitorPage";
import FeatureFlagsPage from "@/pages/FeatureFlagsPage";
import PlansPage from "@/pages/PlansPage";
import ImpersonationPage from "@/pages/ImpersonationPage";
import BackofficeSettingsPage from "@/pages/SettingsPage";
import AdminsPage from "@/pages/AdminsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import SalesOpsPage from "@/pages/SalesOpsPage";
import CampaignsPage from "@/pages/sales/CampaignsPage";
import CaptureClientPage from "@/pages/sales/CaptureClientPage";
import ConversionsPage from "@/pages/sales/ConversionsPage";
import { BackofficeAuthProvider } from "@/hooks/useBackofficeAuth";
import { BackofficeProtectedRoute, BackofficePublicRoute } from "@/components/BackofficeProtectedRoute";

function App() {
  return (
    <>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <BackofficeAuthProvider>
          <Routes>
          <Route
            path="/login"
            element=
              {
                <BackofficePublicRoute>
                  <BackofficeLoginPage />
                </BackofficePublicRoute>
              }
          />
          <Route
            path="/forgot-password"
            element=
              {
                <BackofficePublicRoute>
                  <BackofficeForgotPasswordPage />
                </BackofficePublicRoute>
              }
          />
          <Route
            path="/reset-password"
            element=
              {
                <BackofficePublicRoute>
                  <BackofficeResetPasswordPage />
                </BackofficePublicRoute>
              }
          />
          <Route
            path="/verify-2fa"
            element={
              <BackofficeProtectedRoute>
                <BackofficeVerify2FAPage />
              </BackofficeProtectedRoute>
            }
          />
          <Route
            path="/setup-2fa"
            element={
              <BackofficeProtectedRoute>
                <BackofficeSetup2FAPage />
              </BackofficeProtectedRoute>
            }
          />
          <Route
            path="/change-password"
            element={
              <BackofficeProtectedRoute>
                <ChangePasswordPage />
              </BackofficeProtectedRoute>
            }
          />

          <Route
            path="/"
            element=
              {
                <BackofficeProtectedRoute>
                  <BackofficeDashboardPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/waitlist"
            element=
              {
                <BackofficeProtectedRoute>
                  <Navigate to="/customers/waitlists" replace />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/tenants"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="customers_tenants">
                  <Navigate to="/customers/tenants" replace />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/customers/waitlists"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="customers_waitlists">
                  <CustomersWaitlistsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/customers/tenants"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="customers_tenants">
                  <CustomersTenantsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/customers/ops-monitor"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="customers_ops_monitor">
                  <CustomersOpsMonitorPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/feature-flags"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="feature_flags">
                  <FeatureFlagsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/plans"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="plans">
                  <PlansPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/impersonation"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="impersonation">
                  <ImpersonationPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/admins"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="admins">
                  <AdminsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales"
            element=
              {
                <BackofficeProtectedRoute>
                  <SalesOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales/campaigns"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="sales_campaigns" requiredPermissionKey="sales.manage_campaigns">
                  <CampaignsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales/capture-client"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="sales_capture_client" requiredPermissionKey="sales.capture_client">
                  <CaptureClientPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales/conversions"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="sales_conversions" requiredPermissionKey="sales.view_conversions">
                  <ConversionsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/settings"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="settings">
                  <BackofficeSettingsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/audit-logs"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="audit_logs">
                  <AuditLogsPage />
                </BackofficeProtectedRoute>
              }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BackofficeAuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
