/** Custom domains remain hidden in production-style builds until the provider is finalized. */
export const CUSTOM_DOMAINS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_CUSTOM_DOMAINS_ENABLED === "true";
