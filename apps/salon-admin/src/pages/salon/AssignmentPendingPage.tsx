import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Loader2, LogOut } from "lucide-react";
import { Button } from "@ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { fallbackFirstRoute, type ActiveContextType } from "@/lib/contextAccess";
import { toast } from "@ui/ui/use-toast";

export default function AssignmentPendingPage() {
  const navigate = useNavigate();
  const {
    user,
    currentTenant,
    signOut,
    refreshTenants,
  } = useAuth();
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);

  const refreshTenantsRef = useRef(refreshTenants);
  refreshTenantsRef.current = refreshTenants;
  const currentTenantRef = useRef(currentTenant);
  currentTenantRef.current = currentTenant;

  const resolveAllowedRoute = async () => {
    const tenant = currentTenantRef.current;
    if (!tenant?.id) return null;

    const { data: contextData, error: contextError } = await (supabase.rpc as any)(
      "resolve_user_contexts",
      {
        p_tenant_id: tenant.id,
      }
    );

    if (contextError) {
      throw contextError;
    }

    const contextType = ((contextData?.default_context_type as ActiveContextType | undefined) || "location");
    const locationId =
      contextType === "location" ? (contextData?.default_location_id as string | null) || null : null;
    const availableLocations = Array.isArray(contextData?.available_locations)
      ? contextData.available_locations
      : [];

    if (contextType === "location" && !locationId && availableLocations.length === 0) {
      return null;
    }

    const { data: routesData, error: routesError } = await (supabase.rpc as any)(
      "list_accessible_routes",
      {
        p_tenant_id: tenant.id,
        p_context_type: contextType,
        p_location_id: locationId,
      }
    );

    if (routesError) {
      throw routesError;
    }

    const routes = (Array.isArray(routesData) ? routesData : []).filter(
      (route: unknown) => typeof route === "string" && route !== "/salon/access-denied"
    ) as string[];

    return routes[0] || fallbackFirstRoute(contextType);
  };

  useEffect(() => {
    if (!user?.id || !currentTenant?.id) return;
    (async () => {
      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "assignment.pending_shown",
        _entity_type: "user",
        _entity_id: user.id,
        _metadata: {
          route: "/salon/assignment-pending",
        },
      });
    })();
  }, [currentTenant?.id, user?.id]);

  useEffect(() => {
    let active = true;

    const recheckAccess = async () => {
      if (!user?.id) return;

      setIsCheckingAccess(true);
      try {
        await refreshTenantsRef.current();
        if (!active) return;

        const nextRoute = await resolveAllowedRoute();
        if (!active) return;

        if (nextRoute) {
          window.location.assign(nextRoute);
          return;
        }

        window.location.assign("/salon/access-denied");
      } finally {
        if (active) {
          setIsCheckingAccess(false);
        }
      }
    };

    void recheckAccess();

    return () => {
      active = false;
    };
    // refreshTenants intentionally excluded — held via ref to avoid infinite loop
    // when refreshTenants() state update triggers a new function reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleGoToAllowedPage = async () => {
    setIsCheckingAccess(true);
    try {
      await refreshTenants();
      const nextRoute = await resolveAllowedRoute();

      if (!nextRoute) {
        window.location.assign("/salon/access-denied");
        return;
      }

      window.location.assign(nextRoute);
    } catch (error: any) {
      toast({
        title: "Unable to resolve allowed page",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingAccess(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-lg w-full border rounded-xl p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-full bg-warning-bg flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-warning-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Salon assignment required</h1>
          <p className="text-muted-foreground">
            Your account is active, but you have not been assigned to any salon yet.
            Please reach out to your salon owner or manager for assignment.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/salon/help">
            <Button variant="outline" className="w-full sm:w-auto">
              Get help
            </Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => void handleGoToAllowedPage()}
            disabled={isCheckingAccess}
            className="gap-2 w-full sm:w-auto"
          >
            {isCheckingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Go to allowed page
          </Button>
          <Button onClick={() => void signOut()} className="gap-2 w-full sm:w-auto">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
