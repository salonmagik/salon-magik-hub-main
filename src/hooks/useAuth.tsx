import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  setCurrentTenant: (tenant: Tenant) => void;
  refreshProfile: () => Promise<void>;
  refreshTenants: () => Promise<void>;
  clearPasswordChangeFlag: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
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
  });

  // Force sign out - clears session and resets state
  const forceSignOut = async () => {
    console.log("Forcing sign out - user data not found");
    await supabase.auth.signOut();
    localStorage.removeItem("currentTenantId");
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
  };

  const setCurrentTenant = (tenant: Tenant) => {
    localStorage.setItem("currentTenantId", tenant.id);
    setState((prev) => ({ ...prev, currentTenant: tenant }));
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
    // Use setTimeout to defer state update, preventing UI blocking
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        tenants,
        roles,
        currentTenant,
        hasCompletedOnboarding: tenants.length > 0,
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
