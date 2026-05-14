import { useState, useEffect } from "react";
import { resolvePublicBookingSlugSync, resolveSlugFromCustomDomain } from "@/lib/slugResolution";

interface UseResolvedSlugOptions {
  routeSlug?: string;
  hostname: string;
  search: string;
  configuredBaseDomain?: string;
  isDev: boolean;
}

export function useResolvedSlug(options: UseResolvedSlugOptions) {
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Destructure options for stable dependencies
  const { routeSlug, hostname, search, configuredBaseDomain, isDev } = options;

  useEffect(() => {
    let mounted = true;

    async function resolve() {
      // First try synchronous resolution (subdomain, route param, query param)
      const syncSlug = resolvePublicBookingSlugSync({
        routeSlug,
        hostname,
        search,
        configuredBaseDomain,
        isDev
      });
      
      if (syncSlug) {
        if (mounted) {
          setSlug(syncSlug);
          setIsLoading(false);
        }
        return;
      }

      // If we couldn't resolve synchronously, try async custom domain resolution
      const customSlug = await resolveSlugFromCustomDomain(hostname);
      
      if (mounted) {
        setSlug(customSlug || undefined);
        setIsLoading(false);
      }
    }

    resolve();

    return () => {
      mounted = false;
    };
  }, [routeSlug, hostname, search, configuredBaseDomain, isDev]);

  return { slug, isLoading };
}
