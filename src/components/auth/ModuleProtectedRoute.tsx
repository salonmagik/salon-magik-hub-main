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
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasPermission(module)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to={redirectTo} replace />;
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
