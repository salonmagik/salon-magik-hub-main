 import { Navigate, useLocation } from "react-router-dom";
import { useBackofficeAuth } from "@/hooks";
 import { Loader2 } from "lucide-react";

 interface BackofficeProtectedRouteProps {
   children: React.ReactNode;
   requiredPermissionKey?: string;
   requiredPageKey?: string;
 }

export function BackofficeProtectedRoute({
  children,
  requiredPermissionKey,
  requiredPageKey,
}: BackofficeProtectedRouteProps) {
  const {
    isLoading,
    isTotpVerified,
    requiresTotpSetup,
    user,
    backofficeUser,
    effectivePages,
    hasBackofficePermission,
    hasBackofficePageAccess,
  } =
		useBackofficeAuth();
  const location = useLocation();
  const path = location.pathname;
  const pageToRoute: Record<string, string> = {
    dashboard: "/",
    customers_waitlists: "/customers/waitlists",
    customers_tenants: "/customers/tenants",
    customers_ops_monitor: "/customers/ops-monitor",
    feature_flags: "/feature-flags",
    plans: "/plans",
    sales_campaigns: "/sales/campaigns",
    sales_capture_client: "/sales/capture-client",
    sales_conversions: "/sales/conversions",
    admins: "/admins",
    audit_logs: "/audit-logs",
    impersonation: "/impersonation",
    settings: "/settings",
  };
  const routeCandidates: Array<{ pageKey: string; permissionKey?: string }> = [
    { pageKey: "dashboard" },
    { pageKey: "customers_waitlists", permissionKey: "customers.view_waitlists" },
    { pageKey: "customers_tenants", permissionKey: "customers.view_tenants" },
    { pageKey: "customers_ops_monitor", permissionKey: "customers.view_ops_monitor" },
    { pageKey: "feature_flags" },
    { pageKey: "plans", permissionKey: "plans.view" },
    { pageKey: "sales_campaigns", permissionKey: "sales.manage_campaigns" },
    { pageKey: "sales_capture_client", permissionKey: "sales.capture_client" },
    { pageKey: "sales_conversions", permissionKey: "sales.view_conversions" },
    { pageKey: "audit_logs", permissionKey: "audit_logs.view" },
    { pageKey: "admins" },
    { pageKey: "impersonation", permissionKey: "impersonation.view" },
    { pageKey: "settings", permissionKey: "settings.view" },
  ];
  const fallbackRoute = routeCandidates
    .find(
      (candidate) =>
        hasBackofficePageAccess(candidate.pageKey) &&
        (!candidate.permissionKey ||
          hasBackofficePermission(candidate.permissionKey)),
    )
    ?.pageKey;
  const resolvedFallbackRoute = fallbackRoute ? pageToRoute[fallbackRoute] : undefined;

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

  // Not logged in at all
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Signed-in users without a backoffice profile are not allowed in backoffice routes.
  if (!backofficeUser) {
    return <Navigate to="/login" replace />;
  }

  // If TOTP is enforced, redirect unless we are already on setup/verify routes
  if (requiresTotpSetup && path !== "/setup-2fa") {
    return <Navigate to="/setup-2fa" replace />;
  }

  if (isTotpVerified === false && path !== "/verify-2fa") {
    return <Navigate to="/verify-2fa" replace />;
  }

  if (requiredPageKey && !hasBackofficePageAccess(requiredPageKey)) {
    if (resolvedFallbackRoute && resolvedFallbackRoute !== path) {
      return <Navigate to={resolvedFallbackRoute} replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  if (requiredPermissionKey && !hasBackofficePermission(requiredPermissionKey)) {
    if (resolvedFallbackRoute && resolvedFallbackRoute !== path) {
      return <Navigate to={resolvedFallbackRoute} replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">You do not have permission for this action.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function BackofficePublicRoute({ children }: { children: React.ReactNode }) {
  const {
    isLoading,
    user,
    requiresTotpSetup,
    isTotpVerified,
    backofficeUser,
    hasBackofficePageAccess,
    hasBackofficePermission,
  } =
		useBackofficeAuth();

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

	// Once logged in, always leave auth pages and continue the onboarding flow if needed.
	if (user) {
		if (!backofficeUser) {
			return <>{children}</>;
		}
		if (requiresTotpSetup) {
			return <Navigate to="/setup-2fa" replace />;
		}

		if (isTotpVerified === false) {
			return <Navigate to="/verify-2fa" replace />;
		}
    if (backofficeUser?.role === "super_admin") {
      return <Navigate to="/" replace />;
    }
    const routeCandidates: Array<{ route: string; pageKey: string; permissionKey?: string }> = [
      { route: "/customers/waitlists", pageKey: "customers_waitlists", permissionKey: "customers.view_waitlists" },
      { route: "/customers/tenants", pageKey: "customers_tenants", permissionKey: "customers.view_tenants" },
      { route: "/customers/ops-monitor", pageKey: "customers_ops_monitor", permissionKey: "customers.view_ops_monitor" },
      { route: "/sales/campaigns", pageKey: "sales_campaigns", permissionKey: "sales.manage_campaigns" },
      { route: "/sales/capture-client", pageKey: "sales_capture_client", permissionKey: "sales.capture_client" },
      { route: "/sales/conversions", pageKey: "sales_conversions", permissionKey: "sales.view_conversions" },
      { route: "/settings", pageKey: "settings", permissionKey: "settings.view" },
    ];
    const firstAllowed = routeCandidates.find(
      (candidate) =>
        hasBackofficePageAccess(candidate.pageKey) &&
        (!candidate.permissionKey || hasBackofficePermission(candidate.permissionKey)),
    );
    if (firstAllowed) {
      return <Navigate to={firstAllowed.route} replace />;
    }
		return <Navigate to="/" replace />;
	}

   return <>{children}</>;
 }
