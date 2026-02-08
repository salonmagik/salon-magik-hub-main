import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";

interface ModuleProtectedRouteProps {
  children: ReactNode;
  module: string;
  fallback?: ReactNode;
  redirectTo?: string;
}

/**
 * Wraps a route/component to check module-level permissions
 * If user doesn't have permission, redirects or shows fallback
 */
export function ModuleProtectedRoute({
  children,
  module,
  fallback,
  redirectTo = "/salon",
}: ModuleProtectedRouteProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasPermission(module)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to="/salon/access-denied" replace />;
  }

  return <>{children}</>;
}

/**
 * Simple component to conditionally render based on permission
 */
interface PermissionGateProps {
  children: ReactNode;
  module: string;
  fallback?: ReactNode;
}

export function PermissionGate({ children, module, fallback = null }: PermissionGateProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  if (!hasPermission(module)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
