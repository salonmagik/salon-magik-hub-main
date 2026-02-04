import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;
type Tenant = Tables<"tenants">;

interface CustomerWithTenant extends Customer {
  tenant: Tenant;
}

interface ClientAuthState {
  user: User | null;
  session: Session | null;
  customers: CustomerWithTenant[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface ClientAuthContextType extends ClientAuthState {
  signOut: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(undefined);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClientAuthState>({
    user: null,
    session: null,
    customers: [],
    isLoading: true,
    isAuthenticated: false,
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
              customers: [],
              isLoading: false,
              isAuthenticated: false,
            });
            return;
          }

          if (session?.user) {
            // Use setTimeout to prevent Supabase deadlocks
            setTimeout(async () => {
              const customers = await fetchCustomers(session.user.id);
              
              setState({
                user: session.user,
                session,
                customers,
                isLoading: false,
                isAuthenticated: true,
              });
            }, 0);
          }
        }
      );

      // THEN get initial session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const customers = await fetchCustomers(session.user.id);
        
        setState({
          user: session.user,
          session,
          customers,
          isLoading: false,
          isAuthenticated: true,
        });
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

  return (
    <ClientAuthContext.Provider
      value={{
        ...state,
        signOut,
        refreshCustomers,
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
