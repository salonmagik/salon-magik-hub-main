export function customDomainsEnabled(): boolean {
  return Deno.env.get("CUSTOM_DOMAINS_ENABLED") === "true";
}

export function customDomainsPausedResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error:
        "Custom domains are temporarily paused while provider setup is finalized.",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
