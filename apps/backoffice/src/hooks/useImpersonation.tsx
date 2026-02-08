import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useBackofficeAuth } from "@/hooks/useBackofficeAuth";

interface ImpersonationContextType {
  isImpersonating: boolean;
  impersonatedTenantId: string | null;
  impersonatedTenantName: string | null;
  sessionId: string | null;
  startImpersonation: (tenantId: string, tenantName: string, sessionId: string) => void;
  endImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType | null>(null);

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (!context) {
    // Return default values if not in provider (for non-backoffice contexts)
    return {
      isImpersonating: false,
      impersonatedTenantId: null,
      impersonatedTenantName: null,
      sessionId: null,
      startImpersonation: () => {},
      endImpersonation: () => {},
    };
  }
  return context;
}

interface ImpersonationProviderProps {
  children: ReactNode;
}

export function ImpersonationProvider({ children }: ImpersonationProviderProps) {
  const { backofficeUser } = useBackofficeAuth();
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(null);
  const [impersonatedTenantName, setImpersonatedTenantName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Check for active session on mount
  useEffect(() => {
    const checkActiveSession = async () => {
      if (!backofficeUser?.id) return;

      const { data } = await supabase
        .from("impersonation_sessions")
        .select("id, tenant_id, tenants:tenant_id(name)")
        .eq("backoffice_user_id", backofficeUser.id)
        .is("ended_at", null)
        .maybeSingle();

      if (data) {
        setSessionId(data.id);
        setImpersonatedTenantId(data.tenant_id);
        setImpersonatedTenantName((data.tenants as unknown as { name: string })?.name || "Unknown");
      }
    };

    checkActiveSession();
  }, [backofficeUser?.id]);

  const startImpersonation = (tenantId: string, tenantName: string, newSessionId: string) => {
    setImpersonatedTenantId(tenantId);
    setImpersonatedTenantName(tenantName);
    setSessionId(newSessionId);
  };

  const endImpersonation = async () => {
    if (sessionId) {
      await supabase
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
    setImpersonatedTenantId(null);
    setImpersonatedTenantName(null);
    setSessionId(null);
  };

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: !!impersonatedTenantId,
        impersonatedTenantId,
        impersonatedTenantName,
        sessionId,
        startImpersonation,
        endImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
