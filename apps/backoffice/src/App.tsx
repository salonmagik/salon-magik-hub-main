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
import WaitlistPage from "@/pages/WaitlistPage";
import TenantsPage from "@/pages/TenantsPage";
import FeatureFlagsPage from "@/pages/FeatureFlagsPage";
import PlansPage from "@/pages/PlansPage";
import ImpersonationPage from "@/pages/ImpersonationPage";
import BackofficeSettingsPage from "@/pages/SettingsPage";
import AdminsPage from "@/pages/AdminsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import SalesOpsPage from "@/pages/SalesOpsPage";
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
                  <WaitlistPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/tenants"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="tenants">
                  <TenantsPage />
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
                <BackofficeProtectedRoute>
                  <PlansPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/impersonation"
            element=
              {
                <BackofficeProtectedRoute>
                  <ImpersonationPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/admins"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="admins" requiredPermissionKey="admins.manage_templates">
                  <AdminsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="sales_ops">
                  <SalesOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/settings"
            element=
              {
                <BackofficeProtectedRoute>
                  <BackofficeSettingsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/audit-logs"
            element=
              {
                <BackofficeProtectedRoute>
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
