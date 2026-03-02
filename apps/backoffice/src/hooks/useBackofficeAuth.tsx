import {
	createContext,
	useContext,
	useEffect,
	useState,
	ReactNode,
	useCallback,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/supabase";

type BackofficeUser = Tables<"backoffice_users"> & {
	totp_required?: boolean | null;
	temp_password_required?: boolean | null;
	password_changed_at?: string | null;
  is_sales_agent?: boolean | null;
};
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
	effectivePermissions: string[];
	effectivePages: string[];
}

interface BackofficeAuthContextType extends BackofficeAuthState {
	signOut: () => Promise<void>;
	verifyTotp: (token: string) => Promise<boolean>;
	setupTotp: (secret: string) => Promise<boolean>;
	refreshBackofficeUser: () => Promise<void>;
	markPasswordChanged: () => void;
	hasBackofficePermission: (permissionKey: string) => boolean;
	hasBackofficePageAccess: (pageKey: string) => boolean;
}

const BackofficeAuthContext = createContext<
	BackofficeAuthContextType | undefined
>(undefined);

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
		effectivePermissions: [],
		effectivePages: [],
	});

	const clearBackofficeSessionArtifacts = () => {
		sessionStorage.removeItem("backoffice_totp_verified");
		localStorage.removeItem("sb-salonmagik-backoffice");
		localStorage.removeItem("sb-salonmagik-backoffice-auth-token");
		for (let i = localStorage.length - 1; i >= 0; i -= 1) {
			const key = localStorage.key(i);
			if (!key) continue;
			if (key.startsWith("sb-salonmagik-backoffice-")) {
				localStorage.removeItem(key);
			}
		}
	};

	const clearAuthState = useCallback(() => {
		setState({
			user: null,
			session: null,
			profile: null,
			backofficeUser: null,
			isLoading: false,
			isAuthenticated: false,
			isTotpVerified: false,
			requiresTotpSetup: false,
			requiresPasswordChange: false,
			effectivePermissions: [],
			effectivePages: [],
		});
		clearBackofficeSessionArtifacts();
	}, []);

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

	const fetchBackofficeUser = async (
		userId: string,
		email: string,
	): Promise<BackofficeUser | null> => {
		const trySelect = async () =>
			supabase
				.from("backoffice_users")
				.select("*")
				.eq("user_id", userId)
				.maybeSingle();

		let { data: existing, error: fetchError } = await trySelect();

		if (
			fetchError &&
			(fetchError.message?.includes("AbortError") ||
				(fetchError as { name?: string }).name === "AbortError")
		) {
			({ data: existing, error: fetchError } = await trySelect());
		}

		if (fetchError && fetchError.code !== "PGRST116") {
			console.error("Error fetching backoffice user:", fetchError);
			return null;
		}

		if (existing) return existing;

		const domain = email.split("@")[1]?.toLowerCase();
		const domainAllowed = await checkDomainAllowed(email);

		if (!domainAllowed) {
			console.log("Domain not allowed for backoffice:", domain);
			return null;
		}

		console.log(
			"User has allowed domain but no backoffice record - must be provisioned by admin",
		);
		return null;
	};

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

	const touchBackofficeSession = useCallback(
		async (session: Session, userId: string) => {
			const nowIso = new Date().toISOString();
			const sessionToken = session.access_token;
			if (!sessionToken) return;

			await supabase.from("backoffice_sessions").upsert(
				{
					user_id: userId,
					session_token: sessionToken,
					last_activity_at: nowIso,
					ended_at: null,
					end_reason: null,
				},
				{ onConflict: "session_token" },
			);

			await supabase
				.from("backoffice_sessions")
				.update({
					ended_at: nowIso,
					end_reason: "replaced",
				})
				.eq("user_id", userId)
				.neq("session_token", sessionToken)
				.is("ended_at", null);
		},
		[],
	);

	const fetchEffectivePermissions = async (
		backofficeUserId: string,
		role?: string,
	): Promise<string[]> => {
		void backofficeUserId;
		if (role === "super_admin") {
			return ["*"];
		}
		const { data, error } = await (supabase.rpc as any)(
			"backoffice_get_effective_permissions",
		);
		if (error) {
			console.error("Error fetching role template permissions:", error);
			return [];
		}
		return Array.from(new Set(((data as string[] | null) ?? []).filter(Boolean)));
	};

	const fetchEffectivePages = async (
		backofficeUserId: string,
		role?: string,
	): Promise<string[]> => {
		void backofficeUserId;
		if (role === "super_admin") {
			return ["*"];
		}
		const { data, error } = await (supabase.rpc as any)(
			"backoffice_get_effective_pages",
		);
		if (error) {
			console.error("Error fetching role assignment pages:", error);
			return [];
		}
		return Array.from(new Set(((data as string[] | null) ?? []).filter(Boolean)));
	};

	const hydrateFromSession = useCallback(
		async (session: Session | null) => {
			if (!session?.user) {
				clearAuthState();
				return;
			}

			const profile = await fetchProfile(session.user.id);
			const backofficeUser = await fetchBackofficeUser(
				session.user.id,
				session.user.email || "",
			);
			const effectivePermissions = backofficeUser
				? await fetchEffectivePermissions(backofficeUser.id, backofficeUser.role)
				: [];
			const effectivePages = backofficeUser
				? await fetchEffectivePages(backofficeUser.id, backofficeUser.role)
				: [];
			const totpVerifiedInSession =
				sessionStorage.getItem("backoffice_totp_verified") === "true";

			setState({
				user: session.user,
				session,
				profile,
				backofficeUser,
				isLoading: false,
				isAuthenticated: !!backofficeUser,
				isTotpVerified: backofficeUser?.totp_enabled
					? totpVerifiedInSession
					: true,
				requiresTotpSetup: !!backofficeUser && !!backofficeUser.totp_required,
				requiresPasswordChange: !!backofficeUser?.temp_password_required,
				effectivePermissions,
				effectivePages,
			});

			if (backofficeUser) {
				void touchBackofficeSession(session, session.user.id);
			}
		},
		[clearAuthState, touchBackofficeSession],
	);

	const initializeAuth = useCallback(async () => {
		let isMounted = true;

		try {
			const {
				data: { subscription },
			} = supabase.auth.onAuthStateChange((event, session) => {
				if (!isMounted) return;
				console.log("BackOffice auth state changed:", event);

				if (event === "SIGNED_OUT" || !session) {
					clearAuthState();
					return;
				}

				void hydrateFromSession(session).catch((error) => {
					console.error("BackOffice auth change handling error:", error);
					if (isMounted) {
						setState((prev) => ({ ...prev, isLoading: false }));
					}
				});
			});

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!isMounted) {
				subscription.unsubscribe();
				return;
			}

			if (session?.user) {
				await hydrateFromSession(session);
			} else {
				clearAuthState();
			}

			return () => {
				isMounted = false;
				subscription.unsubscribe();
			};
		} catch (error) {
			console.error("BackOffice auth initialization error:", error);
			if (isMounted) {
				clearAuthState();
			}
		}
	}, [clearAuthState, hydrateFromSession]);

	useEffect(() => {
		let cleanup: void | (() => void);

		initializeAuth().then((teardown) => {
			cleanup = teardown;
		});

		return () => {
			if (cleanup) cleanup();
		};
	}, [initializeAuth]);

	const signOut = async () => {
		setState((prev) => ({ ...prev, isLoading: true }));
		sessionStorage.removeItem("backoffice_totp_verified");
		if (state.user && state.session?.access_token) {
			await supabase
				.from("backoffice_sessions")
				.update({ ended_at: new Date().toISOString(), end_reason: "logout" })
				.eq("user_id", state.user.id)
				.eq("session_token", state.session.access_token)
				.is("ended_at", null);
		}
		await supabase.auth.signOut();
	};

	useEffect(() => {
		if (!state.session || !state.user || !state.backofficeUser) return;

		const interval = window.setInterval(() => {
			void touchBackofficeSession(state.session as Session, state.user!.id);
		}, 60_000);

		return () => window.clearInterval(interval);
	}, [state.session, state.user, state.backofficeUser, touchBackofficeSession]);

	const verifyTotp = async (token: string): Promise<boolean> => {
		if (!state.backofficeUser?.totp_secret) return false;

		try {
			const {
				data: { session },
				error: sessionError,
			} = await supabase.auth.getSession();

			if (sessionError || !session?.access_token) {
				console.error(
					"Missing/expired session while verifying TOTP",
					sessionError,
				);
				return false;
			}

			const response = await supabase.functions.invoke(
				"verify-backoffice-totp",
				{
					body: {
						token,
						accessToken: session.access_token,
					},
				},
			);

			if (response.error || !response.data?.valid) {
				if (response.error) {
					console.error("verify-backoffice-totp invoke error:", response.error);
				}
				return false;
			}

			sessionStorage.setItem("backoffice_totp_verified", "true");
			setState((prev) => ({ ...prev, isTotpVerified: true }));

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

	const setupTotp = async (secret: string): Promise<boolean> => {
		if (!state.user) return false;

		try {
			const { error } = await supabase
				.from("backoffice_users")
				.update({
					totp_secret: secret,
					totp_enabled: true,
				})
				.eq("user_id", state.user.id);

			if (error) {
				console.error("Error saving TOTP secret:", error);
				return false;
			}

			sessionStorage.setItem("backoffice_totp_verified", "true");
			setState((prev) => ({
				...prev,
				isTotpVerified: true,
				requiresTotpSetup: false,
				backofficeUser: prev.backofficeUser
					? {
							...prev.backofficeUser,
							totp_enabled: true,
							totp_secret: secret,
						}
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
		const backofficeUser = await fetchBackofficeUser(
			state.user.id,
			state.user.email || "",
		);
		const effectivePermissions = backofficeUser
			? await fetchEffectivePermissions(backofficeUser.id, backofficeUser.role)
			: [];
		const effectivePages = backofficeUser
			? await fetchEffectivePages(backofficeUser.id, backofficeUser.role)
			: [];
		setState((prev) => ({
			...prev,
			backofficeUser,
			isAuthenticated: !!backofficeUser,
			requiresTotpSetup: !!backofficeUser && !!backofficeUser.totp_required,
			requiresPasswordChange: !!backofficeUser?.temp_password_required,
			effectivePermissions,
			effectivePages,
		}));
	};

	const markPasswordChanged = () => {
		setState((prev) => ({
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
				hasBackofficePermission: (permissionKey: string) => {
					if (state.backofficeUser?.role === "super_admin") return true;
					return state.effectivePermissions.includes(permissionKey);
				},
				hasBackofficePageAccess: (pageKey: string) => {
					if (state.backofficeUser?.role === "super_admin") return true;
					return state.effectivePages.includes(pageKey);
				},
			}}
		>
			{children}
		</BackofficeAuthContext.Provider>
	);
}

export function useBackofficeAuth() {
	const context = useContext(BackofficeAuthContext);
	if (context === undefined) {
		throw new Error(
			"useBackofficeAuth must be used within a BackofficeAuthProvider",
		);
	}
	return context;
}
