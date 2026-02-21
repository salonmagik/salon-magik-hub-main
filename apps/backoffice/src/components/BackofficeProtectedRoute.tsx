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
    hasBackofficePermission,
    hasBackofficePageAccess,
  } =
		useBackofficeAuth();
  const location = useLocation();
  const path = location.pathname;

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

  // If TOTP is enforced, redirect unless we are already on setup/verify routes
  if (requiresTotpSetup && path !== "/setup-2fa") {
    return <Navigate to="/setup-2fa" replace />;
  }

  if (isTotpVerified === false && path !== "/verify-2fa") {
    return <Navigate to="/verify-2fa" replace />;
  }

  if (requiredPageKey && !hasBackofficePageAccess(requiredPageKey)) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermissionKey && !hasBackofficePermission(requiredPermissionKey)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function BackofficePublicRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, user, requiresTotpSetup, isTotpVerified } =
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
		if (requiresTotpSetup) {
			return <Navigate to="/setup-2fa" replace />;
		}

		if (isTotpVerified === false) {
			return <Navigate to="/verify-2fa" replace />;
		}

		return <Navigate to="/" replace />;
	}

   return <>{children}</>;
 }
