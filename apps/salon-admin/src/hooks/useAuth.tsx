import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@supabase-client";
import type { ActiveContextType } from "@/lib/contextAccess";

type Profile = Tables<"profiles">;
type Tenant = Tables<"tenants">;
type UserRole = Tables<"user_roles">;

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tenants: Tenant[];
  roles: UserRole[];
  currentTenant: Tenant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  requiresPasswordChange: boolean;
  activeContextType: ActiveContextType;
  activeLocationId: string | null;
  assignedLocationIds: string[];
  availableContexts: Array<{ type: ActiveContextType; locationId: string | null; label: string }>;
  canUseOwnerHub: boolean;
  currentRole: UserRole["role"] | null;
  isAssignmentPending: boolean;
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  setCurrentTenant: (tenant: Tenant) => void;
  setActiveContext: (contextType: ActiveContextType, locationId?: string | null) => Promise<void>;
  getFirstAllowedRoute: (contextType?: ActiveContextType, locationId?: string | null) => Promise<string>;
  refreshProfile: () => Promise<void>;
  refreshTenants: () => Promise<void>;
  clearPasswordChangeFlag: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isAssignmentPendingState = (
  role: UserRole["role"] | null,
  assignedLocationIds: string[]
) => Boolean(role && role !== "owner" && assignedLocationIds.length === 0);

export function AuthProvider({ children }: { children: ReactNode }) {
  const CONTEXT_STORAGE_PREFIX = "activeContext:";
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    tenants: [],
    roles: [],
    currentTenant: null,
    isLoading: true,
    isAuthenticated: false,
    hasCompletedOnboarding: false,
    requiresPasswordChange: false,
    activeContextType: "location",
    activeLocationId: null,
    assignedLocationIds: [],
    availableContexts: [],
    canUseOwnerHub: false,
    currentRole: null,
    isAssignmentPending: false,
  });

  const getContextStorageKey = (tenantId: string) => `${CONTEXT_STORAGE_PREFIX}${tenantId}`;

  const parseStoredContext = (tenantId: string): { type: ActiveContextType; locationId: string | null } | null => {
    const raw = localStorage.getItem(getContextStorageKey(tenantId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.type !== "owner_hub" && parsed?.type !== "location") return null;
      return {
        type: parsed.type,
        locationId: parsed.locationId || null,
      };
    } catch {
      return null;
    }
  };

  const saveStoredContext = (tenantId: string, contextType: ActiveContextType, locationId: string | null) => {
    localStorage.setItem(
      getContextStorageKey(tenantId),
      JSON.stringify({
        type: contextType,
        locationId,
      })
    );
  };

  // Force sign out - clears session and resets state
  const forceSignOut = async () => {
    console.log("Forcing sign out - user data not found");
    await supabase.auth.signOut();
    localStorage.removeItem("currentTenantId");
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CONTEXT_STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
    setState({
      user: null,
      session: null,
      profile: null,
      tenants: [],
      roles: [],
      currentTenant: null,
      isLoading: false,
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      requiresPasswordChange: false,
      activeContextType: "location",
      activeLocationId: null,
      assignedLocationIds: [],
      availableContexts: [],
      canUseOwnerHub: false,
      currentRole: null,
      isAssignmentPending: false,
    });
  };

  // Fetch profile data - returns null if user doesn't exist (deleted account)
  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
    return data;
  };

  // Fetch user's tenants and roles
  const fetchTenantsAndRoles = async (userId: string) => {
    // Fetch roles first
    const { data: rolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", userId);

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
      return { tenants: [], roles: [] };
    }

    const roles = rolesData || [];
    const tenantIds = [...new Set(roles.map((r) => r.tenant_id))];

    if (tenantIds.length === 0) {
      return { tenants: [], roles };
    }

    // Fetch tenants
    const { data: tenantsData, error: tenantsError } = await supabase
      .from("tenants")
      .select("*")
      .in("id", tenantIds);

    if (tenantsError) {
      console.error("Error fetching tenants:", tenantsError);
      return { tenants: [], roles };
    }

    return { tenants: tenantsData || [], roles };
  };

  const resolveContexts = async (userId: string, tenantId: string, roles: UserRole[]) => {
      const userRole = roles.find((role) => role.tenant_id === tenantId)?.role || null;

      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("resolve_user_contexts", {
          p_tenant_id: tenantId,
        });

        if (!rpcError && rpcData) {
          const availableLocations = Array.isArray(rpcData.available_locations)
            ? rpcData.available_locations
            : [];
          const availableContexts = [
            ...(rpcData.can_use_owner_hub
              ? [{ type: "owner_hub" as const, locationId: null, label: "Owner Hub" }]
              : []),
            ...availableLocations.map((location: any) => ({
              type: "location" as const,
              locationId: location.id,
              label: location.name,
            })),
          ];

          const assignedLocationIds = availableLocations
            .map((location: any) => location.id)
            .filter(Boolean);

          const storedContext = parseStoredContext(tenantId);
          const ownerHubIsValid =
            storedContext?.type === "owner_hub" && Boolean(rpcData.can_use_owner_hub);
          const locationIsValid =
            storedContext?.type === "location" &&
            Boolean(
              storedContext.locationId &&
                assignedLocationIds.some((id: string) => id === storedContext.locationId)
            );

          const activeContextType = ownerHubIsValid
            ? "owner_hub"
            : locationIsValid
              ? "location"
              : (rpcData.default_context_type as ActiveContextType) || "location";
          const activeLocationId =
            activeContextType === "location"
              ? locationIsValid
                ? storedContext?.locationId || null
                : rpcData.default_location_id || null
              : null;

          return {
            activeContextType,
            activeLocationId,
            assignedLocationIds,
            availableContexts,
            canUseOwnerHub: Boolean(rpcData.can_use_owner_hub),
            currentRole: (rpcData.role as UserRole["role"] | null) || userRole,
          };
        }
      } catch (error) {
        console.error("resolve_user_contexts RPC failed. Falling back to client resolution:", error);
      }

      const { data: assignedLocationsData, error: assignedLocationsError } = await supabase
        .from("staff_locations")
        .select("location_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (assignedLocationsError) {
        console.error("Error fetching assigned locations:", assignedLocationsError);
      }

      const assignedLocationIds = [
        ...new Set((assignedLocationsData || []).map((row) => row.location_id).filter(Boolean)),
      ] as string[];

      let locationsQuery = supabase
        .from("locations")
        .select("id, name, is_default")
        .eq("tenant_id", tenantId);

      if (userRole !== "owner") {
        if (assignedLocationIds.length === 0) {
          const canUseOwnerHub = false;
          return {
            activeContextType: "location" as ActiveContextType,
            activeLocationId: null,
            assignedLocationIds,
            availableContexts: [],
            canUseOwnerHub,
            currentRole: userRole,
          };
        }
        locationsQuery = locationsQuery.in("id", assignedLocationIds);
      }

      const { data: locationRows, error: locationsError } = await locationsQuery;
      if (locationsError) {
        console.error("Error fetching context locations:", locationsError);
      }

      const availableLocations =
        (locationRows || []).map((location) => ({
          type: "location" as const,
          locationId: location.id,
          label: location.name,
          isDefault: Boolean((location as any).is_default),
        })) || [];

      const canUseOwnerHub =
        userRole === "owner" ||
        ((userRole === "manager" || userRole === "supervisor") && availableLocations.length > 1);

      const storedContext = parseStoredContext(tenantId);
      const defaultLocation =
        availableLocations.find((location) => location.isDefault) || availableLocations[0] || null;

      const ownerHubIsValid = Boolean(canUseOwnerHub);
      const locationIsValid = Boolean(
        storedContext?.locationId &&
          availableLocations.some((location) => location.locationId === storedContext.locationId)
      );

      let activeContextType: ActiveContextType = canUseOwnerHub ? "owner_hub" : "location";
      let activeLocationId: string | null = defaultLocation?.locationId || null;

      if (storedContext) {
        if (storedContext.type === "owner_hub" && ownerHubIsValid) {
          activeContextType = "owner_hub";
          activeLocationId = null;
        } else if (storedContext.type === "location" && locationIsValid) {
          activeContextType = "location";
          activeLocationId = storedContext.locationId;
        }
      }

      const availableContexts = [
        ...(canUseOwnerHub ? [{ type: "owner_hub" as const, locationId: null, label: "Owner Hub" }] : []),
        ...availableLocations.map((location) => ({
          type: "location" as const,
          locationId: location.locationId,
          label: location.label,
        })),
      ];

      return {
        activeContextType,
        activeLocationId,
        assignedLocationIds,
        availableContexts,
        canUseOwnerHub,
        currentRole: userRole,
      };
  };

  const syncServerContext = async (tenantId: string, contextType: ActiveContextType, locationId: string | null) => {
    if (contextType === "location" && !locationId) {
      return;
    }
    try {
      await (supabase.rpc as any)("set_active_context", {
        p_tenant_id: tenantId,
        p_context_type: contextType,
        p_location_id: locationId,
      });
    } catch (error) {
      console.error("Failed to sync active context:", error);
    }
  };

  const logAuditEvent = async (
    tenantId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {}
  ) => {
    if (!UUID_PATTERN.test(entityId)) {
      console.warn(`Skipped audit event with non-uuid entity_id for action "${action}"`, {
        entityType,
        entityId,
      });
      return;
    }

    try {
      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: tenantId,
        _action: action,
        _entity_type: entityType,
        _entity_id: entityId,
        _metadata: metadata,
      });
    } catch (error) {
      console.error(`Failed to write audit event (${action}):`, error);
    }
  };

  // Initialize auth state
  const initializeAuth = async () => {
    try {
      // Set up auth state change listener FIRST
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log("Auth state changed:", event, session?.user?.id);

          if (event === "SIGNED_OUT" || !session) {
            setState({
              user: null,
              session: null,
              profile: null,
              tenants: [],
              roles: [],
              currentTenant: null,
              isLoading: false,
              isAuthenticated: false,
              hasCompletedOnboarding: false,
              requiresPasswordChange: false,
              activeContextType: "location",
              activeLocationId: null,
              assignedLocationIds: [],
              availableContexts: [],
              canUseOwnerHub: false,
              currentRole: null,
              isAssignmentPending: false,
            });
            return;
          }

          if (session?.user) {
            // Use setTimeout to prevent Supabase deadlocks
            setTimeout(async () => {
              let profile = await fetchProfile(session.user.id);
              
              // If profile doesn't exist, try to create it from auth metadata
              if (!profile) {
                console.log("Auth state change: profile not found - attempting to create");
                const { data: newProfile, error: createError } = await supabase
                  .from("profiles")
                  .insert({
                    user_id: session.user.id,
                    full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User",
                    phone: session.user.user_metadata?.phone || null,
                  })
                  .select()
                  .single();
                
                if (createError) {
                  console.error("Failed to create profile:", createError);
                  await forceSignOut();
                  return;
                }
                profile = newProfile;
              }
              
              const { tenants, roles } = await fetchTenantsAndRoles(session.user.id);
              
              // Get stored tenant preference or use first tenant
              const storedTenantId = localStorage.getItem("currentTenantId");
              const currentTenant = tenants.find((t) => t.id === storedTenantId) || tenants[0] || null;
              const contextState = currentTenant
                ? await resolveContexts(session.user.id, currentTenant.id, roles)
                : {
                    activeContextType: "location" as ActiveContextType,
                    activeLocationId: null,
                    assignedLocationIds: [] as string[],
                    availableContexts: [] as Array<{
                      type: ActiveContextType;
                      locationId: string | null;
                      label: string;
                    }>,
                    canUseOwnerHub: false,
                    currentRole: null as UserRole["role"] | null,
                  };

              if (currentTenant) {
                saveStoredContext(currentTenant.id, contextState.activeContextType, contextState.activeLocationId);
                await syncServerContext(
                  currentTenant.id,
                  contextState.activeContextType,
                  contextState.activeLocationId
                );
                await logAuditEvent(currentTenant.id, "auth.login", "auth", session.user.id, {
                  context_type: contextState.activeContextType,
                });
              }

              setState({
                user: session.user,
                session,
                profile,
                tenants,
                roles,
                currentTenant,
                isLoading: false,
                isAuthenticated: true,
                hasCompletedOnboarding: tenants.length > 0,
                requiresPasswordChange: session.user.user_metadata?.requires_password_change === true,
                activeContextType: contextState.activeContextType,
                activeLocationId: contextState.activeLocationId,
                assignedLocationIds: contextState.assignedLocationIds,
                availableContexts: contextState.availableContexts,
                canUseOwnerHub: contextState.canUseOwnerHub,
                currentRole: contextState.currentRole,
                isAssignmentPending: isAssignmentPendingState(
                  contextState.currentRole,
                  contextState.assignedLocationIds
                ),
              });
            }, 0);
          }
        }
      );

      // THEN get initial session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        let profile = await fetchProfile(session.user.id);
        
        // If profile doesn't exist, try to create it from auth metadata
        if (!profile) {
          console.log("Session exists but profile not found - attempting to create");
          const { data: newProfile, error: createError } = await supabase
            .from("profiles")
            .insert({
              user_id: session.user.id,
              full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User",
              phone: session.user.user_metadata?.phone || null,
            })
            .select()
            .single();
          
          if (createError) {
            console.error("Failed to create profile on init:", createError);
            await forceSignOut();
            return () => {
              subscription.unsubscribe();
            };
          }
          profile = newProfile;
        }
        
        const { tenants, roles } = await fetchTenantsAndRoles(session.user.id);
        
        const storedTenantId = localStorage.getItem("currentTenantId");
        const currentTenant = tenants.find((t) => t.id === storedTenantId) || tenants[0] || null;
        const contextState = currentTenant
          ? await resolveContexts(session.user.id, currentTenant.id, roles)
          : {
              activeContextType: "location" as ActiveContextType,
              activeLocationId: null,
              assignedLocationIds: [] as string[],
                availableContexts: [] as Array<{
                  type: ActiveContextType;
                  locationId: string | null;
                  label: string;
                }>,
                canUseOwnerHub: false,
                currentRole: null as UserRole["role"] | null,
              };

        if (currentTenant) {
          saveStoredContext(currentTenant.id, contextState.activeContextType, contextState.activeLocationId);
          await syncServerContext(currentTenant.id, contextState.activeContextType, contextState.activeLocationId);
          await logAuditEvent(currentTenant.id, "auth.login", "auth", session.user.id, {
            context_type: contextState.activeContextType,
          });
        }

        setState({
          user: session.user,
          session,
          profile,
          tenants,
          roles,
          currentTenant,
          isLoading: false,
          isAuthenticated: true,
          hasCompletedOnboarding: tenants.length > 0,
          requiresPasswordChange: session.user.user_metadata?.requires_password_change === true,
          activeContextType: contextState.activeContextType,
          activeLocationId: contextState.activeLocationId,
          assignedLocationIds: contextState.assignedLocationIds,
          availableContexts: contextState.availableContexts,
          canUseOwnerHub: contextState.canUseOwnerHub,
          currentRole: contextState.currentRole,
          isAssignmentPending: isAssignmentPendingState(
            contextState.currentRole,
            contextState.assignedLocationIds
          ),
        });
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("Auth initialization error:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  useEffect(() => {
    initializeAuth();
  }, []);

  const signOut = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    await supabase.auth.signOut();
    localStorage.removeItem("currentTenantId");
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CONTEXT_STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  };

  const setCurrentTenant = (tenant: Tenant) => {
    localStorage.setItem("currentTenantId", tenant.id);
    setState((prev) => ({ ...prev, currentTenant: tenant, isLoading: true }));
    setTimeout(async () => {
      if (!state.user) return;
      const contextState = await resolveContexts(state.user.id, tenant.id, state.roles);
      saveStoredContext(tenant.id, contextState.activeContextType, contextState.activeLocationId);
      await syncServerContext(tenant.id, contextState.activeContextType, contextState.activeLocationId);
      setState((prev) => ({
        ...prev,
        currentTenant: tenant,
        isLoading: false,
        activeContextType: contextState.activeContextType,
        activeLocationId: contextState.activeLocationId,
        assignedLocationIds: contextState.assignedLocationIds,
        availableContexts: contextState.availableContexts,
        canUseOwnerHub: contextState.canUseOwnerHub,
        currentRole: contextState.currentRole,
        isAssignmentPending: isAssignmentPendingState(
          contextState.currentRole,
          contextState.assignedLocationIds
        ),
      }));
    }, 0);
  };

  const setActiveContext = async (contextType: ActiveContextType, locationId: string | null = null) => {
    if (!state.currentTenant?.id || !state.user?.id) return;

    // Local validation to avoid unnecessary requests.
    if (contextType === "owner_hub" && !state.canUseOwnerHub) {
      return;
    }
    if (
      contextType === "location" &&
      locationId &&
      !state.availableContexts.some(
        (context) => context.type === "location" && context.locationId === locationId
      )
    ) {
      return;
    }

    const nextLocationId = contextType === "location" ? locationId : null;
    saveStoredContext(state.currentTenant.id, contextType, nextLocationId);
    await syncServerContext(state.currentTenant.id, contextType, nextLocationId);
    await logAuditEvent(
      state.currentTenant.id,
      "context.switch",
      "staff_session",
      state.user.id,
      {
        context_type: contextType,
        location_id: nextLocationId,
      }
    );

    setState((prev) => ({
      ...prev,
      activeContextType: contextType,
      activeLocationId: nextLocationId,
      isAssignmentPending: isAssignmentPendingState(prev.currentRole, prev.assignedLocationIds),
    }));
  };

  const getFirstAllowedRoute = async (
    contextType: ActiveContextType = state.activeContextType,
    locationId: string | null = state.activeLocationId
  ) => {
    if (!state.currentTenant?.id) return "/salon";
    if (state.isAssignmentPending) return "/salon/assignment-pending";
    try {
      const { data } = await (supabase.rpc as any)("list_accessible_routes", {
        p_tenant_id: state.currentTenant.id,
        p_context_type: contextType,
        p_location_id: locationId,
      });
      const routes = (Array.isArray(data) ? data : []).filter((route: unknown) => typeof route === "string");
      if (routes.length > 0) return routes[0] as string;
    } catch (error) {
      console.error("Failed to resolve first allowed route:", error);
    }
    return contextType === "owner_hub" ? "/salon/overview" : "/salon";
  };

  const refreshProfile = async () => {
    if (!state.user) return;
    const profile = await fetchProfile(state.user.id);
    setState((prev) => ({ ...prev, profile }));
  };

  const refreshTenants = async () => {
    if (!state.user) return;
    const { tenants, roles } = await fetchTenantsAndRoles(state.user.id);
    const currentTenant = tenants.find((t) => t.id === state.currentTenant?.id) || tenants[0] || null;
    const contextState = currentTenant
      ? await resolveContexts(state.user.id, currentTenant.id, roles)
      : {
          activeContextType: "location" as ActiveContextType,
          activeLocationId: null,
          assignedLocationIds: [] as string[],
          availableContexts: [] as Array<{ type: ActiveContextType; locationId: string | null; label: string }>,
          canUseOwnerHub: false,
          currentRole: null as UserRole["role"] | null,
        };

    if (currentTenant) {
      saveStoredContext(currentTenant.id, contextState.activeContextType, contextState.activeLocationId);
      await syncServerContext(currentTenant.id, contextState.activeContextType, contextState.activeLocationId);
    }
    // Use setTimeout to defer state update, preventing UI blocking
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        tenants,
        roles,
        currentTenant,
        hasCompletedOnboarding: tenants.length > 0,
        activeContextType: contextState.activeContextType,
        activeLocationId: contextState.activeLocationId,
        assignedLocationIds: contextState.assignedLocationIds,
        availableContexts: contextState.availableContexts,
        canUseOwnerHub: contextState.canUseOwnerHub,
        currentRole: contextState.currentRole,
        isAssignmentPending: isAssignmentPendingState(
          contextState.currentRole,
          contextState.assignedLocationIds
        ),
      }));
    }, 0);
  };

  const clearPasswordChangeFlag = () => {
    setState((prev) => ({ ...prev, requiresPasswordChange: false }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signOut,
        setCurrentTenant,
        setActiveContext,
        getFirstAllowedRoute,
        refreshProfile,
        refreshTenants,
        clearPasswordChangeFlag,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
