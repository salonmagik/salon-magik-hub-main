 import { Navigate, useLocation } from "react-router-dom";
import { useBackofficeAuth } from "@/hooks";
 import { Loader2 } from "lucide-react";
 
 interface BackofficeProtectedRouteProps {
   children: React.ReactNode;
 }
 
export function BackofficeProtectedRoute({ children }: BackofficeProtectedRouteProps) {
  const { isLoading, isAuthenticated, isTotpVerified, requiresTotpSetup, requiresPasswordChange, user } = useBackofficeAuth();
  const location = useLocation();
  const path = location.pathname;

  const isChangePasswordRoute = path === "/change-password";

  // Allow the change-password page to render as soon as we have a user,
  // even if ancillary data is still loading. If loading is finished and no user, we'll redirect below.
  if (isChangePasswordRoute && (requiresPasswordChange || isLoading) && user) {
    return <>{children}</>;
  }

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

  // Force password change for temp-password accounts (protected pages)
  if (requiresPasswordChange && path !== "/change-password") {
    return <Navigate to="/change-password" state={{ from: location }} replace />;
  }

  // If TOTP is enforced, redirect unless we are already on setup/verify routes
  if (requiresTotpSetup && path !== "/setup-2fa") {
    return <Navigate to="/setup-2fa" replace />;
  }

  if (isTotpVerified === false && path !== "/verify-2fa") {
    return <Navigate to="/verify-2fa" replace />;
  }

  return <>{children}</>;
}
 
export function BackofficePublicRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isTotpVerified } = useBackofficeAuth();
 
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
 
  // Already fully authenticated, redirect to dashboard
  if (isAuthenticated && isTotpVerified) {
    return <Navigate to="/" replace />;
  }
 
   return <>{children}</>;
 }
