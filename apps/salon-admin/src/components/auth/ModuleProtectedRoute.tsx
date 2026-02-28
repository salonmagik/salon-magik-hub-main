import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isModuleAllowedInContext } from "@/lib/contextAccess";
import { supabase } from "@/lib/supabase";

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
  const { hasPermission, isLoading, currentRole: permissionRole } = usePermissions();
  const location = useLocation();
  const {
    user,
    currentTenant,
    activeContextType,
    currentRole,
    isLoading: authLoading,
    hasCompletedOnboarding,
    isAssignmentPending,
  } = useAuth();
  const isGuardBootstrapping =
    authLoading || (hasCompletedOnboarding && (!currentTenant?.id || !permissionRole));
  const hasOwnAppointmentsAccess = module === "appointments" && hasPermission("appointments:own");
  const hasModuleAccess = hasPermission(module) || hasOwnAppointmentsAccess;
  const isContextAllowed = isModuleAllowedInContext(module, activeContextType, location.pathname);
  const requiresStrictContext = location.pathname === "/salon/overview/staff";
  const ownerBypass = currentRole === "owner";
  const isAllowed = ownerBypass || (hasModuleAccess && (!requiresStrictContext || isContextAllowed));

  useEffect(() => {
    if (
      isLoading ||
      isGuardBootstrapping ||
      isAssignmentPending ||
      isAllowed ||
      hasModuleAccess ||
      !currentTenant?.id ||
      !user?.id
    )
      return;
    (async () => {
      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "access.denied",
        _entity_type: "module",
        _entity_id: user.id,
        _metadata: {
          module,
          context_type: activeContextType,
          reason: "permission_denied",
        },
      });
    })();
  }, [activeContextType, currentTenant?.id, hasModuleAccess, isAllowed, isAssignmentPending, isGuardBootstrapping, isLoading, module, user?.id]);

  if (isLoading || isGuardBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAssignmentPending) {
    return <Navigate to="/salon/assignment-pending" replace />;
  }

  if (!ownerBypass && !isContextAllowed && requiresStrictContext) {
    return <Navigate to="/salon/staff" replace />;
  }

  if (!isAllowed) {
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
  const { activeContextType } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!hasPermission(module) || !isModuleAllowedInContext(module, activeContextType)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
