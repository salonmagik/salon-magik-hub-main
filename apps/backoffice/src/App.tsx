import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@ui/toaster";
import { Toaster as Sonner } from "@ui/sonner";
import { TooltipProvider } from "@ui/tooltip";
import BackofficeLoginPage from "@/pages/BackofficeLoginPage";
import BackofficeForgotPasswordPage from "@/pages/BackofficeForgotPasswordPage";
import BackofficeResetPasswordPage from "@/pages/BackofficeResetPasswordPage";
import BackofficeVerify2FAPage from "@/pages/BackofficeVerify2FAPage";
import BackofficeSetup2FAPage from "@/pages/BackofficeSetup2FAPage";
import ChangePasswordPage from "@/pages/ChangePasswordPage";
import BackofficeDashboardPage from "@/pages/BackofficeDashboardPage";
import CustomersWaitlistsPage from "@/pages/customers/CustomersWaitlistsPage";
import CustomersTenantsPage from "@/pages/customers/CustomersTenantsPage";
import TenantWorkspacePage from "@/pages/customers/TenantWorkspacePage";
import CustomersUsersPage from "@/pages/customers/CustomersUsersPage";
import CustomersOpsMonitorPage from "@/pages/customers/CustomersOpsMonitorPage";
import CustomersSupportPage from "@/pages/customers/CustomersSupportPage";
import FeatureFlagsPage from "@/pages/FeatureFlagsPage";
import PlansPage from "@/pages/PlansPage";
import BackofficeSettingsPage from "@/pages/SettingsPage";
import AdminsPage from "@/pages/AdminsPage";
import SalesAgentCompliancePage from "@/pages/SalesAgentCompliancePage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import SalesOpsPage from "@/pages/SalesOpsPage";
import CommsPage from "@/pages/CommsPage";
import SubscriptionLedgerPage from "@/pages/SubscriptionLedgerPage";
import CommsCreditsPage from "@/pages/CommsCreditsPage";
import FlaggedSignupsPage from "@/pages/FlaggedSignupsPage";
import TransactionsPage from "@/pages/TransactionsPage";
import MoneyOpsPage from "@/pages/MoneyOpsPage";
import { BackofficeAuthProvider } from "@/hooks/useBackofficeAuth";
import { BackofficeProtectedRoute, BackofficePublicRoute } from "@/components/BackofficeProtectedRoute";

function App() {
  return (
    <TooltipProvider>
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
            path="/customers/tenants/:tenantId"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="customers_tenants">
                  <TenantWorkspacePage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/customers/users"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="customers_users">
                  <CustomersUsersPage />
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
            path="/customers/support"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="settings">
                  <CustomersSupportPage />
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
            path="/fees-margins"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="payment_fee_settings">
                  <MoneyOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/verification-queue"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="verification_queue">
                  <MoneyOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/withdrawals"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="withdrawals">
                  <MoneyOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/subscriptions"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="subscriptions">
                  <SubscriptionLedgerPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/comms-credits"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="comms_credits">
                  <CommsCreditsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/flagged-signups"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="flagged_signups">
                  <FlaggedSignupsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/transactions"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="transactions">
                  <TransactionsPage />
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
            path="/admins/sales-agents/:backofficeUserId"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="admins">
                  <SalesAgentCompliancePage />
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
          {/* Campaigns, Capture client, and Conversions & commissions are now tabs of
              one SalesOpsPage (matches the SalesOps.dc.html artifact board, which shows
              a single "Sales ops" page). The page gates each tab internally via
              hasBackofficePageAccess/hasBackofficePermission, so these three routes
              stay as deep links into the same component rather than separate pages. */}
          <Route
            path="/sales/campaigns"
            element=
              {
                <BackofficeProtectedRoute>
                  <SalesOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales/capture-client"
            element=
              {
                <BackofficeProtectedRoute>
                  <SalesOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/sales/conversions"
            element=
              {
                <BackofficeProtectedRoute>
                  <SalesOpsPage />
                </BackofficeProtectedRoute>
              }
          />
          <Route
            path="/comms"
            element=
              {
                <BackofficeProtectedRoute requiredPageKey="comms" requiredPermissionKey="comms.view">
                  <CommsPage />
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
          {/* Announcements is now a tab of CommsPage (CommsTemplates.dc.html artifact
              board shows one "Templates & announcements" page) — redirect so any
              bookmarked/old links still land somewhere real. */}
          <Route path="/product-announcements" element={<Navigate to="/comms" replace />} />
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
    </TooltipProvider>
  );
}

export default App;
