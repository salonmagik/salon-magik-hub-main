import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated, hasCompletedOnboarding, user, profile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // BackOffice users should not access salon routes - they have no profile
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // Check if user needs to reset password (invited staff with temp password)
  const requiresPasswordReset = user?.user_metadata?.requires_password_reset === true;
  if (requiresPasswordReset && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password?first_login=true" replace />;
  }

  // If onboarding is required but not completed, redirect to onboarding
  if (requireOnboarding && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

// For routes that should NOT be accessible after login (login, signup, etc.)
export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, hasCompletedOnboarding, profile } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Only redirect if authenticated AND has a profile (not a BackOffice-only user)
  if (isAuthenticated && profile) {
    const from = (location.state as any)?.from?.pathname || (hasCompletedOnboarding ? "/salon" : "/onboarding");
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}

// For the onboarding route specifically
export function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, hasCompletedOnboarding, profile } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // BackOffice users should not access onboarding - they have no profile
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // If onboarding is already completed, go to salon
  if (hasCompletedOnboarding) {
    return <Navigate to="/salon" replace />;
  }

  return <>{children}</>;
}
