import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ClientLoginPage from "@/pages/ClientLoginPage";
import ClientDashboard from "@/pages/ClientDashboard";
import ClientBookingsPage from "@/pages/ClientBookingsPage";
import ClientBookingDetailPage from "@/pages/ClientBookingDetailPage";
import ClientHistoryPage from "@/pages/ClientHistoryPage";
import ClientRefundsPage from "@/pages/ClientRefundsPage";
import ClientNotificationsPage from "@/pages/ClientNotificationsPage";
import ClientProfilePage from "@/pages/ClientProfilePage";
import ClientHelpPage from "@/pages/ClientHelpPage";
import { ClientAuthProvider } from "@/hooks";
import { ClientProtectedRoute, ClientPublicOnlyRoute } from "@/components/ClientProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <ClientAuthProvider>
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
          <Route
            path="/refunds"
            element={
              <ClientProtectedRoute>
                <ClientRefundsPage />
              </ClientProtectedRoute>
            }
          />
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
      </ClientAuthProvider>
    </BrowserRouter>
  );
}

export default App;
