/**
 * Custom-domain routing is paused for production-style builds while the
 * provider integration is finalized. Local Vite development remains enabled;
 * set VITE_CUSTOM_DOMAINS_ENABLED=true to enable it in a deployed build.
 */
export const CUSTOM_DOMAINS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_CUSTOM_DOMAINS_ENABLED === "true";
