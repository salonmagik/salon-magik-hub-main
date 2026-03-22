import { Navigate, useLocation } from "react-router-dom";
import { useClientAuth } from "@/hooks";
import { Loader2 } from "lucide-react";

interface ClientProtectedRouteProps {
  children: React.ReactNode;
}

type RouteState = {
  from?: {
    pathname?: string;
  };
};

export function ClientProtectedRoute({ children }: ClientProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useClientAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// For the client login route - redirect to dashboard if already logged in
export function ClientPublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useClientAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    const routeState = location.state as RouteState | null;
    const from = routeState?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}
