 import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
 import { User, Session } from "@supabase/supabase-js";
 import { supabase } from "@/lib/supabase";
 import type { Tables } from "@/lib/supabase";
 
 type BackofficeUser = Tables<"backoffice_users">;
 type Profile = Tables<"profiles">;
 
interface BackofficeAuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  backofficeUser: BackofficeUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isTotpVerified: boolean;
  requiresTotpSetup: boolean;
  requiresPasswordChange: boolean;
}
 
interface BackofficeAuthContextType extends BackofficeAuthState {
  signOut: () => Promise<void>;
  verifyTotp: (token: string) => Promise<boolean>;
  setupTotp: (secret: string) => Promise<boolean>;
  refreshBackofficeUser: () => Promise<void>;
  markPasswordChanged: () => void;
}
 
 const BackofficeAuthContext = createContext<BackofficeAuthContextType | undefined>(undefined);
 
 export function BackofficeAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackofficeAuthState>({
    user: null,
    session: null,
    profile: null,
    backofficeUser: null,
    isLoading: true,
    isAuthenticated: false,
    isTotpVerified: false,
    requiresTotpSetup: false,
    requiresPasswordChange: false,
  });
 
   // Check if email domain is allowed
   const checkDomainAllowed = async (email: string): Promise<boolean> => {
     const domain = email.split("@")[1]?.toLowerCase();
     if (!domain) return false;
 
     const { data, error } = await supabase
       .from("backoffice_allowed_domains")
       .select("domain")
       .eq("domain", domain)
       .maybeSingle();
 
     return !error && !!data;
   };
 
   // Fetch or create backoffice user
  const fetchBackofficeUser = async (userId: string, email: string): Promise<BackofficeUser | null> => {
    const trySelect = async () =>
      supabase
        .from("backoffice_users")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    let { data: existing, error: fetchError } = await trySelect();

    // Retry once on spurious AbortError that can happen in dev/StrictMode
    if (fetchError && (fetchError.message?.includes("AbortError") || (fetchError as any).name === "AbortError")) {
      ({ data: existing, error: fetchError } = await trySelect());
    }

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching backoffice user:", fetchError);
      return null;
    }

    if (existing) return existing;

    // User doesn't exist, check if domain is allowed
    const domain = email.split("@")[1]?.toLowerCase();
    const domainAllowed = await checkDomainAllowed(email);

    if (!domainAllowed) {
      console.log("Domain not allowed for backoffice:", domain);
      return null;
    }

    // Not auto-creating here; super admin must provision. Return null to trigger Access Denied.
    console.log("User has allowed domain but no backoffice record - must be provisioned by admin");
    return null;
  };
 
   // Fetch profile
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
 
  // Initialize auth - proper pattern to avoid race conditions
  const initializeAuth = useCallback(async () => {
    let isMounted = true;
    
    try {
      // Set up the auth state change listener FIRST (for ongoing changes)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!isMounted) return;
          console.log("BackOffice auth state changed:", event);

          if (event === "SIGNED_OUT" || !session) {
            setState({
              user: null,
              session: null,
              profile: null,
              backofficeUser: null,
              isLoading: false,
              isAuthenticated: false,
              isTotpVerified: false,
              requiresTotpSetup: false,
            });
            sessionStorage.removeItem("backoffice_totp_verified");
            return;
          }

          // For ongoing auth changes (not initial load), update state immediately
          // Don't control isLoading here - let the initial load handle that
          if (session?.user) {
            // Update session/user immediately
            setState(prev => ({
              ...prev,
              user: session.user,
              session,
            }));
            
            // Fire and forget - fetch profile/backoffice data in background
            const profile = await fetchProfile(session.user.id);
            const backofficeUser = await fetchBackofficeUser(session.user.id, session.user.email || "");
            const totpVerifiedInSession = sessionStorage.getItem("backoffice_totp_verified") === "true";

            if (!isMounted) return;
            
            setState(prev => ({
              ...prev,
              profile,
              backofficeUser,
              isAuthenticated: !!backofficeUser,
              isTotpVerified: backofficeUser?.totp_enabled ? totpVerifiedInSession : true,
              // Only force setup when totp_required is true (not merely because it's disabled)
              requiresTotpSetup: !!backofficeUser && backofficeUser.totp_required,
              requiresPasswordChange: !!backofficeUser?.temp_password_required,
            }));
          }
        }
      );

      // INITIAL load - fetch session and complete before setting isLoading = false
      const { data: { session } } = await supabase.auth.getSession();

      if (!isMounted) {
        subscription.unsubscribe();
        return;
      }

      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        const backofficeUser = await fetchBackofficeUser(session.user.id, session.user.email || "");
        const totpVerifiedInSession = sessionStorage.getItem("backoffice_totp_verified") === "true";

        if (!isMounted) {
          subscription.unsubscribe();
          return;
        }

        setState({
          user: session.user,
          session,
          profile,
          backofficeUser,
          isLoading: false,
          isAuthenticated: !!backofficeUser,
          isTotpVerified: backofficeUser?.totp_enabled ? totpVerifiedInSession : true,
          requiresTotpSetup: !!backofficeUser && backofficeUser.totp_required,
          requiresPasswordChange: !!backofficeUser?.temp_password_required,
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("BackOffice auth initialization error:", error);
      if (isMounted) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, []);
 
   useEffect(() => {
     initializeAuth();
   }, [initializeAuth]);
 
   const signOut = async () => {
     setState(prev => ({ ...prev, isLoading: true }));
     sessionStorage.removeItem("backoffice_totp_verified");
     await supabase.auth.signOut();
   };
 
   // Verify TOTP token (simple client-side for now, should be edge function in production)
   const verifyTotp = async (token: string): Promise<boolean> => {
     if (!state.backofficeUser?.totp_secret) return false;
     
     // In production, this should call an edge function to verify
     // For now, we'll use a simple time-based check
     try {
       // Call edge function to verify TOTP
       const response = await supabase.functions.invoke("verify-backoffice-totp", {
         body: { token },
       });
 
       if (response.error || !response.data?.valid) {
         return false;
       }
 
       sessionStorage.setItem("backoffice_totp_verified", "true");
       setState(prev => ({ ...prev, isTotpVerified: true }));
       
       // Update last login
       await supabase
         .from("backoffice_users")
         .update({ last_login_at: new Date().toISOString() })
         .eq("user_id", state.user?.id);
 
       return true;
     } catch (error) {
       console.error("TOTP verification error:", error);
       return false;
     }
   };
 
   // Setup TOTP (save secret after user confirms with valid token)
   const setupTotp = async (secret: string): Promise<boolean> => {
     if (!state.user) return false;
 
     try {
       const { error } = await supabase
         .from("backoffice_users")
         .update({ 
           totp_secret: secret,
           totp_enabled: true 
         })
         .eq("user_id", state.user.id);
 
       if (error) {
         console.error("Error saving TOTP secret:", error);
         return false;
       }
 
       sessionStorage.setItem("backoffice_totp_verified", "true");
       setState(prev => ({
         ...prev,
         isTotpVerified: true,
         requiresTotpSetup: false,
         backofficeUser: prev.backofficeUser 
           ? { ...prev.backofficeUser, totp_enabled: true, totp_secret: secret }
           : null,
       }));
 
       return true;
     } catch (error) {
       console.error("Error setting up TOTP:", error);
       return false;
     }
   };
 
  const refreshBackofficeUser = async () => {
    if (!state.user) return;
    const backofficeUser = await fetchBackofficeUser(state.user.id, state.user.email || "");
    setState(prev => ({
      ...prev,
      backofficeUser,
      isAuthenticated: !!backofficeUser,
      requiresTotpSetup: !!backofficeUser && backofficeUser.totp_required,
      requiresPasswordChange: !!backofficeUser?.temp_password_required,
    }));
  };

  const markPasswordChanged = () => {
    setState(prev => ({
      ...prev,
      requiresPasswordChange: false,
      backofficeUser: prev.backofficeUser
        ? {
            ...prev.backofficeUser,
            temp_password_required: false,
            password_changed_at: new Date().toISOString(),
          }
        : prev.backofficeUser,
    }));
  };
 
   return (
     <BackofficeAuthContext.Provider
       value={{
         ...state,
         signOut,
         verifyTotp,
         setupTotp,
         refreshBackofficeUser,
         markPasswordChanged,
       }}
     >
       {children}
     </BackofficeAuthContext.Provider>
   );
 }
 
 export function useBackofficeAuth() {
   const context = useContext(BackofficeAuthContext);
   if (context === undefined) {
     throw new Error("useBackofficeAuth must be used within a BackofficeAuthProvider");
   }
   return context;
 }
