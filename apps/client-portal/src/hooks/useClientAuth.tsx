import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/supabase";

type Customer = Tables<"customers">;
type Tenant = Tables<"tenants">;
type Profile = Tables<"profiles">;

interface CustomerWithTenant extends Customer {
  tenant: Tenant;
}

interface ClientPreferences {
  email_booking_updates: boolean;
  sms_booking_updates: boolean;
  marketing_opt_in: boolean;
}

interface ClientAuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  customers: CustomerWithTenant[];
  preferences: ClientPreferences | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresPasswordSetup: boolean;
}

interface ClientAuthContextType extends ClientAuthState {
  signOut: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(undefined);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClientAuthState>({
    user: null,
    session: null,
    profile: null,
    customers: [],
    preferences: null,
    isLoading: true,
    isAuthenticated: false,
    requiresPasswordSetup: false,
  });

  // Fetch customer records linked to this user across all salons
  const fetchCustomers = async (userId: string): Promise<CustomerWithTenant[]> => {
    // First fetch customer records
    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", userId);

    if (customersError) {
      console.error("Error fetching customer records:", customersError);
      return [];
    }

    if (!customersData || customersData.length === 0) {
      return [];
    }

    // Fetch tenant info for each customer
    const tenantIds = [...new Set(customersData.map((c) => c.tenant_id))];
    const { data: tenantsData, error: tenantsError } = await supabase
      .from("tenants")
      .select("*")
      .in("id", tenantIds);

    if (tenantsError) {
      console.error("Error fetching tenants:", tenantsError);
      return [];
    }

    const tenantsMap = new Map(tenantsData?.map((t) => [t.id, t]) || []);

    // Combine customer with tenant info
    return customersData
      .map((customer) => ({
        ...customer,
        tenant: tenantsMap.get(customer.tenant_id)!,
      }))
      .filter((c) => c.tenant); // Only include customers with valid tenant
  };

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    if (error) {
      console.error("Error fetching client profile:", error);
      return null;
    }
    return data as Profile | null;
  };

  const fetchPreferences = async (userId: string): Promise<ClientPreferences | null> => {
    const { data, error } = await (supabase
      .from("client_account_preferences" as any)
      .select("email_booking_updates, sms_booking_updates, marketing_opt_in")
      .eq("user_id", userId)
      .maybeSingle() as any);

    if (error) {
      console.error("Error fetching client preferences:", error);
      return null;
    }

    if (!data) return null;

    return {
      email_booking_updates: Boolean(data.email_booking_updates),
      sms_booking_updates: Boolean(data.sms_booking_updates),
      marketing_opt_in: Boolean(data.marketing_opt_in),
    };
  };

  const hydrateUserState = async (session: Session) => {
    const [customers, profile, preferences] = await Promise.all([
      fetchCustomers(session.user.id),
      fetchProfile(session.user.id),
      fetchPreferences(session.user.id),
    ]);

    setState({
      user: session.user,
      session,
      profile,
      customers,
      preferences,
      isLoading: false,
      isAuthenticated: true,
      requiresPasswordSetup:
        profile?.client_password_initialized === false ||
        session.user.user_metadata?.password_initialized === false,
    });
  };

  // Initialize auth state
  const initializeAuth = async () => {
    try {
      // Set up auth state change listener FIRST
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log("Client auth state changed:", event, session?.user?.id);

          if (event === "SIGNED_OUT" || !session) {
            setState({
              user: null,
              session: null,
              profile: null,
              customers: [],
              preferences: null,
              isLoading: false,
              isAuthenticated: false,
              requiresPasswordSetup: false,
            });
            return;
          }

          if (session?.user) {
            // Use setTimeout to prevent Supabase deadlocks
            setTimeout(async () => {
              await hydrateUserState(session);
            }, 0);
          }
        }
      );

      // THEN get initial session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await hydrateUserState(session);
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("Client auth initialization error:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  useEffect(() => {
    initializeAuth();
  }, []);

  const signOut = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    await supabase.auth.signOut();
  };

  const refreshCustomers = async () => {
    if (!state.user) return;
    const customers = await fetchCustomers(state.user.id);
    setState((prev) => ({ ...prev, customers }));
  };

  const refreshAccount = async () => {
    if (!state.session) return;
    await hydrateUserState(state.session);
  };

  return (
    <ClientAuthContext.Provider
      value={{
        ...state,
        signOut,
        refreshCustomers,
        refreshAccount,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const context = useContext(ClientAuthContext);
  if (context === undefined) {
    throw new Error("useClientAuth must be used within a ClientAuthProvider");
  }
  return context;
}
