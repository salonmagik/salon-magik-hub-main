import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Auth pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";

// Salon pages
import SalonDashboard from "./pages/salon/SalonDashboard";
import AppointmentsPage from "./pages/salon/AppointmentsPage";
import {
  CustomersPage,
  ServicesPage,
  PaymentsPage,
  ReportsPage,
  MessagingPage,
  JournalPage,
  StaffPage,
  SettingsPage,
  HelpPage,
} from "./pages/salon/PlaceholderPages";

// Other pages
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Salon Platform Routes */}
          <Route path="/salon" element={<SalonDashboard />} />
          <Route path="/salon/appointments" element={<AppointmentsPage />} />
          <Route path="/salon/customers" element={<CustomersPage />} />
          <Route path="/salon/services" element={<ServicesPage />} />
          <Route path="/salon/payments" element={<PaymentsPage />} />
          <Route path="/salon/reports" element={<ReportsPage />} />
          <Route path="/salon/messaging" element={<MessagingPage />} />
          <Route path="/salon/journal" element={<JournalPage />} />
          <Route path="/salon/staff" element={<StaffPage />} />
          <Route path="/salon/settings" element={<SettingsPage />} />
          <Route path="/salon/help" element={<HelpPage />} />

          {/* Booking Platform Routes (placeholder) */}
          <Route path="/booking/*" element={<NotFound />} />

          {/* Client Portal Routes (placeholder) */}
          <Route path="/client/*" element={<NotFound />} />

          {/* BackOffice Routes (placeholder) */}
          <Route path="/backoffice/*" element={<NotFound />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
