import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@ui/tooltip";
import ClientLoginPage from "@/pages/ClientLoginPage";
import ClientDashboard from "@/pages/ClientDashboard";
import ClientBookingsPage from "@/pages/ClientBookingsPage";
import ClientPackagesPage from "@/pages/ClientPackagesPage";
import ClientProductsPage from "@/pages/ClientProductsPage";
import ClientVouchersPage from "@/pages/ClientVouchersPage";
import ClientBookingDetailPage from "@/pages/ClientBookingDetailPage";
import ClientHistoryPage from "@/pages/ClientHistoryPage";
import ClientStoreCreditPage from "@/pages/ClientStoreCreditPage";
import ClientStoreCreditDetailPage from "@/pages/ClientStoreCreditDetailPage";
import ClientNotificationsPage from "@/pages/ClientNotificationsPage";
import ClientProfilePage from "@/pages/ClientProfilePage";
import ClientHelpPage from "@/pages/ClientHelpPage";
import ClientCompleteAccountPage from "@/pages/ClientCompleteAccountPage";
import { ClientAuthProvider, ConfirmDetailsPromptProvider } from "@/hooks";
import { ClientProtectedRoute, ClientPublicOnlyRoute } from "@/components/ClientProtectedRoute";

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <ClientAuthProvider>
        <ConfirmDetailsPromptProvider>
          <Routes>
          <Route
            path="/login"
            element={
              <ClientPublicOnlyRoute>
                <ClientLoginPage />
              </ClientPublicOnlyRoute>
            }
          />
          <Route
            path="/complete-account"
            element={
              <ClientProtectedRoute>
                <ClientCompleteAccountPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ClientProtectedRoute>
                <ClientDashboard />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ClientProtectedRoute>
                <ClientBookingsPage />
              </ClientProtectedRoute>
            }
          />
          <Route path="/bookings/upcoming" element={<Navigate to="/bookings" replace />} />
          <Route path="/bookings/packages" element={<Navigate to="/packages" replace />} />
          <Route
            path="/packages"
            element={
              <ClientProtectedRoute>
                <ClientPackagesPage />
              </ClientProtectedRoute>
            }
          />
          <Route path="/bookings/products" element={<Navigate to="/orders" replace />} />
          <Route
            path="/orders"
            element={
              <ClientProtectedRoute>
                <ClientProductsPage />
              </ClientProtectedRoute>
            }
          />
          <Route path="/bookings/vouchers" element={<Navigate to="/vouchers" replace />} />
          <Route
            path="/vouchers"
            element={
              <ClientProtectedRoute>
                <ClientVouchersPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/bookings/:id"
            element={
              <ClientProtectedRoute>
                <ClientBookingDetailPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ClientProtectedRoute>
                <ClientHistoryPage />
              </ClientProtectedRoute>
            }
          />
          <Route path="/balance" element={<Navigate to="/store-credit" replace />} />
          <Route
            path="/store-credit"
            element={
              <ClientProtectedRoute>
                <ClientStoreCreditPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/store-credit/:customerId"
            element={
              <ClientProtectedRoute>
                <ClientStoreCreditDetailPage />
              </ClientProtectedRoute>
            }
          />
          <Route path="/refunds" element={<Navigate to="/store-credit" replace />} />
          <Route
            path="/notifications"
            element={
              <ClientProtectedRoute>
                <ClientNotificationsPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ClientProtectedRoute>
                <ClientProfilePage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/help"
            element={
              <ClientProtectedRoute>
                <ClientHelpPage />
              </ClientProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ConfirmDetailsPromptProvider>
        </ClientAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
