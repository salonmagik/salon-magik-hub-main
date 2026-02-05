 import { Navigate, useLocation } from "react-router-dom";
 import { useBackofficeAuth } from "@/hooks/backoffice";
 import { Loader2 } from "lucide-react";
 
 interface BackofficeProtectedRouteProps {
   children: React.ReactNode;
 }
 
 export function BackofficeProtectedRoute({ children }: BackofficeProtectedRouteProps) {
   const { isLoading, isAuthenticated, isTotpVerified, requiresTotpSetup, user } = useBackofficeAuth();
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
 
   // Not logged in at all
   if (!user) {
     return <Navigate to="/backoffice/login" state={{ from: location }} replace />;
   }
 
   // Logged in but not a backoffice user (domain not allowed)
   if (!isAuthenticated) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <div className="max-w-md text-center p-8">
           <h1 className="text-2xl font-bold text-destructive mb-4">Access Denied</h1>
           <p className="text-muted-foreground mb-6">
             Your account is not authorized for BackOffice access. 
             Contact a Super Admin if you believe this is an error.
           </p>
         </div>
       </div>
     );
   }
 
   // Needs to set up TOTP
   if (requiresTotpSetup) {
     return <Navigate to="/backoffice/setup-2fa" replace />;
   }
 
   // Has TOTP but not verified this session
   if (!isTotpVerified) {
     return <Navigate to="/backoffice/verify-2fa" replace />;
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
     return <Navigate to="/backoffice" replace />;
   }
 
   return <>{children}</>;
 }