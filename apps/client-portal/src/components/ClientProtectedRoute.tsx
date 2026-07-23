import { Navigate, useLocation } from "react-router-dom";
import { useClientAuth } from "@/hooks";
import { BrandLoader } from "@ui/brand-loader";

interface ClientProtectedRouteProps {
  children: React.ReactNode;
}

type RouteState = {
  from?: {
    pathname?: string;
  };
};

export function ClientProtectedRoute({ children }: ClientProtectedRouteProps) {
  const { isLoading, isAuthenticated, requiresPasswordSetup } = useClientAuth();
  const location = useLocation();

  if (isLoading) {
    return <BrandLoader fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiresPasswordSetup && location.pathname !== "/complete-account") {
    return <Navigate to="/complete-account" replace />;
  }

  return <>{children}</>;
}

// For the client login route - redirect to dashboard if already logged in
export function ClientPublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useClientAuth();
  const location = useLocation();

  if (isLoading) {
    return <BrandLoader fullScreen />;
  }

  if (isAuthenticated) {
    const routeState = location.state as RouteState | null;
    const from = routeState?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}
